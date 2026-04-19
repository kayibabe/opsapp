"""
app/routers/upload.py
=====================
FastAPI router for the two-phase Excel upload API.

Already registered in main.py as:
    app.include_router(upload.router, dependencies=[Depends(require_admin)])

So every endpoint here is admin-only automatically — no need to repeat auth.

Endpoints
---------
  POST  /api/upload/preview   — parse & validate; no DB write
  POST  /api/upload/commit    — atomic write with conflict resolution
  GET   /api/upload/history   — last 20 audit log entries
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import tempfile
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import engine, get_db          # engine must be exported from database.py
from app.services.excel_parser import ExcelParser

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upload", tags=["Upload"])


# ── Preview token store ───────────────────────────────────────────────────
#
# Parsed previews are stored as JSON files keyed by UUID.
# They expire after PREVIEW_TTL seconds so stale tokens can't be committed.
#
# ⚠️  SINGLE-WORKER LIMITATION: This store is local to the process.
#     If you run multiple uvicorn workers (--workers N where N > 1), a
#     token written by worker A will not be found by worker B, causing
#     spurious "Preview token not found" errors on commit.
#
#     Fix for multi-worker deployments: replace this with a shared store.
#     Recommended: Redis via redis-py.  One-line swap:
#       token → redis.set(token, json.dumps(data), ex=PREVIEW_TTL)
#       load  → redis.get(token)
#     Until then, run with a single worker: uvicorn app.main:app --workers 1
#
_PREVIEW_DIR: str = tempfile.mkdtemp(prefix="srwb_preview_")
PREVIEW_TTL: int  = 1800   # 30 minutes


def _save_preview(data: dict) -> str:
    token = str(uuid.uuid4())
    data["_created_at"] = time.time()
    with open(os.path.join(_PREVIEW_DIR, f"{token}.json"), "w") as fh:
        json.dump(data, fh)
    return token


def _load_preview(token: str) -> dict | None:
    # Validate the UUID format before using it in a file path
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", token):
        return None
    path = os.path.join(_PREVIEW_DIR, f"{token}.json")
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        data = json.load(fh)
    if time.time() - data["_created_at"] > PREVIEW_TTL:
        os.remove(path)
        return None
    return data


def _delete_preview(token: str) -> None:
    try:
        os.remove(os.path.join(_PREVIEW_DIR, f"{token}.json"))
    except FileNotFoundError:
        pass


# ── Request model ─────────────────────────────────────────────────────────

class CommitRequest(BaseModel):
    preview_token:          str
    global_conflict_mode:   str = "replace"       # "replace" | "skip"
    conflict_resolutions:   dict[str, str] = {}   # conflict_key → "replace"|"skip"


# ── POST /api/upload/preview ──────────────────────────────────────────────

@router.post("/preview", summary="Parse and validate a RawData Excel file")
async def preview(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """
    Upload the monthly RawData Excel file for inspection.

    - Validates structure against the expected SRWB template.
    - Flags missing values, type errors, and statistical anomalies.
    - Identifies rows that conflict with existing DB records.
    - Returns a `preview_token` to pass to `/commit`.

    Nothing is written to the database.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Upload an .xlsx or .xls file.",
        )

    # Read the entire file into memory so openpyxl can seek through it
    contents = await file.read()
    file_buf  = io.BytesIO(contents)

    # engine.raw_connection() returns a SQLAlchemy _ConnectionFairy which
    # proxies the underlying sqlite3.Connection interface transparently.
    # The parser only does SELECT queries so we never commit through this.
    raw_conn = engine.raw_connection()
    try:
        result = ExcelParser().parse(file_buf, raw_conn)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        log.exception("Unexpected error during Excel parse")
        raise HTTPException(
            status_code=500,
            detail="Internal parsing error. Contact your system administrator.",
        )
    finally:
        raw_conn.close()

    preview_data = result.to_dict()
    preview_data["filename"] = file.filename
    token = _save_preview(preview_data)

    return {**preview_data, "preview_token": token}


# ── POST /api/upload/commit ───────────────────────────────────────────────

