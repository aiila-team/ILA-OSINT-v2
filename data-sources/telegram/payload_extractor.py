from datetime import datetime


def telegram_to_event_payload(message, channel):
    """Extract comprehensive payload from Telegram message"""

    # -------------------------
    # User Information
    # -------------------------
    sender = getattr(message, "sender", None)

    user_info = {
        "user_id": getattr(message, "sender_id", None),
        "username": getattr(sender, "username", None) if sender else None,
        "first_name": getattr(sender, "first_name", None) if sender else None,
        "last_name": getattr(sender, "last_name", None) if sender else None,
        "is_bot": getattr(sender, "bot", False) if sender else False,
    }

    # -------------------------
    # Forward Information
    # -------------------------
    forward_info = None

    if getattr(message, "fwd_from", None):
        forward_info = {
            "from_id": (
                str(message.fwd_from.from_id)
                if getattr(message.fwd_from, "from_id", None)
                else None
            )
        }

    # -------------------------
    # Message Metadata
    # -------------------------
    metadata = {
        "message_id": getattr(message, "id", None),
        "channel": channel,
        "date": str(getattr(message, "date", "")),
        "edited": (
            str(message.edit_date)
            if getattr(message, "edit_date", None)
            else None
        ),
        "is_reply": getattr(message, "is_reply", False),
        "is_forward": getattr(message, "fwd_from", None) is not None,
        "views": getattr(message, "views", 0) or 0,
        "replies": (
            getattr(message.replies, "replies", 0)
            if getattr(message, "replies", None)
            else 0
        ),
    }

    # -------------------------
    # Entities
    # -------------------------
    entities = {
        "hashtags": [],
        "mentions": [],
        "urls": [],
        "emails": []
    }

    if getattr(message, "entities", None):
        text = message.text or ""

        try:
            from telethon.tl.types import (
                MessageEntityHashtag,
                MessageEntityMention,
                MessageEntityUrl,
                MessageEntityEmail,
                MessageEntityTextUrl
            )

            for entity in message.entities:
                try:
                    entity_text = text[
                        entity.offset:
                        entity.offset + entity.length
                    ]

                    if isinstance(entity, MessageEntityHashtag):
                        entities["hashtags"].append(entity_text)

                    elif isinstance(entity, MessageEntityMention):
                        entities["mentions"].append(entity_text)

                    elif isinstance(entity, MessageEntityUrl):
                        entities["urls"].append(entity_text)

                    elif isinstance(entity, MessageEntityTextUrl):
                        entities["urls"].append(entity.url)

                    elif isinstance(entity, MessageEntityEmail):
                        entities["emails"].append(entity_text)

                except Exception:
                    pass

        except Exception:
            pass

    # -------------------------
    # Media Information
    # -------------------------
    media_type = None
    media_info = None

    if getattr(message, "media", None):

        try:
            from telethon.tl.types import (
                MessageMediaPhoto,
                MessageMediaDocument
            )

            if isinstance(message.media, MessageMediaPhoto):
                media_type = "photo"

                media_info = {
                    "photo_id": (
                        message.media.photo.id
                        if getattr(message.media, "photo", None)
                        else None
                    )
                }

            elif isinstance(message.media, MessageMediaDocument):

                document = message.media.document

                media_type = "document"

                media_info = {
                    "document_id": document.id,
                    "mime_type": document.mime_type,
                    "size": document.size
                }

                # Detect video files
                if (
                    document.mime_type and
                    document.mime_type.startswith("video/")
                ):
                    media_type = "video"

        except Exception as e:
            print(f"Media extraction error: {e}")

    # -------------------------
    # Final Event Payload
    # -------------------------
    content_value = message.text or getattr(message, "message", "")

    event_payload = {
        "event_id": f"tg_{channel}_{message.id}",
        "source": "telegram",
        "source_id": channel,
        "content": content_value,
        "published_at": str(message.date),
        "collected_at": str(datetime.utcnow()),
        "user": user_info,
        "metadata": metadata,
        "forward_info": forward_info,
        "entities": entities,
        "media_type": media_type,
        "media_info": media_info,
        "media_files": []
    }

    return event_payload