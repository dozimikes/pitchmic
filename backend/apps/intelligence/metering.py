from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class UsageEventRecord:
    tenant_id: int
    endpoint: str
    units_consumed: int
    cost_usd: float
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class FinancialUsageMeteringEngine:
    """
    B2B Usage Metering & Billing Entitlement Engine.
    Tracks API calls, forensic runs, voice screening sessions, and radar queries against tenant quotas.
    """

    ENDPOINT_UNIT_COSTS = {
        "/api/v1/intelligence/forensics/deck/upload/": 10,
        "/api/v1/intelligence/predict/outcomes/": 5,
        "/api/v1/intelligence/brain/query/": 2,
        "/api/v1/intelligence/voice/start/": 15,
        "/api/v1/intelligence/stealth/discover/": 8,
    }

    @classmethod
    def check_entitlement(
        cls, monthly_quota: int, used_units: int, requested_endpoint: str
    ) -> Dict[str, Any]:
        cost_units = cls.ENDPOINT_UNIT_COSTS.get(requested_endpoint, 1)
        allowed = (used_units + cost_units) <= monthly_quota

        return {
            "allowed": allowed,
            "required_units": cost_units,
            "current_usage": used_units,
            "quota_limit": monthly_quota,
            "remaining_units": max(0, monthly_quota - used_units),
        }
