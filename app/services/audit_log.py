
from datetime import datetime

def log_event(db, user, action, detail):
    db.execute("INSERT INTO audit_logs VALUES (?, ?, ?, ?)", (user, action, detail, datetime.utcnow()))
