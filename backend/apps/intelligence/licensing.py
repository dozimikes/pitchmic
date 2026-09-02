"""
apps.intelligence.licensing
===========================
Multi-tenant enterprise licensing, API key provisioning, and quota metering.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from typing import Any, Dict, Optional, Tuple
from django.utils import timezone

from .models import EnterpriseTenant, TenantAPIKey, TenantUsageLog

logger = logging.getLogger(__name__)


class EnterpriseLicensingService:
    """
    Handles enterprise B2B licensing, API key authentication, and rate limiting.
    """

    @classmethod
    def create_tenant(
        cls,
        name: str,
        slug: str,
        tier: str = EnterpriseTenant.TIER_PRO,
        webhook_url: str = "",
        contact_email: str = "",
    ) -> EnterpriseTenant:
        quotas = {
            EnterpriseTenant.TIER_STARTER: 50,
            EnterpriseTenant.TIER_PRO: 200,
            EnterpriseTenant.TIER_ENTERPRISE: -1,
        }
        monthly_quota = quotas.get(tier, 200)

        tenant, _ = EnterpriseTenant.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "tier": tier,
                "monthly_deal_quota": monthly_quota,
                "webhook_url": webhook_url,
                "contact_email": contact_email,
                "is_active": True,
            },
        )
        return tenant

    @classmethod
    def generate_api_key(
        cls,
        tenant: EnterpriseTenant,
        name: str = "Production API Key",
    ) -> Tuple[TenantAPIKey, str]:
        """
        Generates a secure API key with prefix `pm_live_...`.
        Returns (TenantAPIKey instance, raw_secret_key).
        """
        random_token = secrets.token_hex(24)
        raw_key = f"pm_live_{random_token}"
        key_prefix = raw_key[:12]
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        api_key_obj = TenantAPIKey.objects.create(
            tenant=tenant,
            name=name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            is_active=True,
        )
        return api_key_obj, raw_key

    @classmethod
    def authenticate_api_key(cls, raw_key: str) -> Optional[EnterpriseTenant]:
        """
        Validates raw API key and returns the associated active EnterpriseTenant.
        """
        if not raw_key or not raw_key.startswith("pm_live_"):
            return None

        key_prefix = raw_key[:12]
        computed_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        try:
            api_key = TenantAPIKey.objects.select_related("tenant").get(
                key_prefix=key_prefix,
                key_hash=computed_hash,
                is_active=True,
                tenant__is_active=True,
            )
            api_key.last_used_at = timezone.now()
            api_key.save(update_fields=["last_used_at"])
            return api_key.tenant
        except TenantAPIKey.DoesNotExist:
            return None

    @classmethod
    def record_usage(
        cls,
        tenant: EnterpriseTenant,
        endpoint: str,
        action_type: str,
        status_code: int = 200,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TenantUsageLog:
        """
        Records an API action and increments monthly quota usage.
        """
        if metadata is None:
            metadata = {}

        if action_type in ("triage", "forensics_audit", "due_diligence"):
            tenant.record_deal_usage()

        return TenantUsageLog.objects.create(
            tenant=tenant,
            endpoint=endpoint,
            action_type=action_type,
            status_code=status_code,
            metadata=metadata,
        )
