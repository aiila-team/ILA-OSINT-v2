import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root by searching upward from the current file
current = Path(__file__).resolve()
for parent in [current] + list(current.parents):
    env_file = parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        break

api_id_value = os.getenv("TELEGRAM_API_ID") or os.getenv("API_ID")
api_hash_value = os.getenv("TELEGRAM_API_HASH") or os.getenv("API_HASH")

if not api_id_value or not api_hash_value:
    raise EnvironmentError(
        "Telegram credentials not found. Set TELEGRAM_API_ID/API_ID and TELEGRAM_API_HASH/API_HASH in .env or environment."
    )

API_ID = int(api_id_value)
API_HASH = api_hash_value.strip('"').strip("'")