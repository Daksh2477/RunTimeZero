# Real ATP3 ML Integration

## Overview

This document records the real-data machine-learning work completed for the RunTimeZero algae carbon-sequestration platform.

The objective was to replace the simulator-generated crash-training data with real ATP3 algae pond observations while keeping the existing model/artifact interface compatible with the application.

## What We Changed

### 1. Added the real ATP3 datasets

The ATP3 Unified Field Study data was placed under:

```text
packages/models/data/atp3/
```

The two files used for the crash model were:

- `ATP3-UFS-Instrumentation.csv`
- `ATP3-UFS-PondOperationalData (1).csv`

The datasets contain different measurements:

| Dataset | Important fields |
|---|---|
| Instrumentation | `PondID`, `DateTime`, `Date`, `pH`, `Temp (C)`, `DO (mg.L)` |
| Pond Operational Data | `PondID`, `DATETIME`, `OD750` |

The ATP3 data does not provide DO and OD in the same CSV, so the pipeline combines the two sources by `PondID + Date`.

## 2. Validated the ATP3 data structure

The instrumentation dataset contained:

- 1,091,261 raw rows
- Pond IDs `P1` through `P8`
- 3,279 pond-day combinations

The operational dataset contained:

- 15,290 raw rows
- Pond IDs `P1` through `P8`, plus `inoc`
- 2,601 pond-days containing OD measurements

The datasets had 2,597 matching usable pond-days after the required fields were combined.

The `inoc` operational records were excluded because they are not cultivation ponds.

## 3. Created the real training dataset

The loader was updated in:

```text
packages/models/train/load_atp3.py
```

The loader:

1. Reads the high-frequency instrumentation data.
2. Aggregates pH, temperature and dissolved oxygen to daily pond values.
3. Reads operational OD750 measurements.
4. Aggregates multiple OD measurements occurring on the same pond-day.
5. Joins the two sources using `PondID + Date`.
6. Calculates trend features.
7. Creates the crash label from an observed OD decline within the 48-hour prediction window.
8. Writes the unified training dataset.

Output:

```text
packages/models/data/crash_real.csv
```

### Real training dataset

The generated dataset contains:

- **2,597 rows**
- **2,372 normal samples**
- **225 crash-labelled samples**
- **8.66% positive/crash rate**

Columns:

```text
ph
do_mgl
temp_c
od
ph_trend
do_trend
od_trend
temp_trend
ph_mean
od_mean
label
```

## 4. Missing-value handling

A validation check found:

- `ph`: 0 missing
- `do_mgl`: 0 missing
- `temp_c`: **65 missing**
- `od`: 0 missing
- All trend/mean fields: 0 missing
- `label`: 0 missing

The training pipeline was therefore updated to median-impute missing numeric feature values before model fitting.

This preserves the real pond-day samples rather than deleting them.

## 5. Retrained the crash classifier

The crash model was updated in:

```text
packages/models/train/train_all.py
```

The crash classifier now loads:

```text
crash_real.csv
```

instead of the simulator-generated:

```text
crash.csv
```

The model remains a logistic regression with:

- StandardScaler
- `class_weight="balanced"`
- deterministic random seed `42`
- 75/25 train/test split
- stratification by crash label

### Crash model result

The real ATP3 crash model achieved:

```text
ROC-AUC: 0.586
Rows: 2,597
Positive rate: 8.7%
```

This result is reported as ROC-AUC, not as accuracy.

The 0.586 AUC should **not** be described as 58.6% accuracy.

## 6. Existing model datasets were regenerated

The original simulator/training-data generator was also run successfully:

```text
npm run models:data
```

It generated:

```text
crash.csv          6,400 rows
divergence.csv     1,600 rows
ndci.csv           8,400 rows
```

The real ATP3 crash dataset remains separate as:

```text
crash_real.csv     2,597 rows
```

## 7. Trained all model artifacts

The complete training pipeline was run successfully with Python:

```text
python packages/models/train/train_all.py
```

Results:

| Model | Dataset | Result |
|---|---|---:|
| Crash classifier | Real ATP3 | **ROC-AUC 0.586** |
| Divergence classifier | Generated dataset | **Accuracy 0.922** |
| NDCI biomass | Generated dataset | **R² 0.181** |

The prediction interval reported for the NDCI model was:

```text
0.72x – 1.26x
```

## 8. Generated model artifacts

The following artifacts were successfully created under:

```text
packages/models/artifacts/
```

```text
crash_classifier.json
crash_classifier.meta.json

divergence_classifier.json
divergence_classifier.meta.json

ndci_biomass.json
ndci_biomass.meta.json
```

The crash metadata records the real ATP3 training result.

## 9. Physics build dependency

The model-data generator required the project's Rust/WASM physics package.

The physics package was successfully compiled with:

```text
npm run physics:build
```

`wasm-pack` was installed because it was missing from the Windows environment.

The generated Node WASM package was verified at:

```text
packages/physics/pkg/rtz_physics.js
```

The Windows-specific `mkdir -p` / `cp` portion of the web build script reported a shell syntax error after the WASM packages themselves had been generated. This did not prevent the model-data generation from succeeding.

## 10. Verification performed

The following checks were completed successfully:

### Real ATP3 inspection

```text
python packages/models/train/inspect_atp3.py
```

### Real dataset generation

```text
python packages/models/train/load_atp3.py
```

### Dataset verification

The generated `crash_real.csv` was verified to contain:

- 2,597 rows
- 11 expected columns
- numeric feature values
- binary crash labels

### Model training

```text
python packages/models/train/train_all.py
```

completed successfully for all three models.

## 11. Git branch and commit

The work was isolated from `main` on:

```text
real-atp3-ml
```

Commit:

```text
8a06647
feat(models): train crash classifier on real ATP3 data
```

The branch was pushed to the GitHub repository:

```text
https://github.com/Daksh2477/RunTimeZero
```

## Reproducibility

From a correctly configured development environment, the main real-data pipeline is:

```text
ATP3 raw CSVs
      ↓
load_atp3.py
      ↓
crash_real.csv
      ↓
train_all.py
      ↓
crash_classifier.json
crash_classifier.meta.json
```

The real-data crash model can be regenerated with:

```powershell
python packages\models\train\load_atp3.py
python packages\models\train\train_all.py
```

## Important Reporting Notes

1. The **0.586 value is ROC-AUC**, not accuracy.
2. The crash classifier is trained on **real ATP3 data**.
3. The divergence and NDCI models in this training run still use the project's generated datasets.
4. Model predictions are not, by themselves, proof of creditable carbon removal.
5. The reported metrics should be presented honestly, including the lower real-data crash AUC.

## Suggested Hackathon Explanation

> We integrated real ATP3 algae pond data into our machine-learning pipeline. Because ATP3 stores dissolved oxygen and optical density in separate resources, we aligned them by pond and date, aggregated the measurements, and created a unified 2,597-row training dataset. We then retrained the crash classifier on those real observations and achieved a ROC-AUC of 0.586. We keep the model artifacts inspectable as JSON so the training parameters and reported metrics can be reviewed rather than treating the model as a black box.
