from confluent_kafka import Consumer

from kafka.config import BOOTSTRAP_SERVERS

def create_consumer(group_id):

    return Consumer(
        {
            "bootstrap.servers": BOOTSTRAP_SERVERS,
            "group.id": group_id,
            "auto.offset.reset": "earliest"
        }
    )