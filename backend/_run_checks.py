import sys
import subprocess
from pathlib import Path

backend = Path(r"c:\Users\Dell\Downloads\pitchmic\backend")
results = {}

for label, args in [
    ("manage_check", [sys.executable, "manage.py", "check"]),
    ("makemigrations_check", [sys.executable, "manage.py", "makemigrations", "--check", "--dry-run", "--noinput"]),
    ("makemigrations_preview", [sys.executable, "manage.py", "makemigrations", "--dry-run", "--noinput"]),
]:
    print(f"=== RUNNING: {label} ===")
    try:
        result = subprocess.run(
            args,
            cwd=str(backend),
            capture_output=True,
            text=True,
            timeout=180,
            env={**__import__("os").environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        results[label] = {
            "rc": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        print(f"[RC={result.returncode}] STDOUT:\n{result.stdout}")
        if result.stderr.strip():
            print(f"STDERR:\n{result.stderr}")
    except Exception as exc:
        print(f"EXCEPTION: {exc}")
        results[label] = {"rc": -1, "stdout": "", "stderr": str(exc)}
    print()

# --- pytest ---
print("=== RUNNING: pytest (smoke tests) ===")
try:
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-x", "--tb=short", "-q", "-k", "smoke or smoke_test or test_smoke or offers_fsm or activity_feed or uploads"],
        cwd=str(backend),
        capture_output=True,
        text=True,
        timeout=300,
        env={**__import__("os").environ, "PYTHONDONTWRITEBYTECODE": "1", "DJANGO_SETTINGS_MODULE": "config.settings"},
    )
    print(f"[RC={result.returncode}] STDOUT:\n{result.stdout}")
    if result.stderr.strip():
        print(f"STDERR:\n{result.stderr}")
    results["pytest_smoke"] = {
        "rc": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }
except Exception as exc:
    print(f"EXCEPTION: {exc}")
    results["pytest_smoke"] = {"rc": -1, "stdout": "", "stderr": str(exc)}

print("\n\n=== SUMMARY ===")
for k, v in results.items():
    print(f"  {k}: rc={v['rc']}")
