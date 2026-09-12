"""Turn the real ATP3 field data into a training file.

Merged from Daksh's `real-atp3-ml` branch. The file names, the real column
spellings, the two-file join and the date parsing are his — that is the part
that needed the actual dataset in hand, and none of it could be guessed.

Two things are changed from his version.

1. HEADER now matches `make_dataset.ts`. The feature set grew from 10 to 21
   after he branched. `scripts/check-feature-contract.mjs` enforces this.

2. The intra-day readings are kept rather than averaged away. His version
   collapsed instrumentation to one point per pond-day, which loses the
   dissolved-oxygen swing between day and night — and that swing is the
   single best early warning the probes give, because a pond that stops
   swinging has stopped photosynthesising before its density visibly drops.
   The instrumentation file carries DateTime, so the swing is recoverable.

Five columns genuinely are not in ATP3: pond geometry, harvest timing and
energy metering. They are written as constants, and `train_all.py` drops
constant columns and prints which ones. The column keeps its place in the
contract; the model does not pretend to use it.

    python3 packages/models/train/load_atp3.py
"""

import csv
import math
import pathlib
import statistics
import sys
from datetime import datetime

DATA = pathlib.Path(__file__).parent.parent / "data" / "atp3"
OUT = pathlib.Path(__file__).parent.parent / "data" / "crash_real.csv"

INSTRUMENTATION_FILE = "ATP3-UFS-Instrumentation.csv"
OPERATIONAL_FILE = "ATP3-UFS-PondOperationalData (1).csv"

# Must match CRASH_HEADER in make_dataset.ts exactly, including order.
HEADER = [
    "ph", "do_mgl", "temp_c", "od",
    "ph_trend", "do_trend", "od_trend", "temp_trend",
    "ph_mean", "od_mean",
    "do_amplitude", "ph_amplitude", "od_volatility", "temp_amplitude",
    "depth_m", "log_area", "season_sin", "season_cos", "hours_since_harvest",
    "energy_kwh_mean", "mixing_uptime",
    "pond_group", "label",
]

# ATP3 ponds were ~1000 L raceways. Correct these if the documentation
# packaged with the download says otherwise.
POND_DEPTH_M = 0.20
POND_AREA_M2 = 5.0

# Not recoverable from ATP3: no harvest log, no energy metering.
UNAVAILABLE = {"hours_since_harvest": 0.0, "energy_kwh_mean": 0.0, "mixing_uptime": 1.0}

COLLAPSE_FRACTION = 0.67
LOOKAHEAD_DAYS = 2


def die(message):
    sys.exit(f"\n{message}\n")


