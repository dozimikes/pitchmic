"""
Shared pytest fixtures — live here so pytest auto-discovers them for
tests under backend/Tests/.  An identical copy is symlinked / mirrored at
backend/apps/conftest.py so the apps/* test trees see the same fixtures.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.users.models import InvestorProfile, StartupProfile, User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def startup_user(db) -> User:
    user = User.objects.create_user(
        email="startup@example.com",
        password="TestPass1!",
        first_name="Founder",
        last_name="One",
        role=User.ROLE_STARTUP,
    )
    StartupProfile.objects.create(user=user, company_name="Acme Corp")
    return user


@pytest.fixture
def investor_user(db) -> User:
    user = User.objects.create_user(
        email="investor@example.com",
        password="TestPass1!",
        first_name="Investor",
        last_name="One",
        role=User.ROLE_INVESTOR,
    )
    InvestorProfile.objects.create(user=user, full_name="Investor One")
    return user


@pytest.fixture
def auth_startup(api_client: APIClient, startup_user: User) -> APIClient:
    api_client.force_authenticate(user=startup_user)
    return api_client


@pytest.fixture
def auth_investor(api_client: APIClient, investor_user: User) -> APIClient:
    api_client.force_authenticate(user=investor_user)
    return api_client
