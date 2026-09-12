"""Step 2 — turn the real pond data into a training file.

YOU ONLY EDIT ONE THING IN THIS FILE: the COLUMN_MAP below.

Everything else is written. Your job is to look at the output of
inspect_atp3.py and fill in which column name in the real data matches each
thing we need. That is it.

    python3 packages/models/train/load_atp3.py

It writes packages/models/data/crash_real.csv, which train_all.py can then
learn from instead of our simulator.
"""

import csv
import pathlib
import sys
from datetime import datetime

DATA = pathlib.Path(__file__).parent.parent / "data" / "atp3"
OUT = pathlib.Path(__file__).parent.parent / "data" / "crash_real.csv"

# ---------------------------------------------------------------------------
# EDIT THIS PART. Nothing else.
#
# On the left is what we need. On the right, put the column name exactly as it
# appears in the real data — copy and paste it, including capitals and spaces.
#
# If a measurement genuinely is not in the file, leave it as None and the
# script will cope.
# ---------------------------------------------------------------------------
COLUMN_MAP = {
    "timestamp": None,      # e.g. "Date_Time" or "SampleDate"
    "pond_id": None,        # e.g. "Site" or "Pond_ID" — which pond this row is
    "ph": None,             # e.g. "pH"
    "temperature_c": None,  # e.g. "Temp_C" or "Water Temperature"
    "dissolved_oxygen": None,   # e.g. "DO_mgL"
    "optical_density": None,    # e.g. "OD750" or "AFDW_g_L"
}

# Which file inside data/atp3/ to read. Use the path exactly as inspect_atp3.py
# printed it, e.g. "instrumentation/arizona_2014.csv".
SOURCE_FILE = None

# ---------------------------------------------------------------------------
# Nothing below here needs editing.
# ---------------------------------------------------------------------------

HEADER = [
    "ph", "do_mgl", "temp_c", "od",
    "ph_trend", "do_trend", "od_trend", "temp_trend",
    "ph_mean", "od_mean", "label",
]

WINDOW_HOURS = 48
COLLAPSE_FRACTION = 0.67  # lost a third of its density


def die(msg: str) -> None:
    sys.exit(f"\n{msg}\n")


def check_setup() -> pathlib.Path:
    if SOURCE_FILE is None:
        die(
            "SOURCE_FILE is still None.\n\n"
            "Run inspect_atp3.py first, pick the file with 15-minute pond\n"
            "readings in it, and put its path at the top of this file."
        )
    path = DATA / SOURCE_FILE
    if not path.exists():
        die(f"{path} does not exist. Check the path you put in SOURCE_FILE.")

    missing = [k for k, v in COLUMN_MAP.items() if v is None and k != "pond_id"]
    if missing:
        die(
            "These still need a column name in COLUMN_MAP:\n  "
            + "\n  ".join(missing)
            + "\n\nRun inspect_atp3.py to see what the real names are."
        )
    return path


def parse_time(raw: str):
    """ATP3 files use a few date formats; try the common ones."""
    for fmt in (
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M",
        "%m/%d/%y %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def num(row: dict, key: str):
    col = COLUMN_MAP[key]
    if col is None:
        return None
    raw = (row.get(col) or "").strip()
    if raw in ("", "NA", "N/A", "null", "-"):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def main() -> None:
    path = check_setup()

    with path.open(encoding="utf-8", errors="replace") as fh:
        rows = list(csv.DictReader(fh))
    print(f"read {len(rows):,} rows from {SOURCE_FILE}")

    # Group by pond so a window never spans two different ponds.
    ponds: dict[str, list] = {}
    for r in rows:
        pond = r.get(COLUMN_MAP["pond_id"], "all") if COLUMN_MAP["pond_id"] else "all"
        ts = parse_time(r.get(COLUMN_MAP["timestamp"], ""))
        if ts is None:
            continue
        point = {
            "t": ts,
            "ph": num(r, "ph"),
            "do": num(r, "dissolved_oxygen"),
            "temp": num(r, "temperature_c"),
            "od": num(r, "optical_density"),
        }
        if point["od"] is None or point["ph"] is None:
            continue
        ponds.setdefault(pond, []).append(point)

    out_rows, positives = [], 0

    for pond, points in ponds.items():
        points.sort(key=lambda p: p["t"])
        if len(points) < 8:
            continue

        # Readings may be 15-minute or thrice-weekly depending on the file, so
        # windows are built by TIME rather than by row count.
        for i, start in enumerate(points):
            win_end = start["t"].timestamp() + WINDOW_HOURS * 3600
            window = [p for p in points[i:] if p["t"].timestamp() <= win_end]
            if len(window) < 4:
                continue

            future_end = win_end + WINDOW_HOURS * 3600
            future = [
                p for p in points[i + len(window):]
                if p["t"].timestamp() <= future_end
            ]
            if not future:
                continue

            first, last = window[0], window[-1]
            hours = max(1.0, (last["t"] - first["t"]).total_seconds() / 3600)

            def d(key: str) -> float:
                a, b = first.get(key), last.get(key)
                return 0.0 if a is None or b is None else (b - a) / hours

            def mean(key: str) -> float:
                vals = [p[key] for p in window if p[key] is not None]
                return sum(vals) / len(vals) if vals else 0.0

            od_now = last["od"] or 0.0
            od_later = min((p["od"] for p in future if p["od"] is not None), default=od_now)
            label = 1 if od_now > 0.05 and od_later < od_now * COLLAPSE_FRACTION else 0
            positives += label

            out_rows.append([
                f'{last["ph"] or 0:.4f}', f'{last["do"] or 0:.4f}',
                f'{last["temp"] or 0:.4f}', f"{od_now:.4f}",
                f'{d("ph"):.6f}', f'{d("do"):.6f}',
                f'{d("od"):.6f}', f'{d("temp"):.6f}',
                f'{mean("ph"):.4f}', f'{mean("od"):.4f}', label,
            ])

    if not out_rows:
        die(
            "No usable windows were produced.\n\n"
            "Usually this means the timestamp column was not parsed. Send the\n"
            "first few rows of the file back and we will adjust the formats."
        )

    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(HEADER)
        w.writerows(out_rows)

    pct = positives / len(out_rows) * 100
    print(f"wrote {OUT}")
    print(f"  {len(out_rows):,} windows, {positives:,} crashes ({pct:.1f}%)")
    if positives < 20:
        print("\n  WARNING: very few crashes found. The model needs perhaps 50+")
        print("  to learn anything. Try another site's file, or say so.")


if __name__ == "__main__":
    main()
