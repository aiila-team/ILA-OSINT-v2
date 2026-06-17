# scripts/publish_test_event.py
import asyncio
import json
import sys
from aiokafka import AIOKafkaProducer
from app.config import settings

async def publish_test_events():
    print(f"Connecting to Kafka broker at: {settings.KAFKA_BOOTSTRAP_SERVERS}")
    
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8")
    )
    
    await producer.start()
    
    import time
    ts = int(time.time())

    # 1. Hindi News Article Payload (requires translation)
    news_payload = {
        "source": "news",
        "id": f"news_test_{ts}",
        "title": "रक्षा अनुसंधान अपडेट",
        "content": f"भारत ने स्वदेशी रूप से विकसित मिसाइल तकनीक का सफल परीक्षण किया है। यह रक्षा क्षेत्र में आत्मनिर्भरता की ओर एक बड़ा कदम है। (टेस्ट आईडी: {ts})",
        "published_at": "2026-06-11T12:00:00Z",
        "collected_at": "2026-06-11T12:05:00Z",
        "author": "सुरक्षा संवाददाता",
        "url": "https://example.com/defense-news-101"
    }

    # 2. YouTube Briefing Payload (English)
    youtube_payload = {
        "source": "youtube",
        "video_id": f"yt_test_{ts}",
        "title": "High Altitude Security Operations",
        "description": "Briefing on latest patrol logistics in eastern border areas.",
        "transcript": f"We have established new security checkpoints to coordinate surveillance systems. (test: {ts})",
        "published_at": "2026-06-11T15:30:00Z",
        "collected_at": "2026-06-11T15:40:00Z",
        "channel_id": "defense_ops_channel",
        "channel_title": "Border Security Updates",
        "media_urls": ["https://example.com/thumbnails/border_ops.jpg"]
    }

    # 3. Telegram Intel Alert (Hindi, contains media URL for OCR testing)
    telegram_payload = {
        "source": "telegram",
        "message_id": ts,
        "chat_id": -1009876543,
        "content": f"संदेहास्पद हलचल की खुफिया रिपोर्ट। संलग्न दस्तावेज़ की जांच की जा रही है। (टेस्ट आईडी: {ts})",
        "date": 1781260800,
        "author_id": "intel_reporter_007",
        "chat_username": "intel_alerts_india",
        "chat_title": "Intel Alerts India",
        "media_urls": [
            "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/testing/eurotext.png"
        ]
    }

    try:
        # Publish news event
        print("Publishing test Hindi News event to news.raw...")
        await producer.send_and_wait("news.raw", news_payload)
        
        # Publish youtube event
        print("Publishing test YouTube event to youtube.raw...")
        await producer.send_and_wait("youtube.raw", youtube_payload)
        
        # Publish telegram event
        print("Publishing test Telegram event to telegram.raw...")
        await producer.send_and_wait("telegram.raw", telegram_payload)

        print("\nAll test events published successfully!")
        
    except Exception as e:
        print(f"Error publishing events: {e}", file=sys.stderr)
    finally:
        await producer.stop()

if __name__ == "__main__":
    asyncio.run(publish_test_events())
