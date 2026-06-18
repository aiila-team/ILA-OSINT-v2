import asyncio
from pathlib import Path
from typing import Any

from telethon import TelegramClient
from telethon.tl.types import MessageMediaDocument, MessageMediaPhoto


async def download_media(client: TelegramClient, msg: Any, event_id: str) -> list[dict[str, Any]]:
    """Download media from a Telegram message and return metadata.

    Args:
        client: Telethon client instance.
        msg: Telegram message object.
        event_id: Unique event ID used to group downloaded files.

    Returns:
        List of downloaded media file metadata.
    """
    if not getattr(msg, "media", None):
        return []

    media_base_dir = Path(__file__).resolve().parent / "media"
    media_base_dir.mkdir(parents=True, exist_ok=True)

    media_files = []
    media = msg.media
    filename = None
    media_type = "unknown"
    folder_name = "documents"

    def _guess_media_folder(name: str | None, mime_type: str | None) -> str:
        image_exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"}
        video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"}
        audio_exts = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
        name_suffix = Path(name).suffix.lower() if name else ""
        mime_type = (mime_type or "").lower()
        if mime_type.startswith("image/") or name_suffix in image_exts:
            return "images"
        if mime_type.startswith("video/") or name_suffix in video_exts:
            return "videos"
        if mime_type.startswith("audio/") or name_suffix in audio_exts:
            return "audios"
        return "documents"

    if isinstance(media, MessageMediaPhoto):
        media_type = "photo"
        folder_name = "images"
        filename = f"photo_{msg.id}.jpg"
    elif isinstance(media, MessageMediaDocument):
        media_type = "document"
        document = getattr(media, "document", None)
        mime_type = getattr(document, "mime_type", None) if document is not None else None
        filename = None

        if document is not None:
            for attr in getattr(document, "attributes", []) or []:
                if getattr(attr, "file_name", None):
                    filename = attr.file_name
                    break

        if not filename:
            filename = f"document_{msg.id}"

        folder_name = _guess_media_folder(filename, mime_type)
        if folder_name != "documents":
            media_type = folder_name[:-1] if folder_name.endswith("s") else folder_name
    else:
        filename = f"media_{msg.id}"

    if not filename:
        filename = f"media_{msg.id}"

    downloads_dir = media_base_dir / folder_name
    downloads_dir.mkdir(parents=True, exist_ok=True)
    dest_path = downloads_dir / filename

    try:
        downloaded_path = await client.download_media(msg, file=dest_path)
        if downloaded_path:
            media_files.append({
                "filename": dest_path.name,
                "filepath": str(dest_path.resolve()),
                "type": media_type,
            })
        else:
            print(f"WARNING: download_media returned no path for msg.id={msg.id}")
    except Exception as exc:
        try:
            downloaded_path = await client.download_media(media, file=dest_path)
            if downloaded_path:
                media_files.append({
                    "filename": dest_path.name,
                    "filepath": str(dest_path.resolve()),
                    "type": media_type,
                })
            else:
                print(f"WARNING: fallback download_media returned no path for msg.id={msg.id}: {exc}")
        except Exception as exc2:
            print(f"ERROR: failed to download media for msg.id={msg.id}: {exc} / {exc2}")

    return media_files
