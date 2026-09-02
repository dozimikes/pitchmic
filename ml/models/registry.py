"""
ml/models/registry.py
=====================
Model version registry — disk-backed JSON with optional S3 backup/restore.

Fixes applied
-------------
- _save() uses os.replace() instead of Path.replace() for atomic rename on
  both POSIX and Windows (Path.replace raises FileExistsError on Windows
  when the destination already exists).
- register() uses a timestamp + UUID suffix for version names to eliminate
  collision after delete + register cycles.
- Removed unused `asdict` import.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ModelVersion
# ---------------------------------------------------------------------------

@dataclass
class ModelVersion:
    """Metadata for one registered model version."""

    version: str
    path: Path
    created_at: datetime
    accuracy: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    is_active: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "path": str(self.path),
            "created_at": self.created_at.isoformat(),
            "accuracy": self.accuracy,
            "metadata": self.metadata,
            "is_active": self.is_active,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ModelVersion":
        return cls(
            version=data["version"],
            path=Path(data["path"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            accuracy=data.get("accuracy"),
            metadata=data.get("metadata", {}),
            is_active=data.get("is_active", False),
        )


# ---------------------------------------------------------------------------
# ModelRegistry
# ---------------------------------------------------------------------------

class ModelRegistry:
    """
    Disk-backed JSON registry for model versions.

    Thread-safe via RLock.  Supports optional S3 backup/restore.
    """

    REGISTRY_FILENAME = "model_registry.json"

    def __init__(self, registry_path: Path):
        self.registry_path = registry_path
        self._file = registry_path / self.REGISTRY_FILENAME
        self._models: Dict[str, ModelVersion] = {}
        self._lock = threading.RLock()
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if not self._file.exists():
            logger.info("No registry at %s — starting fresh", self._file)
            return
        try:
            with open(self._file, "r") as fh:
                data: Dict[str, Any] = json.load(fh)
            for ver, info in data.items():
                self._models[ver] = ModelVersion.from_dict(info)
            logger.info("Registry loaded: %d version(s)", len(self._models))
        except Exception as exc:
            logger.error("Failed to load registry: %s", exc)

    def _save(self) -> None:
        """
        Atomically write registry JSON.

        FIX: use os.replace() instead of Path.replace() — the latter raises
        FileExistsError on Windows when the destination already exists.
        os.replace() is guaranteed atomic on POSIX and Windows.
        """
        self.registry_path.mkdir(parents=True, exist_ok=True)
        data = {ver: mv.to_dict() for ver, mv in self._models.items()}
        tmp_path = self._file.with_suffix(".tmp")
        with open(tmp_path, "w") as fh:
            json.dump(data, fh, indent=2, default=str)
        os.replace(str(tmp_path), str(self._file))  # FIX: cross-platform atomic

    # ------------------------------------------------------------------
    # Version management
    # ------------------------------------------------------------------

    def register(
        self,
        model_path: Path,
        accuracy: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        version: Optional[str] = None,
    ) -> str:
        """
        Register a model artefact and return its version string.

        FIX: auto-generated versions now include a UUID suffix so that
        delete + register sequences never produce duplicate version strings.
        """
        with self._lock:
            if version is None:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                uid = uuid.uuid4().hex[:6]
                version = f"v{ts}_{uid}"

            if version in self._models:
                raise ValueError(
                    f"Version '{version}' is already registered"
                )

            self._models[version] = ModelVersion(
                version=version,
                path=model_path,
                created_at=datetime.now(),
                accuracy=accuracy,
                metadata=metadata or {},
                is_active=False,
            )
            self._save()
            logger.info(
                "Registered model version: %s (accuracy=%s)", version, accuracy
            )
            return version

    def activate(self, version: str) -> bool:
        """Promote *version* to active; deactivate all others."""
        with self._lock:
            if version not in self._models:
                logger.warning("activate: '%s' not found", version)
                return False
            for mv in self._models.values():
                mv.is_active = False
            self._models[version].is_active = True
            self._save()
            logger.info("Activated: %s", version)
            return True

    def deactivate_all(self) -> None:
        """Deactivate every version (maintenance / rollback mode)."""
        with self._lock:
            for mv in self._models.values():
                mv.is_active = False
            self._save()
            logger.info("All model versions deactivated")

    def delete(self, version: str, remove_file: bool = False) -> bool:
        """Remove a version entry; optionally delete the artefact file."""
        with self._lock:
            if version not in self._models:
                return False
            mv = self._models.pop(version)
            if remove_file and mv.path.exists():
                mv.path.unlink()
                logger.info("Deleted model file: %s", mv.path)
            self._save()
            logger.info("Deleted registry entry: %s", version)
            return True

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_active(self) -> Optional[ModelVersion]:
        with self._lock:
            return next(
                (m for m in self._models.values() if m.is_active), None
            )

    def get(self, version: str) -> Optional[ModelVersion]:
        with self._lock:
            return self._models.get(version)

    def list_versions(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [m.to_dict() for m in self._models.values()]

    def latest(self) -> Optional[ModelVersion]:
        """Return the most recently registered version."""
        with self._lock:
            if not self._models:
                return None
            return max(self._models.values(), key=lambda m: m.created_at)

    # ------------------------------------------------------------------
    # S3 backup / restore
    # ------------------------------------------------------------------

    def backup_to_s3(
        self, bucket: str, version: Optional[str] = None
    ) -> str:
        """Upload a model artefact (and the registry JSON) to S3."""
        mv = self.get(version) if version else self.get_active()
        if mv is None:
            raise ValueError("No model version to back up")
        if not mv.path.exists():
            raise FileNotFoundError(f"Model file not found: {mv.path}")

        s3 = self._s3_client()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Upload model artefact
        model_key = f"models/{mv.version}/{ts}_{mv.path.name}"
        s3.upload_file(str(mv.path), bucket, model_key)

        # Upload registry JSON alongside it so restores are self-contained
        registry_key = f"models/{mv.version}/{ts}_registry.json"
        s3.upload_file(str(self._file), bucket, registry_key)

        logger.info(
            "Backed up %s to s3://%s/%s", mv.version, bucket, model_key
        )
        return model_key

    def restore_from_s3(
        self, bucket: str, s3_key: str, dest_path: Path
    ) -> Path:
        """Download a model artefact from S3."""
        s3 = self._s3_client()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        s3.download_file(bucket, s3_key, str(dest_path))
        logger.info(
            "Restored s3://%s/%s → %s", bucket, s3_key, dest_path
        )
        return dest_path

    @staticmethod
    def _s3_client():
        try:
            import boto3  # type: ignore
        except ImportError:
            raise ImportError(
                "boto3 is required for S3 operations: pip install boto3"
            )
        return boto3.client("s3")