def parse_time(raw):
    if not raw:
        return None
    raw = raw.strip()
    for fmt in (
        "%m-%d-%Y %H:%M", "%m-%d-%Y", "%m/%d/%Y %H:%M", "%m/%d/%Y",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    return None


def to_float(value):
    if value is None:
        return None
    value = str(value).strip()
    if not value or value.upper() in {"NA", "N/A", "NAN", "NULL", "-"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def mean(values):
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def spread(values):
    """Max minus min — the diurnal swing, when the day's readings are passed."""
    vals = [v for v in values if v is not None]
    return max(vals) - min(vals) if len(vals) >= 2 else 0.0


def deviation(values):
    vals = [v for v in values if v is not None]
    return statistics.pstdev(vals) if len(vals) >= 2 else 0.0


def trend(current, previous):
    if current is None or previous is None:
        return 0.0
    return current - previous


def read_instrumentation():
    """Probe readings, keyed (pond, date), keeping every reading in the day."""
    path = DATA / INSTRUMENTATION_FILE
    if not path.exists():
        die(
            f"Instrumentation file not found:\n{path}\n\n"
            "Download the ATP3 Unified Field Study from data.nrel.gov/submissions/76\n"
            "and unzip it into packages/models/data/atp3/."
        )

    print(f"Reading instrumentation: {path.name}")
    ponds = {}
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        required = ["PondID", "DateTime", "Date", "pH", "Temp (C)", "DO (mg.L)"]
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            die("Instrumentation file is missing columns: " + ", ".join(missing))

        for row in reader:
            pond = (row.get("PondID") or "").strip()
            stamp = parse_time(row.get("DateTime")) or parse_time(row.get("Date"))
            if not pond or stamp is None:
                continue
            bucket = ponds.setdefault((pond, stamp.date()), {"ph": [], "temp": [], "do": []})
            bucket["ph"].append(to_float(row.get("pH")))
            bucket["temp"].append(to_float(row.get("Temp (C)")))
            bucket["do"].append(to_float(row.get("DO (mg.L)")))

    print(f"  {len(ponds):,} pond-days")
    return ponds


def read_operational():
    """Optical density, keyed (pond, date). One reading per pond-day."""
    path = DATA / OPERATIONAL_FILE
    if not path.exists():
        die(f"Operational file not found:\n{path}")

    print(f"Reading operational: {path.name}")
    ponds = {}
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in ("PondID", "DATETIME", "OD750") if c not in (reader.fieldnames or [])]
        if missing:
            die("Operational file is missing columns: " + ", ".join(missing))

        for row in reader:
            pond = (row.get("PondID") or "").strip()
            # "inoc" rows are the starter culture, not a pond.
            if not pond or pond == "inoc":
                continue
            stamp = parse_time(row.get("DATETIME"))
            od = to_float(row.get("OD750"))
            if stamp is None or od is None:
                continue
            ponds[(pond, stamp.date())] = od

    print(f"  {len(ponds):,} pond-days")
    return ponds


def combine(instrumentation, operational):
    """Join on (pond, date), keeping the day's spread as well as its mean."""
    combined = {}
    for key in set(instrumentation) & set(operational):
        inst = instrumentation[key]
        ph, od = mean(inst["ph"]), operational[key]
        if ph is None or od is None:
            continue
        combined[key] = {
            "date": key[1],
            "ph": ph,
            "temp": mean(inst["temp"]),
            "do": mean(inst["do"]),
            "od": od,
            # The part Daksh's version averaged away.
            "do_amp": spread(inst["do"]),
            "ph_amp": spread(inst["ph"]),
            "temp_amp": spread(inst["temp"]),
            "readings": len(inst["ph"]),
        }
    print(f"\nMatched pond-days: {len(combined):,}")
    return combined


def make_rows(combined):
    by_pond = {}
    for (pond, _), values in combined.items():
        by_pond.setdefault(pond, []).append(values)

    rows, positives, with_swing = [], 0, 0

    for group, pond in enumerate(sorted(by_pond)):
        points = sorted(by_pond[pond], key=lambda x: x["date"])

        for i, now in enumerate(points):
            prev = points[i - 1] if i > 0 else None
            history = points[max(0, i - 2): i + 1]

            # Label: density falls by a third within the lookahead window.
            #
            # The LOWEST reading in the window, not the first one. Daksh's
            # version took the first, which misses any crash that develops
            # over more than a day — a pond falling 22% per day never trips
            # the 33% test on day one and is labelled healthy while it dies.
            # make_dataset.ts uses the minimum for the same reason.
            future_ods = [
                nxt["od"] for nxt in points[i + 1:]
                if (nxt["date"] - now["date"]).days <= LOOKAHEAD_DAYS
                and nxt["od"] is not None
            ]
            future_od = min(future_ods) if future_ods else None

            label = int(
                future_od is not None
                and now["od"] > 0.05
                and future_od < now["od"] * COLLAPSE_FRACTION
            )
            positives += label
            if now["readings"] >= 2:
                with_swing += 1

            doy = now["date"].timetuple().tm_yday
            rows.append([
                round(now["ph"], 4),
                round(now["do"] or 0.0, 4),
                round(now["temp"] or 0.0, 4),
                round(now["od"], 4),
                round(trend(now["ph"], prev["ph"] if prev else None), 6),
                round(trend(now["do"], prev["do"] if prev else None), 6),
                round(trend(now["od"], prev["od"] if prev else None), 6),
                round(trend(now["temp"], prev["temp"] if prev else None), 6),
                round(mean([x["ph"] for x in history]) or 0.0, 4),
                round(mean([x["od"] for x in history]) or 0.0, 4),
                round(now["do_amp"], 4),
                round(now["ph_amp"], 4),
                round(deviation([x["od"] for x in history]), 6),
                round(now["temp_amp"], 4),
                POND_DEPTH_M,
                round(math.log10(max(1.0, POND_AREA_M2)), 4),
                round(math.sin(2 * math.pi * doy / 365), 6),
                round(math.cos(2 * math.pi * doy / 365), 6),
                UNAVAILABLE["hours_since_harvest"],
                UNAVAILABLE["energy_kwh_mean"],
                UNAVAILABLE["mixing_uptime"],
                group,
                label,
            ])

    return rows, positives, with_swing


def main():
    rows, positives, with_swing = make_rows(
        combine(read_instrumentation(), read_operational())
    )

    if not rows:
        die(
            "No usable rows were produced.\n\n"
            "Usually this means the timestamp column did not parse. Send the\n"
            "first few lines of each file back and we will add the format."
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(HEADER)
        writer.writerows(rows)

    pct = positives / len(rows) * 100
    print(f"\nwrote {OUT}")
    print(f"  {len(rows):,} rows, {positives:,} crashes ({pct:.1f}%)")
    print(f"  {with_swing:,} rows have a real intra-day swing "
          f"({with_swing / len(rows) * 100:.0f}%)")
    print("\n  Written as constants because ATP3 does not record them:")
    print("    " + ", ".join(sorted(UNAVAILABLE)) + ", depth_m, log_area")
    print("  train_all.py drops constant columns and reports which.")
    if positives < 20:
        print("\n  WARNING: very few crashes. The model needs perhaps 50+.")


if __name__ == "__main__":
    main()
