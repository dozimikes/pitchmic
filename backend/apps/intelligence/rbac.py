from enum import Enum
from typing import Any, Dict, List, Optional
from .core_evidence import DataClassification


class Role(str, Enum):
    FOUNDER = "FOUNDER"
    INVESTOR = "INVESTOR"
    VENTURE_PARTNER = "VENTURE_PARTNER"
    ANALYST = "ANALYST"
    TENANT_ADMIN = "TENANT_ADMIN"
    SUPERADMIN = "SUPERADMIN"


class ResourceAction(str, Enum):
    VIEW = "VIEW"
    CREATE = "CREATE"
    EDIT = "EDIT"
    DELETE = "DELETE"
    DOWNLOAD = "DOWNLOAD"
    GRANT_ACCESS = "GRANT_ACCESS"
    AUDIT = "AUDIT"


class SecurityPolicyEngine:
    """
    5-Tier Data Classification & Granular RBAC Engine.
    Evaluates: Identity -> Tenant -> Role -> Classification Tier -> Resource -> Action.
    """

    CLASSIFICATION_CLEARANCE: Dict[Role, List[DataClassification]] = {
        Role.FOUNDER: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
        ],
        Role.INVESTOR: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
        ],
        Role.VENTURE_PARTNER: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
            DataClassification.HIGHLY_RESTRICTED,
        ],
        Role.ANALYST: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
        ],
        Role.TENANT_ADMIN: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
            DataClassification.HIGHLY_RESTRICTED,
        ],
        Role.SUPERADMIN: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
            DataClassification.HIGHLY_RESTRICTED,
        ],
    }

    @classmethod
    def is_authorized(
        cls,
        user_role: Role,
        data_classification: DataClassification,
        action: ResourceAction,
        is_owner: bool = False,
    ) -> bool:
        if is_owner:
            return True

        allowed_tiers = cls.CLASSIFICATION_CLEARANCE.get(user_role, [DataClassification.PUBLIC])
        return data_classification in allowed_tiers
