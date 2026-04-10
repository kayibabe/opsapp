# SRWB Operations Dashboard — Integration Guide

## What this package contains

```
app/
├── __init__.py              ✓ provided
├── main.py                  ✓ provided (your original, unchanged)
├── auth.py                  ⚠ PLACEHOLDER — copy your existing file here
├── database.py              ⚠ PLACEHOLDER — copy your existing file here
│
├── routers/
│   ├── __init__.py          ✓ provided
│   ├── upload.py            ✓ PROVIDED — new FastAPI upload router (REPLACES old one)
│   ├── analytics.py         ⚠ copy your existing file here
│   ├── catalogue.py         ⚠ copy your existing file here
│   ├── panels.py            ⚠ copy your existing file here
│   ├── records.py           ⚠ copy your existing file here
│   ├── reports.py           ⚠ copy your existing file here
│   └── users.py             ⚠ copy your existing file here
│
└── services/
    ├── __init__.py          ✓ provided (new folder)
    └── excel_parser.py      ✓ provided (new file)

scripts/
└── migrate_add_unique_constraint.py  ✓ provided

tests/
├── __init__.py              ✓ provided
└── test_upload.py           ✓ provided

requirements.txt             ✓ provided
```

---

## Setup steps

### 1. Drop this folder into your project root
Unzip into the same folder where your existing `app/` folder lives.

### 2. Copy your existing files into the placeholders
Open `app/auth.py` — if it says PLACEHOLDER at the top, replace it
with your real `auth.py`. Do the same for `app/database.py` and
all router files in `app/routers/`.

### 3. Check database.py exports `engine`
The new upload router imports:
```python
from app.database import engine, get_db
```
Open your `database.py` and confirm `engine` is at module level:
```python
engine = create_engine("sqlite:///./data/srwb.db", ...)
```
If `get_db` is not exported, add this standard pattern:
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 4. Install dependencies
```bash
pip install -r requirements.txt
```
`python-multipart` is the critical new one — FastAPI needs it for file uploads.

### 5. Run the migration (once only)
```bash
python scripts/migrate_add_unique_constraint.py
```

### 6. Run tests
```bash
pytest tests/test_upload.py -v
```
All 40 tests should pass.

### 7. Start the server
```bash
uvicorn app.main:app --reload --port 8000
```

### 8. Verify the new endpoints appear
Open http://localhost:8000/docs — you should see:
- POST /api/upload/preview
- POST /api/upload/commit
- GET  /api/upload/history

---

## New API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload/preview` | admin | Parse Excel, return preview JSON |
| POST | `/api/upload/commit`  | admin | Write previewed rows to DB |
| GET  | `/api/upload/history` | admin | Last 20 upload log entries |

## Uploading data (step by step)

**Step 1 — Preview:**
```bash
curl -X POST http://localhost:8000/api/upload/preview \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@RawData_Jan2024.xlsx"
```
Returns JSON with `preview_token`, row statuses, conflicts, anomalies.

**Step 2 — Commit:**
```bash
curl -X POST http://localhost:8000/api/upload/commit \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "preview_token": "<token from step 1>",
    "global_conflict_mode": "replace",
    "conflict_resolutions": {
      "BlantyreSouth__Limbe__1__2024": "skip"
    }
  }'
```
