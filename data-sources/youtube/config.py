"""Configuration for the YouTube OSINT source connector."""

import os
from pathlib import Path
from typing import Final
from dotenv import load_dotenv

# Explicitly load the project root .env file so the collector does not depend
# on the current working directory.
ROOT_DIR = Path(__file__).resolve().parents[2]
DOTENV_PATH = ROOT_DIR / ".env"
print("cwd:", Path.cwd())
print("env_path:", DOTENV_PATH)
print("env exists:", DOTENV_PATH.exists())
if DOTENV_PATH.exists():
    load_dotenv(DOTENV_PATH, override=True)
    print(f"Loaded environment from {DOTENV_PATH}")
else:
    print(f"Could not find .env at {DOTENV_PATH}. Using process environment only.")

# ── API credentials ────────────────────────────────────────────────────────────
YOUTUBE_API_KEY: Final[str] = os.getenv("YOUTUBE_API_KEY", "")
print("YOUTUBE_API_KEY loaded:", bool(YOUTUBE_API_KEY))
if not YOUTUBE_API_KEY:
    raise RuntimeError(
        "YOUTUBE_API_KEY not found in environment or .env. "
        "Ensure the repository root .env contains YOUTUBE_API_KEY."
    )

# ── Base URLs ──────────────────────────────────────────────────────────────────
BASE_URL: Final[str] = "https://www.googleapis.com/youtube/v3"
VIDEOS_URL: Final[str] = f"{BASE_URL}/videos"
COMMENTS_URL: Final[str] = f"{BASE_URL}/commentThreads"
SEARCH_URL: Final[str] = f"{BASE_URL}/search"
CHANNELS_URL: Final[str] = f"{BASE_URL}/channels"

# ── Rate limiting ──────────────────────────────────────────────────────────────
# YouTube Data API v3 quota: 10,000 units/day
# search.list  = 100 units | videos.list      = 1 unit
# commentThreads.list = 1 unit per page
RATE_LIMIT: Final[int] = int(os.getenv("YOUTUBE_RATE_LIMIT", "5"))

# ── Collection behaviour ───────────────────────────────────────────────────────
COLLECTION_INTERVAL: Final[int] = int(os.getenv("YOUTUBE_COLLECTION_INTERVAL", "300"))
MAX_RETRIES: Final[int] = int(os.getenv("YOUTUBE_MAX_RETRIES", "3"))
RETRY_DELAY: Final[int] = int(os.getenv("YOUTUBE_RETRY_DELAY", "10"))

# Max results per API call (YouTube cap = 50)
MAX_RESULTS_PER_PAGE: Final[int] = int(os.getenv("YOUTUBE_MAX_RESULTS", "50"))

# Max comment pages to fetch per video (1 page = up to 100 comments)
MAX_COMMENT_PAGES: Final[int] = int(os.getenv("YOUTUBE_MAX_COMMENT_PAGES", "3"))

# Collect comments at all?  Set to "false" to skip comment collection.
COLLECT_COMMENTS: Final[bool] = os.getenv("YOUTUBE_COLLECT_COMMENTS", "true").lower() == "true"

# Redis key used to track last-fetch timestamp
LAST_FETCH_KEY: Final[str] = "youtube_last_fetch"

# ── Monitored channels ─────────────────────────────────────────────────────────
# Add channel IDs (UCxxxx…) or @handles here.
# The collector resolves handles to channel IDs automatically at startup.
#
# How to find a channel ID:
#   1. Go to the channel page on YouTube
#   2. View page source → search for "channelId"
#   OR use: https://www.youtube.com/account_advanced when signed in
#
# Priority channels are polled every COLLECTION_INTERVAL seconds.
# Background channels are polled every COLLECTION_INTERVAL * 3 seconds.

MONITORED_CHANNELS: Final[list[dict]] = [
    # ── Indian national security / defence awareness ───────────────────────────
    {
        "channel_id": "UCHqSGpcsYMEFtLCBGNt9BoA",
        "name": "DD News",
        "priority": "high",
        "tags": ["news", "india", "national"],
    },
    {
        "channel_id": "UCpYZiRMjqA_MjHkFkLfg9pQ",
        "name": "ANI News",
        "priority": "high",
        "tags": ["news", "india", "national"],
    },
    {
        "channel_id": "UCt4t-jeY85JegMlZ-E5UWtA",
        "name": "NDTV",
        "priority": "high",
        "tags": ["news", "india"],
    },
    # ── Financial crime / fraud awareness ─────────────────────────────────────
    {
        "channel_id": "UCiT9RITQ9PW6BhXK0y2jaeg",
        "name": "Lok Sabha TV",
        "priority": "medium",
        "tags": ["parliament", "india", "policy"],
    },
    {
        "channel_id": "UCaO0_8WlEzBEKRXWFoQzHpg",
        "name": "Rajya Sabha TV",
        "priority": "medium",
        "tags": ["parliament", "india", "policy"],
    },
    # ── Cyber security / CERT-In related ──────────────────────────────────────
    {
        "channel_id": "UCbnCNmNYe_O-DMfJk1nbCsQ",
        "name": "CERT-In Official",
        "priority": "high",
        "tags": ["cybersecurity", "certin", "india"],
    },
    # ── Add your own channels below ───────────────────────────────────────────
    # {
    #     "channel_id": "UCxxxxxxxxxxxxxxxxxxxxxxxx",
    #     "name": "Channel Display Name",
    #     "priority": "high" | "medium" | "low",
    #     "tags": ["tag1", "tag2"],
    # },
]

# ── Keywords used to filter video relevance ────────────────────────────────────
# Videos whose title/description match ANY of these are collected with priority.
THREAT_KEYWORDS: Final[list[str]] = [
    "cyber attack",
    "data breach",
    "fraud",
    "scam",
    "phishing",
    "ransomware",
    "national security",
    "terrorism",
    "money laundering",
    "hawala",
    "UPI fraud",
    "SIM swap",
    "disinformation",
    "fake news",
    "cryptocurrency",
]

# ── Video parts to request from the API ───────────────────────────────────────
VIDEO_PARTS: Final[str] = "snippet,statistics,contentDetails"
COMMENT_PARTS: Final[str] = "snippet"
SEARCH_PARTS: Final[str] = "snippet"
CHANNEL_PARTS: Final[str] = "snippet,statistics"