@router.post("/commit", summary="Commit a previewed upload to the database")
def commit(
    body: CommitRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Write the parsed rows from a previous `/preview` call to the database.

    Conflict resolution precedence:
      `conflict_resolutions[key]`  >  `global_conflict_mode`  >  "replace"

    Conflict key format:  `"{zone}__{scheme}__{month}__{year}"`

    The entire batch is wrapped in a single `BEGIN EXCLUSIVE` transaction —
    if anything fails, nothing is written.
    """
    if body.global_conflict_mode not in ("replace", "skip"):
        raise HTTPException(
            status_code=400,
            detail="global_conflict_mode must be 'replace' or 'skip'.",
        )

    preview_data = _load_preview(body.preview_token)
    if preview_data is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Preview token not found or expired (tokens last 30 minutes). "
                "Re-upload the file to generate a new one."
            ),
        )

    # Use a raw connection for the atomic write so we control the transaction
    raw_conn = engine.raw_connection()
    try:
        _ensure_upload_log(raw_conn)
        stats = _execute_commit(
            conn         = raw_conn,
            preview_data = preview_data,
            global_mode  = body.global_conflict_mode,
            per_row_res  = body.conflict_resolutions,
        )
        raw_conn.commit()
    except Exception as exc:
        raw_conn.rollback()
        log.exception("Commit failed — fully rolled back")
        raise HTTPException(
            status_code=500,
            detail=f"Import failed and was fully rolled back: {exc}",
        )
    finally:
        raw_conn.close()

    # Write the audit log entry via the SQLAlchemy session
    username = getattr(current_user, "username", str(current_user))
    db.execute(
        text("""
            INSERT INTO upload_log
              (uploaded_by, filename, period_month, period_year,
               rows_inserted, rows_replaced, rows_skipped, rows_errored,
               preview_token)
            VALUES
              (:by, :fname, :pm, :py, :ins, :rep, :skip, :err, :tok)
        """),
        {
            "by":    username,
            "fname": preview_data.get("filename", "unknown"),
            "pm":    preview_data.get("period_month"),
            "py":    preview_data.get("period_year"),
            "ins":   stats["rows_inserted"],
            "rep":   stats["rows_replaced"],
            "skip":  stats["rows_skipped"],
            "err":   stats["rows_errored"],
            "tok":   body.preview_token,
        },
    )
    db.commit()

    _delete_preview(body.preview_token)

    return {
        **stats,
        "period_month": preview_data.get("period_month"),
        "period_year":  preview_data.get("period_year"),
        "filename":     preview_data.get("filename"),
        "uploaded_by":  username,
    }


# ── GET /api/upload/history ───────────────────────────────────────────────

@router.get("/history", summary="Last 20 upload log entries")
def history(db: Session = Depends(get_db)):
    """Returns the upload audit log, most recent first."""
    _ensure_upload_log_sa(db)
    rows = db.execute(
        text("""
            SELECT id, uploaded_at, uploaded_by, filename,
                   period_month, period_year,
                   rows_inserted, rows_replaced, rows_skipped, rows_errored
            FROM   upload_log
            ORDER  BY id DESC
            LIMIT  20
        """)
    ).mappings().all()
    return {"uploads": [dict(r) for r in rows]}


# ── Internal helpers ──────────────────────────────────────────────────────

def _ensure_upload_log(conn) -> None:
    """Create audit table if absent — accepts a raw connection."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS upload_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            uploaded_by   TEXT    NOT NULL DEFAULT 'unknown',
            filename      TEXT    NOT NULL DEFAULT '',
            period_month  INTEGER,
            period_year   INTEGER,
            rows_inserted INTEGER NOT NULL DEFAULT 0,
            rows_replaced INTEGER NOT NULL DEFAULT 0,
            rows_skipped  INTEGER NOT NULL DEFAULT 0,
            rows_errored  INTEGER NOT NULL DEFAULT 0,
            preview_token TEXT
        )
    """)


def _ensure_upload_log_sa(db: Session) -> None:
    """Create audit table if absent — accepts a SQLAlchemy session."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS upload_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            uploaded_by   TEXT    NOT NULL DEFAULT 'unknown',
            filename      TEXT    NOT NULL DEFAULT '',
            period_month  INTEGER,
            period_year   INTEGER,
            rows_inserted INTEGER NOT NULL DEFAULT 0,
            rows_replaced INTEGER NOT NULL DEFAULT 0,
            rows_skipped  INTEGER NOT NULL DEFAULT 0,
            rows_errored  INTEGER NOT NULL DEFAULT 0,
            preview_token TEXT
        )
    """))
    db.commit()


def _execute_commit(
    conn,
    preview_data: dict,
    global_mode: str,
    per_row_res: dict,
) -> dict[str, int]:
    """
    Write all importable rows inside a single BEGIN EXCLUSIVE transaction.

    "replace" rows  →  INSERT OR REPLACE  (overwrites the existing record)
    "skip"    rows  →  INSERT OR IGNORE   (leaves the existing record alone)
    "insert"  rows  →  INSERT OR IGNORE   (no conflict existed)

    Both INSERT OR REPLACE and INSERT OR IGNORE respect the
    uq_zone_scheme_month_year unique constraint.
    """
    stats: dict[str, int] = {
        "rows_inserted": 0,
        "rows_replaced": 0,
        "rows_skipped":  0,
        "rows_errored":  0,
    }

    all_rows   = preview_data.get("rows", [])
    importable = [r for r in all_rows if r.get("status") != "error"]
    stats["rows_errored"] = len(all_rows) - len(importable)

    if not importable:
        return stats

    # Stable column order derived from the first importable row
    sample_metrics: dict = importable[0].get("metrics", {})
    metric_cols  = sorted(sample_metrics.keys())
    dim_cols     = ["zone", "scheme", "month", "year"]
    all_cols     = dim_cols + metric_cols
    col_list     = ", ".join(all_cols)
    placeholders = ", ".join("?" for _ in all_cols)

    conn.execute("BEGIN EXCLUSIVE")
    try:
        for row in importable:
            has_conflict = row.get("conflict") is not None
            conflict_key = (
                f"{row['zone']}__{row['scheme']}"
                f"__{row['month']}__{row['year']}"
            )

            if has_conflict:
                mode = per_row_res.get(conflict_key, global_mode)
            else:
                mode = "insert"

            if mode == "skip" and has_conflict:
                stats["rows_skipped"] += 1
                continue

            values: list[Any] = [
                row["zone"],
                row["scheme"],
                row["month"],
                row["year"],
            ] + [row.get("metrics", {}).get(col) for col in metric_cols]

            if mode == "replace":
                conn.execute(
                    f"INSERT OR REPLACE INTO records ({col_list}) "
                    f"VALUES ({placeholders})",
                    values,
                )
                stats["rows_replaced"] += 1
            else:
                conn.execute(
                    f"INSERT OR IGNORE INTO records ({col_list}) "
                    f"VALUES ({placeholders})",
                    values,
                )
                stats["rows_inserted"] += 1

        conn.execute("COMMIT")

    except Exception:
        conn.execute("ROLLBACK")
        raise

    return stats
