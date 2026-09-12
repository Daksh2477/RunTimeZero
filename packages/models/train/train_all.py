"""Train the models and export them as inspectable JSON.

WHY JSON AND NOT ONNX

An earlier plan exported ONNX and ran `onnxruntime-node`. That is a 100 MB+
runtime dependency for what are, in the end, a logistic regression and a small
forest — and inference for those is about thirty lines of TypeScript.

JSON coefficients also fit what this project argues: every number we publish
should be checkable. A judge can open `artifacts/crash_classifier.json` and read
the weights. They cannot read an ONNX graph.

Training stays real scikit-learn, offline. Python never enters the request path.

    npm run models:data      # generate datasets from the twin
    npm run models:train     # this file
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

HERE = pathlib.Path(__file__).parent
DATA = HERE.parent / "data"
ARTIFACTS = HERE.parent / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

SEED = 42

# Which file train_crash() learns from. Change this one line to "crash_real.csv"
# after load_atp3.py has produced it — see packages/models/HANDOFF.md step 4.
CRASH_SOURCE = "crash.csv"


def load(name: str):
    """Read a CSV written by make_dataset.ts."""
    path = DATA / name
    if not path.exists():
        raise SystemExit(f"{path} missing — run `npm run models:data` first")
    raw = np.genfromtxt(path, delimiter=",", names=True)
    cols = list(raw.dtype.names)
    matrix = np.array([raw[c] for c in cols]).T
    return cols, matrix


def train_crash() -> None:
    """Culture collapse within 48 h.

    Logistic regression rather than a forest, on purpose: the operator is being
    told to drain and re-inoculate a pond, and "pH is falling while density
    drops" is an explanation they can act on. A forest would score slightly
    better and explain nothing.
    """
    cols, m = load(CRASH_SOURCE)
    X, y = m[:, :-1], m[:, -1].astype(int)
    names = cols[:-1]

    # Real data will not carry every column the twin can produce — ATP3 has no
    # harvest log, for instance, so hours_since_harvest arrives as a constant.
    # A constant column teaches the model nothing and gives StandardScaler a
    # zero scale, so drop it and say so rather than training on a dead input.
    varying = X.std(axis=0) > 1e-9
    if not varying.all():
        dropped = [n for n, keep in zip(names, varying) if not keep]
        print(f"    dropped {len(dropped)} constant column(s): {', '.join(dropped)}")
        X = X[:, varying]
        names = [n for n, keep in zip(names, varying) if keep]

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=SEED, stratify=y
    )

    scaler = StandardScaler().fit(X_tr)
    # Crashes are ~9% of rows, so without class_weight the model learns to
    # answer "no" and reports 91% accuracy while being useless.
    clf = LogisticRegression(
        max_iter=2000, class_weight="balanced", random_state=SEED
    ).fit(scaler.transform(X_tr), y_tr)

    proba = clf.predict_proba(scaler.transform(X_te))[:, 1]
    auc = roc_auc_score(y_te, proba)
    pred = (proba >= 0.5).astype(int)
    cm = confusion_matrix(y_te, pred).tolist()

    save(
        "crash_classifier",
        {
            "kind": "logistic_regression",
            "features": names,
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
            "coef": clf.coef_[0].tolist(),
            "intercept": float(clf.intercept_[0]),
            "threshold": 0.5,
        },
        {
            "rows": int(len(y)),
            "positive_rate": float(y.mean()),
            "test_auc": float(auc),
            "confusion_matrix": cm,
            "report": classification_report(y_te, pred, output_dict=True, zero_division=0),
            "source": CRASH_SOURCE,
            "note": (
                "Trained on twin-generated crashes. Transfers as far as the physics "
                "does, no further. Never used for crediting."
                if CRASH_SOURCE == "crash.csv"
                else f"Trained on real field data ({CRASH_SOURCE}). Never used for crediting."
            ),
        },
    )
    print(f"  crash_classifier      AUC {auc:.3f}   ({len(y)} rows, {y.mean():.1%} positive)")


def train_divergence() -> None:
    """Noise vs drift vs systematic overstatement across 12 windows.

    A small random forest here, because the boundary genuinely is non-linear:
    "small mean, low variance, long positive run" is systematic, while "large
    mean, high variance, no run" is noise, and a line cannot separate those.

    Depth is capped hard — an unbounded forest memorises the generator and
    reports a meaningless 100%.
    """
    cols, m = load("divergence.csv")
    X, y = m[:, :-1], m[:, -1].astype(int)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=SEED, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=40, max_depth=5, min_samples_leaf=8, random_state=SEED
    ).fit(X_tr, y_tr)

    pred = clf.predict(X_te)
    acc = float((pred == y_te).mean())
    cm = confusion_matrix(y_te, pred).tolist()

    # Export the forest as plain arrays so TypeScript can walk it without a
    # library. Each tree is node-parallel arrays, which is exactly how sklearn
    # stores them internally.
    trees = []
    for est in clf.estimators_:
        t = est.tree_
        trees.append(
            {
                "feature": t.feature.tolist(),
                "threshold": t.threshold.tolist(),
                "left": t.children_left.tolist(),
                "right": t.children_right.tolist(),
                "value": [v[0].tolist() for v in t.value],
            }
        )

    save(
        "divergence_classifier",
        {
            "kind": "random_forest",
            "features": cols[:-1],
            "classes": ["honest", "drift", "systematic"],
            "trees": trees,
        },
        {
            "rows": int(len(y)),
            "test_accuracy": acc,
            "confusion_matrix": cm,
            "report": classification_report(
                y_te, pred, output_dict=True, zero_division=0,
                target_names=["honest", "drift", "systematic"],
            ),
            "note": (
                "Sets the watch/flagged verdict only. It may never influence "
                "creditableCo2Kg — see docs/DECISIONS.md #9."
            ),
        },
    )
    print(f"  divergence_classifier accuracy {acc:.3f}   ({len(y)} rows, 3 classes)")


def train_ndci() -> None:
    """Chlorophyll index to biomass, with a prediction interval.

    The interval is the product here, not the fit. NDCI carries a mean absolute
    error factor near 2.4 in the literature, and a confident point estimate
    would be dishonest. We publish the residual quantiles and the engine credits
    against the lower one.
    """
    cols, m = load("ndci.csv")
    X, y = m[:, :-1], m[:, -1]

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=SEED)
    reg = LinearRegression().fit(X_tr, y_tr)

    pred = reg.predict(X_te)
    resid = y_te - pred
    r2 = float(reg.score(X_te, y_te))

    # Ratio quantiles, not absolute ones: the error is multiplicative, so a
    # fixed +/- band would be far too wide at low density and too narrow at high.
    safe = pred > 1e-6
    ratios = y_te[safe] / pred[safe]
    lo, hi = float(np.quantile(ratios, 0.1)), float(np.quantile(ratios, 0.9))

    save(
        "ndci_biomass",
        {
            "kind": "linear_regression",
            "features": cols[:-1],
            "coef": reg.coef_.tolist(),
            "intercept": float(reg.intercept_),
            "interval_low_ratio": lo,
            "interval_high_ratio": hi,
        },
        {
            "rows": int(len(y)),
            "test_r2": r2,
            "residual_std": float(resid.std()),
            "implied_error_factor": float(hi / max(lo, 1e-9)) ** 0.5,
            "note": (
                "The interval matters more than the fit. A wide interval simply "
                "means we credit less, which is the correct incentive."
            ),
        },
    )
    print(
        f"  ndci_biomass          R2 {r2:.3f}, interval x{lo:.2f}–x{hi:.2f}   ({len(y)} rows)"
    )


def save(name: str, model: dict, meta: dict) -> None:
    (ARTIFACTS / f"{name}.json").write_text(json.dumps(model, indent=2) + "\n")
    # Metrics ship alongside every model. If a judge asks how good it is, the
    # answer should be a file, not a shrug.
    (ARTIFACTS / f"{name}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    print("training…")
    train_crash()
    train_divergence()
    train_ndci()
    print(f"\nartifacts written to packages/models/artifacts/")
