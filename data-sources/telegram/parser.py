from datetime import datetime

def telegram_to_event(message, channel):

    return {
        "event_id": str(message.id),
        "source": "telegram",
        "source_id": channel,
        "content": message.text or "",
        "published_at": str(message.date),
        "collected_at": str(datetime.utcnow())
    }