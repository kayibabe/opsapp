"""
rawdata_builder
===============

Step 1 of the Admin "Upload" tool.

Wraps the standalone ``dataupdater/update_rawdata_master.py`` smart-diff script so
the web app can build / refresh ``RawData_updated.xlsx`` from the five zone
workbooks (Liwonde, Mangochi, Mulanje, Ngabu, Zomba) that live in the
``dataupdater`` folder, and return a structured summary to the UI.

The generated workbook is then fed to the existing importer (Step 2).

Design notes
------------
* The zone workbooks are read from the server's ``dataupdater`` folder — the
  admin drops the updated files there each month (same as the legacy .bat flow).
* The script is loaded by file path via importlib so it keeps resolving its own
  source/output paths relative to its location, and its CLI keeps working.
* Nothing here is destructive to the master: the script writes a *separate*
  ``RawData_updated.xlsx`` (its ``OUTPUT_FILE``), never overwriting ``RawData.xlsx``.
"""
from __future__ import annotations

import importlib.util
import sys
import threading
from dataclasses import asdict
from pathlib import Path
from types import ModuleType

from app.core.config import BASE_DIR

# Location of the dataupdater package (overridable via env if ever relocated).
DATAUPDATER_DIR = BASE_DIR / "dataupdater"
SCRIPT_PATH = DATAUPDATER_DIR / "update_rawdata_master.py"

# Serialise builds — the underlying script uses module-level state for its log
# capture, so two concurrent runs would interleave. One build at a time is fine
# for an admin-only monthly tool.
_BUILD_LOCK = threading.Lock()

_module_cache: ModuleType | None = None


class BuildError(RuntimeError):
    """Raised when the dataupdater script cannot be located or loaded."""


def _load_script() -> ModuleType:
    global _module_cache
    if _module_cache is not None:
        return _module_cache

    if not SCRIPT_PATH.exists():
        raise BuildError(f"DataUpdater script not found: {SCRIPT_PATH}")

    spec = importlib.util.spec_from_file_location(
        "opsapp_dataupdater_master", str(SCRIPT_PATH)
    )
    if spec is None or spec.loader is None:
        raise BuildError(f"Could not load DataUpdater script: {SCRIPT_PATH}")

    module = importlib.util.module_from_spec(spec)
    # Register before exec so @dataclass can resolve cls.__module__ during load.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if not hasattr(module, "run_update"):
        raise BuildError(
            "DataUpdater script is missing run_update(); update the script."
        )
    _module_cache = module
    return module


def output_file_path() -> Path:
    """Absolute path of the workbook the build produces (and Step 2 imports)."""
    module = _load_script()
    out = getattr(module, "OUTPUT_FILE", None) or getattr(module, "RAWDATA_MASTER_FILE")
    return Path(out)


def zone_files_status() -> list[dict]:
    """Report which zone source workbooks are present, for the UI pre-flight."""
    module = _load_script()
    statuses: list[dict] = []
    for zone, path in getattr(module, "ZONE_FILES", {}).items():
        p = Path(path)
        exists = p.exists()
        statuses.append(
            {
                "zone": zone,
                "file": p.name,
                "exists": exists,
                "modified": (
                    p.stat().st_mtime if exists else None
                ),
            }
        )
    return statuses


def build_rawdata(*, test_mode: bool = False, force_overwrite: bool = False) -> dict:
    """Run the smart-diff build and return a JSON-serialisable summary.

    Parameters
    ----------
    test_mode:
        Dry-run — compute changes but write nothing.
    force_overwrite:
        Full refresh — overwrite existing values, not just fill missing/zero.
    """
    module = _load_script()

    with _BUILD_LOCK:
        exit_code, summary, log_lines = module.run_update(
            test_mode=test_mode, force_overwrite=force_overwrite
        )

    out_path = output_file_path()
    summary_dict = asdict(summary)
    # ``filled_records`` holds tuples (zone, scheme, month_no) — make them JSON-safe.
    summary_dict["filled_records"] = [
        list(rec) for rec in summary_dict.get("filled_records", [])
    ]

    records_changed = summary.rows_updated + summary.rows_added

    return {
        "ok": exit_code == 0,
        "exit_code": exit_code,
        "test_mode": test_mode,
        "force_overwrite": force_overwrite,
        "records_changed": records_changed,
        "output_file": out_path.name,
        "output_exists": out_path.exists() and not test_mode,
        "summary": summary_dict,
        "log": log_lines,
    }
