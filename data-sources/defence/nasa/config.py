import os
from pathlib import Path
from dotenv import load_dotenv

# Find and load .env file by searching up the directory tree
def find_and_load_env():
    """Search for .env file starting from current directory and moving up."""
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        env_file = parent / '.env'
        if env_file.exists():
            load_dotenv(env_file)
            return
    # If not found by searching, try loading from current directory anyway
    load_dotenv()

find_and_load_env()

NASA_API_KEY = os.getenv("NASA_API_KEY")

BASE_URL = os.getenv(
    "BASE_URL",
    "https://api.nasa.gov/planetary/apod"
)

RATE_LIMIT = int(
    os.getenv("NASA_RATE_LIMIT", "5")
)

LAST_FETCH_KEY = "nasa_last_fetch"