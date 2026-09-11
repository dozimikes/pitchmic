"""
apps.core.security_uploads
==========================

Centralised file-upload hardening helpers.

Defence-in-depth pipeline for every uploaded file:

    1. Cap size BEFORE reading the full body into memory.
    2. Sanitize filename: strip path separators, ``..`` segments, null bytes,
       control characters, and non-ASCII that could trick downstream tools.
    3. Validate magic-byte signature of the leading bytes (NOT the extension
       or Content-Type header, both of which are user-controlled).
    4. Allowlist extension + declared MIME as a final sanity check.

The helpers are intentionally free of Django ORM side-effects so they can be
reused from middleware, Celery tasks, and CLI upload validators.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath, PureWindowsPath
from typing import Iterable

from django.core.files.uploadedfile import UploadedFile
from rest_framework.exceptions import ValidationError

from apps.core.tenant import log_security_event


ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "image": {"png", "jpg", "jpeg", "gif", "webp"},
    "document": {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt"},
    "audio": {"mp3", "wav", "m4a", "flac", "ogg"},
    "archive": {"zip"},
}

ALLOWED_MIME_TYPES: set[str] = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "text/csv",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/flac",
    "audio/ogg",
}


MAGIC_BYTE_TABLE: list[tuple[bytes, str, set[str]]] = [
    (b"\x89PNG\r\n\x1a\n", "image", {"png"}),
    (b"\xff\xd8\xff", "image", {"jpg", "jpeg"}),
    (b"GIF87a", "image", {"gif"}),
    (b"GIF89a", "image", {"gif"}),
    (b"RIFF", "image", {"webp"}),
    (b"%PDF-", "document", {"pdf"}),
    (b"PK\x03\x04", "document", {"docx", "pptx", "xlsx", "zip"}),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "document", {"doc", "ppt", "xls"}),
    (b"ID3", "audio", {"mp3"}),
    (b"\xff\xfb", "audio", {"mp3"}),
    (b"RIFF", "audio", {"wav"}),
    (b"fLaC", "audio", {"flac"}),
    (b"OggS", "audio", {"ogg"}),
    (b"\x00\x00\x00\x18ftypmp42", "audio", {"m4a"}),
    (b"\x00\x00\x00\x20ftypisom", "audio", {"m4a"}),
]


MAX_READ_BYTES_FOR_MAGIC = 64


FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._\-]")


def _flatten_extensions() -> set[str]:
    out: set[str] = set()
    for exts in ALLOWED_EXTENSIONS.values():
        out.update(exts)
    return out


ALL_ALLOWED_EXTENSIONS = _flatten_extensions()


@dataclass(frozen=True)
class ValidatedUpload:
    """Return value of :func:`validate_uploaded_file` when accepted."""

    sanitized_name: str
    stored_name: str
    size_bytes: int
    extension: str
    category: str


def sanitize_filename(raw_name: str, *, prefix_uuid: bool = True, request_context: dict | None = None) -> tuple[str, str]:
    """
    Sanitize a client-controlled filename.

    Returns a tuple ``(sanitized_name, stored_name)``:

    * ``sanitized_name`` - human-readable name for display (no path components,
      null bytes, or control chars).  Extension is preserved if allowed.
    * ``stored_name`` - filesystem-safe name with a random UUID4 prefix to
      avoid collisions and to strip any residual semantic meaning.

    If *prefix_uuid* is False the UUID prefix is omitted (used mainly for
    deterministic tests).
    """
    if raw_name is None:
        raw_name = ""

    path_traversal_detected = False

    for sep in ("/", "\\"):
        if sep in raw_name:
            path_traversal_detected = True
            break

    for bad in ("..", "\x00"):
        if bad in raw_name:
            path_traversal_detected = True
            break

    raw_name = raw_name.replace("\x00", "")

    pure = PurePosixPath(PureWindowsPath(raw_name).as_posix())
    leaf = pure.name or "unnamed"

    leaf = FILENAME_SAFE_RE.sub("_", leaf)
    leaf = leaf.strip(" ._")
    if not leaf:
        leaf = "unnamed"

    if len(leaf) > 120:
        stem, dot, ext = leaf.rpartition(".")
        if dot and ext:
            leaf = stem[:120] + dot + ext
        else:
            leaf = leaf[:120]

    if path_traversal_detected:
        log_security_event(
            "sec.upload.path_traversal_blocked",
            raw_name=raw_name,
            sanitized=leaf,
            **(request_context or {}),
        )

    extension = ""
    if "." in leaf:
        extension = leaf.rsplit(".", 1)[-1].lower()

    sanitized = leaf
    if prefix_uuid:
        token = uuid.uuid4().hex
        stored = f"{token}_{sanitized}"
    else:
        stored = sanitized

    return sanitized, stored


def _detect_magic_category(header: bytes, extension_lower: str) -> tuple[str | None, bool]:
    """
    Return ``(category, match_ok)`` where *match_ok* indicates the detected
    magic-byte signature is compatible with the declared extension.
    """
    matched_category: str | None = None
    compatible: bool = False

    for sig, category, compatible_exts in MAGIC_BYTE_TABLE:
        if header.startswith(sig):
            matched_category = category
            if extension_lower in compatible_exts:
                compatible = True
                break

    return matched_category, compatible


def validate_uploaded_file(
    file: UploadedFile,
    *,
    max_bytes: int,
    allowed_categories: Iterable[str] = ("image", "document", "audio"),
    request_context: dict | None = None,
) -> ValidatedUpload:
    """
    Apply the full defence-in-depth upload validator.

    *Raises* :class:`rest_framework.exceptions.ValidationError` with a
    structured ``code`` for every rejection path so callers can produce
    consistent HTTP 400 payloads.

    Parameters
    ----------
    file:
        A Django ``UploadedFile`` instance - its ``size`` attribute is read
        first (bounded by ``DATA_UPLOAD_MAX_MEMORY_SIZE`` / the WSGI server).
    max_bytes:
        Hard size cap.  Files above this size are rejected immediately.
    allowed_categories:
        Subset of the keys of :data:`ALLOWED_EXTENSIONS` that are acceptable
        for this endpoint.
    """
    ctx = request_context or {}

    if file is None:
        raise ValidationError({"file": "No file supplied."}, code="sec.upload.missing")

    size = getattr(file, "size", None)
    if size is None:
        log_security_event("sec.upload.rejected", reason="unknown_size", **ctx)
        raise ValidationError({"file": "Unable to determine file size."}, code="sec.upload.size_unknown")

    if size > max_bytes:
        log_security_event(
            "sec.upload.rejected",
            reason="oversized",
            size=size,
            cap=max_bytes,
            **ctx,
        )
        raise ValidationError(
            {"file": f"File exceeds maximum allowed size of {max_bytes} bytes."},
            code="sec.upload.oversized",
        )

    allowed_extensions: set[str] = set()
    for cat in allowed_categories:
        allowed_extensions.update(ALLOWED_EXTENSIONS.get(cat, set()))

    raw_name = getattr(file, "name", None) or "unnamed"
    sanitized_name, stored_name = sanitize_filename(raw_name, prefix_uuid=True, request_context=ctx)

    extension = ""
    if "." in sanitized_name:
        extension = sanitized_name.rsplit(".", 1)[-1].lower()

    if not extension:
        log_security_event("sec.upload.rejected", reason="no_extension", name=sanitized_name, **ctx)
        raise ValidationError(
            {"file": "File must have an allowed extension."},
            code="sec.upload.no_extension",
        )

    if extension not in allowed_extensions:
        log_security_event(
            "sec.upload.rejected",
            reason="extension_not_allowed",
            extension=extension,
            **ctx,
        )
        raise ValidationError(
            {"file": f"File extension '.{extension}' is not allowed."},
            code="sec.upload.extension_not_allowed",
        )

    declared_mime = (getattr(file, "content_type", None) or "").lower()
    if declared_mime and declared_mime not in ALLOWED_MIME_TYPES:
        log_security_event(
            "sec.upload.rejected",
            reason="mime_not_allowed",
            mime=declared_mime,
            **ctx,
        )
        raise ValidationError(
            {"file": f"Content-Type '{declared_mime}' is not allowed."},
            code="sec.upload.mime_not_allowed",
        )

    header = b""
    if hasattr(file, "read"):
        pos = file.tell() if hasattr(file, "tell") else 0
        try:
            header = file.read(MAX_READ_BYTES_FOR_MAGIC) or b""
        finally:
            if hasattr(file, "seek"):
                try:
                    file.seek(pos)
                except Exception:
                    pass

    category, compatible = _detect_magic_category(header, extension)

    if category is None:
        log_security_event(
            "sec.upload.rejected",
            reason="magic_unknown",
            extension=extension,
            header_len=len(header),
            **ctx,
        )
        raise ValidationError(
            {"file": "File signature is unrecognised or corrupted."},
            code="sec.upload.magic_unknown",
        )

    if category not in set(allowed_categories):
        log_security_event(
            "sec.upload.rejected",
            reason="magic_category_mismatch",
            detected=category,
            allowed=list(allowed_categories),
            **ctx,
        )
        raise ValidationError(
            {"file": f"Detected file type '{category}' is not allowed."},
            code="sec.upload.category_mismatch",
        )

    if not compatible:
        log_security_event(
            "sec.upload.rejected",
            reason="magic_mismatch",
            extension=extension,
            detected=category,
            **ctx,
        )
        raise ValidationError(
            {"file": "File extension does not match actual contents."},
            code="sec.upload.magic_mismatch",
        )

    return ValidatedUpload(
        sanitized_name=sanitized_name,
        stored_name=stored_name,
        size_bytes=size,
        extension=extension,
        category=category,
    )
