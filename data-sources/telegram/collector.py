import importlib.util
import json
import sys
from pathlib import Path
from telethon import TelegramClient

HERE = Path(__file__).resolve()
REPO_ROOT = HERE.parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from logging import getLogger

logger = getLogger(__name__)

def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

config_mod = _load_module("telegram_config", HERE.parent / "config.py")
payload_mod = _load_module("telegram_payload_extractor", HERE.parent / "payload_extractor.py")

API_ID = config_mod.API_ID
API_HASH = config_mod.API_HASH
telegram_to_event_payload = payload_mod.telegram_to_event_payload

try:
    media_downloader_mod = _load_module("media_downloader", HERE.parent / "media_downloader.py")
    download_media = media_downloader_mod.download_media
except FileNotFoundError:
    print("WARNING: media_downloader.py not found; media download will be skipped.")
    async def download_media(client, msg, event_id):
        return []
except AttributeError:
    print("WARNING: media_downloader.py does not define download_media; media download will be skipped.")
    async def download_media(client, msg, event_id):
        return []

from ingestion.kafka_producer import publish_raw_event


client = TelegramClient(
    "ila_session",
    API_ID,
    API_HASH
)

CHANNELS = [
    "militarysummary",
    "sitreports",
    "OSINTDefender",
    "MaxOsintIntel",
    "Liveuamap",
    "ElitePredatorss",
    "WarMonitors",
    "OsintTV",
    "AMK_Mapping",
    "frontier_force_2",
    "geo_gaganauts",
    "SouthFrontEng",
    "ClashReport",
    "GlobalConflictMonitor",
    "MilitaryMaps",
    "thirdeyeosintandanalysis",
]


def print_event_payload(event_payload, media_files):
    print("\n" + "=" * 80)
    print(f"Event ID: {event_payload.get('event_id')}")
    print(f"Source: {event_payload.get('source')}")
    user = event_payload.get('user', {})
    print(f"User: {user.get('username') or user.get('first_name') or 'N/A'}")
    print(f"Collected at: {event_payload.get('collected_at')}")
    print(f"Content: {event_payload.get('content', '')[:200]}")
    print(f"Media files: {len(media_files)}")
    if media_files:
        for media in media_files:
            print(f"  - {media.get('filename')} ({media.get('type')}) path={media.get('filepath')}")
    print("\nPayload:")
    print(json.dumps(event_payload, indent=2, default=str))
    print("=" * 80)


async def collect_from_channel(channel):
    logger.info(
        "collector_started",
        extra={"source": "telegram", "channel": channel},
    )

    try:
        messages = await client.get_messages(channel, limit=50)
    except Exception as e:
        logger.exception(
            "Failed to fetch messages from Telegram channel",
            extra={"source": "telegram", "channel": channel, "error": str(e)},
        )
        return

    for msg in messages:
        try:
            event_payload = telegram_to_event_payload(msg, channel)
            media_files = await download_media(client, msg, event_payload["event_id"])

            content_value = str(event_payload.get('content', '') or '').strip()
            if not content_value:
                logger.warning(
                    "Skipping Telegram event with empty content",
                    extra={
                        "source": "telegram",
                        "channel": channel,
                        "message_id": getattr(msg, 'id', None),
                    },
                )
                continue

            # Extract URL from entities if available
            source_url = None
            if event_payload.get('entities', {}).get('urls'):
                source_url = event_payload['entities']['urls'][0]

            # Publish to shared Kafka producer
            event_id = publish_raw_event(
                source_type="telegram",
                content=content_value,
                published_at=event_payload.get('published_at', ''),
                source_url=source_url,
                payload=event_payload,
            )
            logger.info(
                "event_published",
                extra={
                    "source": "telegram",
                    "event_id": event_id,
                    "channel": channel,
                },
            )
            print(f"✓ Published event {event_id}")
            print_event_payload(event_payload, media_files)

        except Exception as e:
            logger.exception(
                "publish_failed",
                extra={
                    "source": "telegram",
                    "channel": channel,
                    "message_id": getattr(msg, 'id', None),
                    "error": str(e),
                },
            )


async def main():
    for channel in CHANNELS:
        await collect_from_channel(channel)


if __name__ == "__main__":
    with client:
        client.loop.run_until_complete(main())