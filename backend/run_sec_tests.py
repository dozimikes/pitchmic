"""Run security tests with correct environment."""
import os, sys

os.environ["CI"] = "true"
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
os.environ["SECRET_KEY"] = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
os.environ["DEBUG"] = "True"
os.environ["DATABASE_URL"] = "sqlite:///./db_test.sqlite3"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["CELERY_BROKER_URL"] = "redis://localhost:6379/1"
os.environ["CELERY_RESULT_BACKEND"] = "redis://localhost:6379/2"
os.environ["ALLOWED_HOSTS"] = "localhost,127.0.0.1,testserver"
os.environ["PAYSTACK_SECRET_KEY"] = "sk_live_unit_test_only"
os.environ["ML_API_KEY"] = "ci-test-key"
os.environ["CHROMA_AUTH_TOKEN"] = "ci-test-chroma-token"

import pytest
sys.exit(pytest.main([
    "apps/tests/test_security.py",
    "--tb=line", "-q",
    "-p", "no:cacheprovider",
]))
