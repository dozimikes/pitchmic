"""
Shared test configuration for security tests.
Disables HTTPS redirect so test client requests don't 301 to https://testserver.
"""
from __future__ import annotations

import pytest
from django.test import override_settings


@pytest.fixture(autouse=True)
def disable_ssl_redirect(settings):
    """
    Disable SECURE_SSL_REDIRECT for all tests.
    The test client uses http://testserver; without this every request
    gets a 301 → https://testserver and all assertions fail.
    """
    settings.SECURE_SSL_REDIRECT = False
    settings.SECURE_HSTS_SECONDS = 0
