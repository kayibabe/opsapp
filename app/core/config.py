
import os

class Settings:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./srwb.db")
    SECRET_KEY = os.getenv("SECRET_KEY", "supersecret")
    UPLOAD_LIMIT_MB = 50

settings = Settings()
