import sys, os, subprocess, time, traceback
from pathlib import Path

BACKEND = Path(r"c:\Users\Dell\Downloads\pitchmic\backend")
OUT = BACKEND / "_verify_results.txt"

def _write(msg: str) -> None:
    with OUT.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg, flush=True)

def run(name, args, timeout=180):
    _write(f"\n========== {name} ==========")
    _write(f"CMD: {' '.join(args)}")
    try:
        t0 = time.time()
        r = subprocess.run(
            args,
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        dt = time.time() - t0
        _write(f"RC={r.returncode}  ELAPSED={dt:.1f}s")
        if r.stdout.strip():
            _write("--- STDOUT ---")
            _write(r.stdout[-4000:])
        if r.stderr.strip():
            _write("--- STDERR ---")
            _write(r.stderr[-4000:])
        return r.returncode
    except Exception:
        _write("EXCEPTION:")
        _write(traceback.format_exc())
        return 99

# always start fresh
with OUT.open("w", encoding="utf-8") as f:
    f.write(f"Verify started: {time.ctime()}\n")

py = sys.executable
rc_check = run("manage_check", [py, "manage.py", "check"])
rc_makemigrations = run(
    "makemigrations_dryrun",
    [py, "manage.py", "makemigrations", "--dry-run", "--noinput"],
)
rc_pytest = run(
    "pytest_smoke",
    [py, "-m", "pytest", "-x", "--tb=short", "-q",
     "--no-header", "-p", "no:warnings",
     "-k", "smoke or uploads or fsm or activity"],
    timeout=240,
)

_write(f"\n========== SUMMARY ==========")
_write(f"manage_check        RC={rc_check}")
_write(f"makemigrations_dry  RC={rc_makemigrations}")
_write(f"pytest_smoke        RC={rc_pytest}")
_write(f"OVERALL={'PASS' if (rc_check==0 and rc_makemigrations==0 and rc_pytest==0) else 'FAIL'}")
