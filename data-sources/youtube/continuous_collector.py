"""Shared utilities for continuous data collection and display."""

import asyncio
import json
import os
from typing import Callable, List, Dict, Any
from logging import getLogger

logger = getLogger(__name__)


class ContinuousCollector:
    """Base class for continuous data collection with retries and terminal output."""

    def __init__(
        self,
        name: str,
        collect_fn: Callable,
        interval: int = 60,
        max_retries: int = 3,
        retry_delay: int = 5,
    ):
        """Initialize continuous collector.
        
        Args:
            name: Name of the data source
            collect_fn: Async function that returns list of events
            interval: Collection interval in seconds
            max_retries: Number of retries on failure
            retry_delay: Delay between retries in seconds
        """
        self.name = name
        self.collect_fn = collect_fn
        self.interval = interval
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.iteration = 0

    async def collect_with_retries(self) -> List[Dict[str, Any]]:
        """Collect data with retry logic."""
        for attempt in range(self.max_retries):
            try:
                result = await self.collect_fn()
                return result
            except Exception as exc:
                logger.warning(
                    '%s collector attempt %d/%d failed: %s',
                    self.name,
                    attempt + 1,
                    self.max_retries,
                    exc,
                )
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                else:
                    logger.error('%s collector failed after %d retries', self.name, self.max_retries)
        return []

    async def run_continuous(self):
        """Run continuous collection indefinitely."""
        while True:
            self.iteration += 1
            print(f'\n--- {self.name.upper()} Collection Iteration {self.iteration} ---')
            
            try:
                result = await self.collect_with_retries()
                print(f'Collected {len(result)} {self.name} events')
                for event in result:
                    print(json.dumps(event, indent=2, default=str))
            except Exception as exc:
                logger.exception('Error in continuous collection: %s', exc)
                print(f'Error during collection: {exc}')
            
            print(f'Next collection in {self.interval} seconds...')
            await asyncio.sleep(self.interval)

    async def run_once(self):
        """Collect data once without continuous loop."""
        result = await self.collect_with_retries()
        print(f'Collected {len(result)} {self.name} events')
        for event in result:
            print(json.dumps(event, indent=2, default=str))
        return result
