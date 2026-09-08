$env:CI = "true"
$env:DJANGO_SETTINGS_MODULE = "config.settings"
$env:SECRET_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
$env:DEBUG = "True"
$env:DATABASE_URL = "sqlite:///./db_test.sqlite3"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
$env:ALLOWED_HOSTS = "localhost,127.0.0.1,testserver"
$env:PAYSTACK_SECRET_KEY = "sk_live_unit_test_only"
$env:ML_API_KEY = "ci-test-key"
$env:CHROMA_AUTH_TOKEN = "ci-test-chroma-token"

# Force fresh run - skip cache and reuse-db
python -m pytest apps/tests/test_security.py --tb=line -q -p no:cacheprovider --cache-clear 2>&1 | Tee-Object -FilePath test_output.txt
exit $LASTEXITCODE
