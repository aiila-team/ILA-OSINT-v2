"""Configuration for the Bhuvan defence source connector."""

import os

BASE_URL = os.getenv('BHUVAN_BASE_URL', 'https://bhuvanmaps.nrsc.gov.in/vec1wms/gwc/service/wms')
RATE_LIMIT = int(os.getenv('BHUVAN_RATE_LIMIT', '5'))
LAST_FETCH_KEY = 'bhuvan_last_fetch'
