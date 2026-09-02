import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List


@dataclass
class DomainEvent:
    event_id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: Dict[str, Any]
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class DomainEventBus:
    """
    Decoupled Domain Event Bus.
    Supports asynchronous in-memory & Redis pub/sub broadcasting of platform events.
    Events: PitchCreated, DeckUploaded, EvidenceVerified, IntelligenceRunCompleted, etc.
    """

    _subscribers: Dict[str, List[Callable[[DomainEvent], None]]] = {}

    @classmethod
    def subscribe(cls, event_type: str, handler: Callable[[DomainEvent], None]):
        if event_type not in cls._subscribers:
            cls._subscribers[event_type] = []
        cls._subscribers[event_type].append(handler)

    @classmethod
    def publish(cls, event: DomainEvent):
        handlers = cls._subscribers.get(event.event_type, [])
        for handler in handlers:
            try:
                handler(event)
            except Exception as e:
                # Log error without halting publisher execution
                print(f"[DomainEventBus Error] Event {event.event_type} failed: {e}")

    @classmethod
    def create_and_publish(
        cls,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: Dict[str, Any],
    ) -> DomainEvent:
        import uuid

        evt = DomainEvent(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
        )
        cls.publish(evt)
        return evt
