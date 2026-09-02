"""
ml/models/trainer.py
====================
XGBoost training pipeline for the startup success predictor.

Features
--------
- CSV data loading with column validation and missing-feature backfill
- Optional Optuna hyperparameter optimisation (TPE sampler, stratified CV)
- Stratified train/test split + 5-fold cross-validation evaluation
- Full sklearn-style classification metrics (accuracy, precision, recall,
  f1, roc_auc)
- Model serialisation to the models/ directory
- ModelRegistry integration — new version registered and activated after
  a successful training run
- CLI entrypoint:  python -m ml.models.trainer --data path/to/data.csv

Usage (programmatic)
--------------------
    from pathlib import Path
    from ml.models.trainer import train_pipeline

    result = train_pipeline(
        data_path=Path("data/startups.csv"),
        model_dir=Path("/app/models"),
        optimize=True,
        n_trials=50,
    )
    print(result["metrics"])
"""
from __future__ import annotations

import argparse
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional heavy imports — fail clearly when packages are missing
# ---------------------------------------------------------------------------

try:
    import pandas as pd  # type: ignore
    _PANDAS = True
except ImportError:
    _PANDAS = False

try:
    import xgboost as xgb  # type: ignore
    _XGB = True
except ImportError:
    _XGB = False

try:
    from sklearn.model_selection import (  # type: ignore
        train_test_split, StratifiedKFold, cross_val_score,
    )
    from sklearn.metrics import (  # type: ignore
        accuracy_score, precision_score, recall_score,
        f1_score, roc_auc_score,
    )
    from sklearn.preprocessing import StandardScaler  # type: ignore
    _SKLEARN = True
except ImportError:
    _SKLEARN = False


def _require_deps() -> None:
    missing = []
    if not _PANDAS:
        missing.append("pandas")
    if not _XGB:
        missing.append("xgboost")
    if not _SKLEARN:
        missing.append("scikit-learn")
    if missing:
        raise RuntimeError(
            f"Training requires: {', '.join(missing)}. "
            f"Install with: pip install {' '.join(missing)}"
        )


# ---------------------------------------------------------------------------
# Schema constants  (must match predictor.FEATURE_NAMES exactly)
# ---------------------------------------------------------------------------

FEATURE_COLUMNS = [
    "team_size", "founder_experience_yrs", "previous_exits", "has_linkedin",
    "has_github", "patent_count", "press_count", "awards_count",
    "current_revenue", "revenue_growth_rate", "gross_margin",
    "runway_months", "ltv_cac_ratio", "customer_count",
    "mau", "tam", "sam", "market_growth_rate",
    "stage_seed", "stage_series_a", "stage_series_b_plus",
    "founded_years_ago", "pitch_count", "total_likes", "total_offers",
    "has_problem_section", "has_solution_section", "has_traction_section",
    "has_financials_section", "has_video",
]
TARGET_COLUMN = "success_label"

DEFAULT_PARAMS: Dict[str, Any] = {
    "n_estimators": 500,
    "max_depth": 6,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "gamma": 0.1,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "scale_pos_weight": 1.0,
    "random_state": 42,
    "n_jobs": -1,
    "eval_metric": "logloss",
    "use_label_encoder": False,
}


# ---------------------------------------------------------------------------
# ModelTrainer
# ---------------------------------------------------------------------------

