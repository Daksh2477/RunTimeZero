import csv
import pathlib
import statistics
from datetime import datetime, timedelta


DATA = pathlib.Path(__file__).parent.parent / "data" / "atp3"
OUT = pathlib.Path(__file__).parent.parent / "data" / "crash_real.csv"


# -------------------------------------------------------------------
# ATP3 files
# -------------------------------------------------------------------

INSTRUMENTATION_FILE = "ATP3-UFS-Instrumentation.csv"
OPERATIONAL_FILE = "ATP3-UFS-PondOperationalData (1).csv"


HEADER = [
    "ph",
    "do_mgl",
    "temp_c",
    "od",
    "ph_trend",
    "do_trend",
    "od_trend",
    "temp_trend",
    "ph_mean",
    "od_mean",
    "label",
]


WINDOW_HOURS = 48
COLLAPSE_FRACTION = 0.67


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def die(message):
    raise SystemExit(f"\nERROR: {message}\n")


def parse_time(raw):
    if not raw:
        return None

    raw = raw.strip()

    formats = [
        "%m-%d-%Y %H:%M",
        "%m-%d-%Y",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass

    return None


def to_float(value):
    if value is None:
        return None

    value = str(value).strip()

    if value == "":
        return None

    try:
        return float(value)
    except ValueError:
        return None


def mean(values):
    values = [v for v in values if v is not None]

    if not values:
        return None

    return statistics.mean(values)


def safe_trend(current, previous):
    if current is None or previous is None:
        return 0.0

    return current - previous


# -------------------------------------------------------------------
# Read instrumentation data
#
# Contains:
#   pH
#   temperature
#   dissolved oxygen
#
# Does NOT contain OD.
# -------------------------------------------------------------------

def read_instrumentation():
    path = DATA / INSTRUMENTATION_FILE

    if not path.exists():
        die(f"Instrumentation file not found:\n{path}")

    print(f"Reading instrumentation: {path.name}")

    ponds = {}

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        required = [
            "PondID",
            "DateTime",
            "Date",
            "pH",
            "Temp (C)",
            "DO (mg.L)",
        ]

        missing = [c for c in required if c not in reader.fieldnames]

        if missing:
            die(
                "Instrumentation file is missing columns: "
                + ", ".join(missing)
            )

        rows = 0

        for row in reader:
            rows += 1

            pond = row.get("PondID", "").strip()

            if not pond or pond == "inoc":
                continue

            raw_time = row.get("DateTime") or row.get("Date")
            timestamp = parse_time(raw_time)

            if timestamp is None:
                continue

            ph = to_float(row.get("pH"))
            temp = to_float(row.get("Temp (C)"))
            do = to_float(row.get("DO (mg.L)"))

            key = (pond, timestamp.date())

            ponds.setdefault(key, {
                "times": [],
                "ph": [],
                "temp": [],
                "do": [],
            })

            ponds[key]["times"].append(timestamp)

            if ph is not None:
                ponds[key]["ph"].append(ph)

            if temp is not None:
                ponds[key]["temp"].append(temp)

            if do is not None:
                ponds[key]["do"].append(do)

    print(f"  Raw instrumentation rows: {rows}")
    print(f"  Pond-days: {len(ponds)}")

    return ponds


# -------------------------------------------------------------------
# Read operational data
#
# Contains:
#   OD750
#   biomass-related measurements
#
# Does NOT contain DO.
#
# There can be multiple OD measurements per pond per day, so we
# aggregate them to one daily OD value.
# -------------------------------------------------------------------

def read_operational():
    path = DATA / OPERATIONAL_FILE

    if not path.exists():
        die(f"Operational file not found:\n{path}")

    print(f"Reading operational: {path.name}")

    ponds = {}

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        required = [
            "PondID",
            "DATETIME",
            "OD750",
        ]

        missing = [c for c in required if c not in reader.fieldnames]

        if missing:
            die(
                "Operational file is missing columns: "
                + ", ".join(missing)
            )

        rows = 0

        for row in reader:
            rows += 1

            pond = row.get("PondID", "").strip()

            if not pond or pond == "inoc":
                continue

            timestamp = parse_time(row.get("DATETIME"))

            if timestamp is None:
                continue

            od = to_float(row.get("OD750"))

            if od is None:
                continue

            key = (pond, timestamp.date())

            ponds.setdefault(key, [])

            ponds[key].append(od)

    daily_od = {}

    for key, values in ponds.items():
        daily_od[key] = mean(values)

    print(f"  Raw operational rows: {rows}")
    print(f"  Pond-days with OD: {len(daily_od)}")

    return daily_od


# -------------------------------------------------------------------
# Build unified daily dataset
# -------------------------------------------------------------------

def build_dataset(instrumentation, operational):

    print("\nCombining instrumentation + operational data...")

    combined = {}

    common_keys = set(instrumentation.keys()) & set(operational.keys())

    for key in common_keys:

        inst = instrumentation[key]

        ph = mean(inst["ph"])
        temp = mean(inst["temp"])
        do = mean(inst["do"])
        od = operational[key]

        # We need the important biological measurements.
        if ph is None or od is None:
            continue

        combined[key] = {
            "date": key[1],
            "ph": ph,
            "temp": temp,
            "do": do,
            "od": od,
        }

    print(f"  Matching pond-days: {len(common_keys)}")
    print(f"  Usable unified pond-days: {len(combined)}")

    return combined


# -------------------------------------------------------------------
# Create crash prediction features
#
# Current row:
#   current pH
#   current DO
#   current temperature
#   current OD
#
# Trend:
#   change compared with previous available pond-day
#
# Mean:
#   current + previous available observations
#
# Label:
#   1 when OD falls below 67% of the current OD within the next
#   48 hours.
# -------------------------------------------------------------------

def make_training_rows(combined):

    by_pond = {}

    for (pond, date), values in combined.items():
        by_pond.setdefault(pond, []).append(values)

    output_rows = []

    for pond in sorted(by_pond):

        points = sorted(
            by_pond[pond],
            key=lambda x: x["date"]
        )

        for index, current in enumerate(points):

            current_date = current["date"]

            # Previous available point.
            previous = None

            if index > 0:
                previous = points[index - 1]

            # Previous history for rolling means.
            history_start = max(0, index - 2)
            history = points[history_start:index + 1]

            ph_mean = mean([x["ph"] for x in history])
            od_mean = mean([x["od"] for x in history])

            ph_trend = safe_trend(
                current["ph"],
                previous["ph"] if previous else None
            )

            do_trend = safe_trend(
                current["do"],
                previous["do"] if previous else None
            )

            od_trend = safe_trend(
                current["od"],
                previous["od"] if previous else None
            )

            temp_trend = safe_trend(
                current["temp"],
                previous["temp"] if previous else None
            )

            # -------------------------------------------------------
            # Look forward 48 hours.
            #
            # We use the next available OD measurement inside the
            # 48-hour window instead of requiring an exact timestamp.
            # -------------------------------------------------------

            future_od = None

            for future in points[index + 1:]:

                delta_days = (
                    future["date"] - current_date
                ).days

                if delta_days > 2:
                    break

                if future["od"] is not None:
                    future_od = future["od"]
                    break

            label = 0

            if (
                future_od is not None
                and current["od"] > 0.05
                and future_od < current["od"] * COLLAPSE_FRACTION
            ):
                label = 1

            output_rows.append([
                current["ph"],
                current["do"],
                current["temp"],
                current["od"],
                ph_trend,
                do_trend,
                od_trend,
                temp_trend,
                ph_mean,
                od_mean,
                label,
            ])

    return output_rows


# -------------------------------------------------------------------
# Write dataset
# -------------------------------------------------------------------

def write_dataset(rows):

    OUT.parent.mkdir(parents=True, exist_ok=True)

    with OUT.open(
        "w",
        encoding="utf-8",
        newline=""
    ) as f:

        writer = csv.writer(f)

        writer.writerow(HEADER)

        writer.writerows(rows)

    print(f"\nWrote: {OUT}")
    print(f"Rows: {len(rows)}")

    crash_count = sum(
        1 for row in rows
        if str(row[-1]) == "1"
    )

    normal_count = len(rows) - crash_count

    print(f"Normal samples: {normal_count}")
    print(f"Crash samples:  {crash_count}")

    if rows:
        percentage = crash_count / len(rows) * 100
        print(f"Crash percentage: {percentage:.2f}%")


# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------

def main():

    print("=" * 60)
    print("ATP3 REAL-DATA CRASH DATASET BUILDER")
    print("=" * 60)

    instrumentation = read_instrumentation()

    operational = read_operational()

    combined = build_dataset(
        instrumentation,
        operational
    )

    if not combined:
        die(
            "No matching instrumentation + operational pond-days "
            "were found."
        )

    rows = make_training_rows(combined)

    if not rows:
        die(
            "No training rows were generated."
        )

    write_dataset(rows)

    print("\nSUCCESS: ATP3 real-data crash dataset created.")


if __name__ == "__main__":
    main()