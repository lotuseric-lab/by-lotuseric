"""Small async in-process event bus; Redis transport can replace it later."""
import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

Handler = Callable[[Any], Awaitable[None]]


class EventBus:
    def __init__(self):
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Handler) -> None:
        if handler not in self._handlers[event_type]:
            self._handlers[event_type].append(handler)

    async def publish(self, event_type: str, event: Any) -> None:
        handlers = tuple(self._handlers.get(event_type, ()))
        if handlers:
            await asyncio.gather(*(handler(event) for handler in handlers))
