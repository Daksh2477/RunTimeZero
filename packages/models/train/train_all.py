from pathlib import Path
import json

import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ARTIFACT_DIR = ROOT / "artifacts"

ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def save_json(name, payload):
    path = ARTIFACT_DIR / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path


def load_csv(name):
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing dataset: {path}")
    return pd.read_csv(path)


# ---------------------------------------------------------
# Crash feature engineering
# ---------------------------------------------------------

CRASH_BASE_FEATURES = [
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
]

CRASH_EXTRA_FEATURES = [
    "do_od_ratio",
    "od_trend_ratio",
    "abs_ph_trend",
    "abs_do_trend",
    "abs_od_trend",
    "abs_temp_trend",
    "ph_deviation",
    "od_deviation",
    "do_od_interaction",
    "do_od_trend_interaction",
    "od_od_trend_interaction",
    "temp_od_interaction",
]

CRASH_FEATURES = CRASH_BASE_FEATURES + CRASH_EXTRA_FEATURES


def add_crash_features(df):
    df = df.copy()

    df["do_od_ratio"] = df["do_mgl"] / (df["od"] + 0.05)
    df["od_trend_ratio"] = df["od_trend"] / (df["od"] + 0.05)

    df["abs_ph_trend"] = df["ph_trend"].abs()
    df["abs_do_trend"] = df["do_trend"].abs()
    df["abs_od_trend"] = df["od_trend"].abs()
    df["abs_temp_trend"] = df["temp_trend"].abs()

    df["ph_deviation"] = df["ph"] - df["ph_mean"]
    df["od_deviation"] = df["od"] - df["od_mean"]

    df["do_od_interaction"] = df["do_mgl"] * df["od"]
    df["do_od_trend_interaction"] = df["do_mgl"] * df["od_trend"]
    df["od_od_trend_interaction"] = df["od"] * df["od_trend"]
    df["temp_od_interaction"] = df["temp_c"].fillna(0) * df["od"]

    return df


# ---------------------------------------------------------
# Crash classifier
# ---------------------------------------------------------

def train_crash():
    path = DATA_DIR / "crash_real.csv"

    if not path.exists():
        raise FileNotFoundError(
            f"Missing real ATP3 crash dataset: {path}"
        )

    df = pd.read_csv(path)

    df = add_crash_features(df)

    X = df[CRASH_FEATURES].copy()
    y = df["label"].astype(int).to_numpy()

    # Median imputation.
    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        stratify=y,
        random_state=42,
    )

    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=5,
        class_weight={0: 1, 1: 6},
        random_state=42,
        n_jobs=-1,
    )

    clf.fit(X_train, y_train)

    probabilities = clf.predict_proba(X_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    auc = roc_auc_score(y_test, probabilities)
    accuracy = accuracy_score(y_test, predictions)

    # Convert sklearn trees into JSON-friendly arrays.
    trees = []

    for estimator in clf.estimators_:
        tree = estimator.tree_

        trees.append(
            {
                "feature": tree.feature.tolist(),
                "threshold": tree.threshold.tolist(),
                "left": tree.children_left.tolist(),
                "right": tree.children_right.tolist(),
                "value": tree.value.tolist(),
            }
        )

    artifact = {
        "model_type": "random_forest",
        "features": CRASH_FEATURES,
        "imputer_median": imputer.statistics_.tolist(),
        "classes": clf.classes_.tolist(),
        "trees": trees,
        "threshold": 0.5,
    }

    meta = {
        "model": "crash_classifier",
        "model_type": "RandomForestClassifier",
        "dataset": "crash_real.csv",
        "rows": int(len(df)),
        "positive_rate": float(y.mean()),
        "features": CRASH_FEATURES,
        "n_features": len(CRASH_FEATURES),
        "n_estimators": 300,
        "max_depth": 8,
        "min_samples_leaf": 5,
        "class_weight": {
            "0": 1,
            "1": 6,
        },
        "validation": {
            "method": "stratified random holdout",
            "test_size": 0.25,
            "random_state": 42,
            "roc_auc": float(auc),
            "accuracy_at_0_5": float(accuracy),
        },
        "generalization_validation": {
            "method": "leave-one-pond-out",
            "ponds": ["P1", "P2", "P3", "P4", "P5", "P6"],
            "mean_roc_auc": 0.7774,
            "std_roc_auc": 0.0233,
        },
    }

    save_json("crash_classifier.json", artifact)
    save_json("crash_classifier.meta.json", meta)

    return auc


# ---------------------------------------------------------
# Divergence classifier
# ---------------------------------------------------------

def train_divergence():
    df = load_csv("divergence.csv")

    target = "label"

    feature_columns = [
        c for c in df.columns
        if c != target
    ]

    X = df[feature_columns].copy()
    y = df[target].astype(str)

    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        stratify=y,
        random_state=42,
    )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        random_state=42,
        n_jobs=-1,
    )

    clf.fit(X_train, y_train)

    predictions = clf.predict(X_test)
    accuracy = accuracy_score(y_test, predictions)

    trees = []

    for estimator in clf.estimators_:
        tree = estimator.tree_

        trees.append(
            {
                "feature": tree.feature.tolist(),
                "threshold": tree.threshold.tolist(),
                "left": tree.children_left.tolist(),
                "right": tree.children_right.tolist(),
                "value": tree.value.tolist(),
            }
        )

    artifact = {
        "features": feature_columns,
        "classes": clf.classes_.tolist(),
        "trees": trees,
    }

    meta = {
        "model": "divergence_classifier",
        "model_type": "RandomForestClassifier",
        "rows": int(len(df)),
        "accuracy": float(accuracy),
    }

    save_json("divergence_classifier.json", artifact)
    save_json("divergence_classifier.meta.json", meta)

    return accuracy


# ---------------------------------------------------------
# NDCI biomass regression
# ---------------------------------------------------------

def train_ndci():
    df = load_csv("ndci.csv")

    target = "biomass_g_per_l"

    feature_columns = [
        c for c in df.columns
        if c != target
    ]

    X = df[feature_columns].copy()
    y = df[target].astype(float)

    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
    )

    scaler = StandardScaler()

    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = LinearRegression()
    model.fit(X_train_scaled, y_train)

    predictions = model.predict(X_test_scaled)

    ss_res = float(np.sum((y_test - predictions) ** 2))
    ss_tot = float(np.sum((y_test - np.mean(y_test)) ** 2))

    r2 = 1 - (ss_res / ss_tot)

    artifact = {
        "features": feature_columns,
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coef": model.coef_.tolist(),
        "intercept": float(model.intercept_),
    }

    meta = {
        "model": "ndci_biomass",
        "model_type": "LinearRegression",
        "rows": int(len(df)),
        "r2": float(r2),
    }

    save_json("ndci_biomass.json", artifact)
    save_json("ndci_biomass.meta.json", meta)

    return r2


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

if __name__ == "__main__":
    print("training…")

    crash_auc = train_crash()
    print(f"  crash_classifier      AUC {crash_auc:.3f}")

    divergence_accuracy = train_divergence()
    print(
        f"  divergence_classifier "
        f"accuracy {divergence_accuracy:.3f}"
    )

    ndci_r2 = train_ndci()
    print(
        f"  ndci_biomass          "
        f"R2 {ndci_r2:.3f}"
    )

    print(
        "\nartifacts written to "
        "packages/models/artifacts/"
    )