class ModelTrainer:
    """
    End-to-end XGBoost training pipeline.

    Parameters
    ----------
    model_dir : Directory for saving artefacts and the registry.
    """

    def __init__(self, model_dir: Path):
        _require_deps()
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.scaler: Optional["StandardScaler"] = None

        from ml.models.registry import ModelRegistry
        self.registry = ModelRegistry(model_dir)

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def load_data(
        self,
        data_path: Path,
    ) -> "Tuple[pd.DataFrame, pd.Series]":
        """
        Load a CSV file.

        Expected columns: FEATURE_COLUMNS + TARGET_COLUMN.
        Missing feature columns are back-filled with 0 and logged.
        """
        df = pd.read_csv(data_path)

        if TARGET_COLUMN not in df.columns:
            raise ValueError(
                f"Target column '{TARGET_COLUMN}' not found in {data_path}. "
                f"Available: {list(df.columns)}"
            )

        for col in FEATURE_COLUMNS:
            if col not in df.columns:
                logger.warning(
                    "Feature '%s' missing from dataset — filling with 0", col
                )
                df[col] = 0.0

        X = df[FEATURE_COLUMNS].fillna(0.0).astype(float)
        y = df[TARGET_COLUMN].astype(int)

        pos = int(y.sum())
        neg = len(y) - pos
        logger.info(
            "Dataset loaded: %d samples, %d features | "
            "positive=%d (%.1f%%) negative=%d",
            len(X), len(FEATURE_COLUMNS), pos,
            100 * pos / max(len(y), 1), neg,
        )
        return X, y

    # ------------------------------------------------------------------
    # Hyperparameter optimisation
    # ------------------------------------------------------------------

    def optimize_hyperparameters(
        self,
        X: "pd.DataFrame",
        y: "pd.Series",
        n_trials: int = 100,
        cv_folds: int = 5,
        timeout_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Optuna TPE optimisation maximising mean stratified-CV ROC-AUC.

        Falls back to DEFAULT_PARAMS when Optuna is not installed.
        """
        try:
            import optuna  # type: ignore
            optuna.logging.set_verbosity(optuna.logging.WARNING)
        except ImportError:
            logger.warning(
                "optuna not installed — using default hyperparameters"
            )
            return DEFAULT_PARAMS.copy()

        cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
        X_arr = X.values
        y_arr = y.values

        def _objective(trial: "optuna.Trial") -> float:
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 1000),
                "max_depth": trial.suggest_int("max_depth", 3, 10),
                "learning_rate": trial.suggest_float(
                    "learning_rate", 0.005, 0.3, log=True
                ),
                "subsample": trial.suggest_float("subsample", 0.5, 1.0),
                "colsample_bytree": trial.suggest_float(
                    "colsample_bytree", 0.5, 1.0
                ),
                "min_child_weight": trial.suggest_int(
                    "min_child_weight", 1, 10
                ),
                "gamma": trial.suggest_float("gamma", 0.0, 0.5),
                "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 2.0),
                "reg_lambda": trial.suggest_float("reg_lambda", 0.5, 3.0),
                "scale_pos_weight": trial.suggest_float(
                    "scale_pos_weight", 0.5, 5.0
                ),
                "random_state": 42,
                "n_jobs": -1,
                "eval_metric": "logloss",
                "use_label_encoder": False,
            }
            scores = []
            model_cls = xgb.XGBClassifier(**params)
            for train_idx, val_idx in cv.split(X_arr, y_arr):
                m = xgb.XGBClassifier(**params)
                m.fit(
                    X_arr[train_idx], y_arr[train_idx],
                    eval_set=[(X_arr[val_idx], y_arr[val_idx])],
                    verbose=False,
                )
                prob = m.predict_proba(X_arr[val_idx])[:, 1]
                scores.append(roc_auc_score(y_arr[val_idx], prob))
            return float(np.mean(scores))

        study = optuna.create_study(
            direction="maximize",
            study_name="startup_success_predictor",
            sampler=optuna.samplers.TPESampler(seed=42),
        )
        study.optimize(
            _objective,
            n_trials=n_trials,
            timeout=timeout_seconds,
            show_progress_bar=False,
        )

        best = {**DEFAULT_PARAMS, **study.best_params}
        logger.info(
            "HPO complete: best_trial=%d, roc_auc=%.4f",
            study.best_trial.number, study.best_value,
        )
        return best

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train(
        self,
        X: "pd.DataFrame",
        y: "pd.Series",
        params: Optional[Dict[str, Any]] = None,
        test_size: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Train an XGBoost model and return metrics + artefact paths.

        Parameters
        ----------
        X         : Feature matrix (pd.DataFrame).
        y         : Binary labels (pd.Series).
        params    : XGBoost hyperparameters; defaults to DEFAULT_PARAMS.
        test_size : Fraction of data held out for evaluation.

        Returns
        -------
        dict with keys: version, model_path, scaler_path, metrics.
        """
        params = params or DEFAULT_PARAMS.copy()

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Scale features
        self.scaler = StandardScaler()
        X_train_s = self.scaler.fit_transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        model = xgb.XGBClassifier(**params)
        model.fit(
            X_train_s, y_train,
            eval_set=[(X_test_s, y_test)],
            verbose=False,
        )

        # Evaluate
        y_pred = model.predict(X_test_s)
        y_prob = model.predict_proba(X_test_s)[:, 1]

        metrics = {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "precision": round(
                float(precision_score(y_test, y_pred, zero_division=0)), 4
            ),
            "recall": round(
                float(recall_score(y_test, y_pred, zero_division=0)), 4
            ),
            "f1": round(
                float(f1_score(y_test, y_pred, zero_division=0)), 4
            ),
            "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 4),
            "n_train": len(X_train),
            "n_test": len(X_test),
        }
        logger.info("Training metrics: %s", metrics)

        version, model_path, scaler_path = self._save(
            model, metrics, params
        )

        return {
            "version": version,
            "model_path": str(model_path),
            "scaler_path": str(scaler_path),
            "metrics": metrics,
        }

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _save(
        self,
        model: "xgb.XGBClassifier",
        metrics: Dict[str, Any],
        params: Dict[str, Any],
    ) -> "Tuple[str, Path, Path]":
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_path = self.model_dir / f"model_{ts}.xgb"
        scaler_path = self.model_dir / f"scaler_{ts}.pkl"

        model.save_model(str(model_path))
        with open(scaler_path, "wb") as fh:
            pickle.dump(self.scaler, fh)

        version = self.registry.register(
            model_path=model_path,
            accuracy=metrics.get("roc_auc"),
            metadata={
                "metrics": metrics,
                "params": {
                    k: v for k, v in params.items()
                    if isinstance(v, (int, float, str, bool))
                },
                "trained_at": ts,
                "feature_columns": FEATURE_COLUMNS,
            },
        )
        self.registry.activate(version)
        logger.info("Model saved and activated: version=%s path=%s",
                    version, model_path)
        return version, model_path, scaler_path

    # ------------------------------------------------------------------
    # Load helpers
    # ------------------------------------------------------------------

    def load(
        self, version: Optional[str] = None
    ) -> "Tuple[xgb.XGBClassifier, StandardScaler]":
        """Load a model + scaler from disk (active version if version=None)."""
        mv = (
            self.registry.get(version) if version
            else self.registry.get_active()
        )
        if mv is None:
            raise FileNotFoundError(
                f"Model version '{version}' not found in registry"
            )

        model = xgb.Booster()
        model.load_model(str(mv.path))

        scaler_path = mv.path.with_name(
            mv.path.name.replace("model_", "scaler_").replace(".xgb", ".pkl")
        )
        if not scaler_path.exists():
            raise FileNotFoundError(f"Scaler not found: {scaler_path}")

        with open(scaler_path, "rb") as fh:
            scaler = pickle.load(fh)

        return model, scaler


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def train_pipeline(
    data_path: Path,
    model_dir: Optional[Path] = None,
    optimize: bool = False,
    n_trials: int = 50,
    timeout_seconds: Optional[int] = None,
    test_size: float = 0.2,
) -> Dict[str, Any]:
    """
    Full training pipeline.

    Parameters
    ----------
    data_path        : Path to CSV training data.
    model_dir        : Directory for artefacts (defaults to /app/models).
    optimize         : Run Optuna HPO before training.
    n_trials         : Number of Optuna trials (ignored when optimize=False).
    timeout_seconds  : Optuna wall-clock timeout.
    test_size        : Holdout fraction for evaluation.

    Returns
    -------
    dict with keys: version, model_path, scaler_path, metrics.
    """
    if model_dir is None:
        model_dir = Path(
            __import__("os").environ.get("MODEL_PATH", "/app/models")
        )

    trainer = ModelTrainer(model_dir)
    X, y = trainer.load_data(data_path)

    params = (
        trainer.optimize_hyperparameters(
            X, y, n_trials=n_trials, timeout_seconds=timeout_seconds
        )
        if optimize
        else DEFAULT_PARAMS.copy()
    )

    return trainer.train(X, y, params=params, test_size=test_size)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Train startup success predictor"
    )
    parser.add_argument(
        "--data", required=True, type=Path,
        help="Path to training CSV"
    )
    parser.add_argument(
        "--model-dir", type=Path, default=None,
        help="Directory for model artefacts (default: $MODEL_PATH or /app/models)"
    )
    parser.add_argument(
        "--optimize", action="store_true",
        help="Run Optuna HPO (slow but better params)"
    )
    parser.add_argument(
        "--n-trials", type=int, default=50,
        help="Number of Optuna trials (default: 50)"
    )
    parser.add_argument(
        "--timeout", type=int, default=None,
        help="Optuna wall-clock timeout in seconds"
    )
    parser.add_argument(
        "--test-size", type=float, default=0.2,
        help="Holdout fraction for evaluation (default: 0.2)"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(asctime)s %(message)s",
    )

    result = train_pipeline(
        data_path=args.data,
        model_dir=args.model_dir,
        optimize=args.optimize,
        n_trials=args.n_trials,
        timeout_seconds=args.timeout,
        test_size=args.test_size,
    )
    print("\nTraining complete!")
    print(f"  Version   : {result['version']}")
    print(f"  Model     : {result['model_path']}")
    print(f"  Metrics   : {result['metrics']}")


if __name__ == "__main__":
    _cli()
