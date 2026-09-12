"""Step 1 — look at what is inside the downloaded data.

You do not need to understand this file. Run it, copy the output, send it back.

    python3 packages/models/train/inspect_atp3.py

It finds every spreadsheet under packages/models/data/atp3/ and prints its
column names and first two rows. That tells us which columns hold pH,
temperature and so on, so the next script can be pointed at the right ones.
"""

import pathlib
import sys

DATA = pathlib.Path(__file__).parent.parent / "data" / "atp3"

if not DATA.exists():
    sys.exit(
        f"Nothing found at {DATA}\n\n"
        "Download the ATP3 Unified Field Study data, unzip it, and put the\n"
        "files in that folder. Then run this again."
    )

files = sorted(
    p for p in DATA.rglob("*")
    if p.suffix.lower() in {".csv", ".xlsx", ".xls", ".txt"}
)

if not files:
    sys.exit(f"{DATA} exists but has no .csv or .xlsx files in it.")

print(f"Found {len(files)} data files under {DATA}\n")
print("=" * 70)

for f in files:
    rel = f.relative_to(DATA)
    size_kb = f.stat().st_size / 1024
    print(f"\nFILE: {rel}   ({size_kb:,.0f} KB)")
    print("-" * 70)

    try:
        if f.suffix.lower() in {".csv", ".txt"}:
            with f.open(encoding="utf-8", errors="replace") as fh:
                lines = [next(fh, "").rstrip("\n") for _ in range(3)]
            print("COLUMNS:", lines[0][:600])
            if lines[1]:
                print("ROW 1  :", lines[1][:600])
            if lines[2]:
                print("ROW 2  :", lines[2][:600])
        else:
            try:
                import pandas as pd
            except ImportError:
                print("  (Excel file — need pandas to read it.)")
                print("  Run: pip install pandas openpyxl --break-system-packages")
                continue
            book = pd.read_excel(f, sheet_name=None, nrows=2)
            for sheet, df in book.items():
                print(f"  SHEET: {sheet}")
                print(f"  COLUMNS: {list(df.columns)[:40]}")
    except Exception as e:  # noqa: BLE001 — we want to keep going past a bad file
        print(f"  could not read: {e}")

print("\n" + "=" * 70)
print("\nDone. Copy everything above and send it back.")
