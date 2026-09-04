"""
Live URL audit - tests every base_url and application_url currently in
opportunity_service.py and source_registry.py by actually fetching them.
Reports status, final URL after redirects, and whether the page looks like
a real program page or a generic homepage.
"""
import urllib.request, urllib.error, ssl, time, sys, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
HDRS = {"User-Agent": UA, "Accept": "text/html,*/*;q=0.8"}

# Current state of every URL in the three source files
SOURCES = {
    "Antler":         ("https://www.antler.co/residency",           "https://www.antler.co/pitch"),
    "Visa":           ("https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html",
                       "https://africa.visa.com/en_MW/visa-everywhere/innovation/visa-accelerator.html"),
    "Google":         ("https://startup.google.com/programs/accelerator/africa/",
                       "https://startup.google.com/programs/accelerator/africa/"),
    "Future Africa":  ("https://www.future.africa",                 "https://www.future.africa"),
    "Y Combinator":   ("https://www.ycombinator.com",               "https://www.ycombinator.com/apply"),
    "Techstars":      ("https://www.techstars.com/accelerators",    "https://apply.techstars.com/"),
    "Base10":         ("https://base10.vc",                         "https://base10.vc/purpose/"),
    "MassChallenge":  ("https://masschallenge.org",                 "https://masschallenge.org"),
    "Seedstars":      ("https://www.seedstars-africa.vc",           "https://www.seedstars-africa.vc"),
    "Microsoft":      ("https://portal.startups.microsoft.com",     "https://portal.startups.microsoft.com/signup"),
    "Flat6Labs":      ("https://flat6labs.com",                     "https://flat6labs.com/program/"),
    "Launch Africa":  ("https://www.launchafrica.vc",               "https://www.launchafrica.vc"),
    "Norrsken22":     ("https://www.norrsken22.com",                "https://www.norrsken22.com"),
    "Orange Corners": ("https://www.orangecorners.com",             "https://www.orangecorners.com/apply/"),
    "54 Collective":  ("https://54collective.vc",                   "https://54collective.vc"),
}

PROGRAM_KEYWORDS = re.compile(
    r"accelerat|startup|fund|apply|application|program|cohort|invest|grant|fintech|founder",
    re.I
)

def fetch(url, timeout=14):
    try:
        req = urllib.request.Request(url, headers=HDRS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            html = r.read(32768).decode("utf-8", errors="replace")
            return r.status, r.url, html
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:
        return 0, str(e)[:80], ""

def classify(code, final_url, html, original_url):
    if code == 0:   return "DNS/SSL_ERROR"
    if code == 404: return "NOT_FOUND"
    if code == 526: return "SSL_526"
    if code >= 400: return "HTTP_%d" % code
    # Did it redirect away from what we wanted?
    redirected = (final_url.rstrip("/").lower() != original_url.rstrip("/").lower())
    has_program_content = bool(PROGRAM_KEYWORDS.search(html))
    if redirected and not has_program_content:
        return "REDIRECT_GENERIC"
    if redirected:
        return "REDIRECT_OK"
    return "OK"

problems = []
print("\n%-16s  %-8s  %-6s  %-18s  %s" % ("ORG", "TYPE", "CODE", "STATUS", "FINAL URL"))
print("-" * 90)

for org, (base, app) in SOURCES.items():
    for label, url in [("base_url", base), ("app_url", app)]:
        if label == "app_url" and app == base:
            continue   # skip duplicate
        code, final, html = fetch(url)
        status = classify(code, final, html, url)
        redir  = ("-> " + final[:45]) if "REDIRECT" in status or final != url else ""
        flag   = " <<< PROBLEM" if status not in ("OK", "REDIRECT_OK") else ""
        print("%-16s  %-8s  %-6d  %-18s  %s%s" % (
            org[:16], label, code, status, redir[:40], flag
        ))
        if flag:
            problems.append((org, label, url, code, status, final))
        time.sleep(0.3)

print("-" * 90)
if problems:
    print("\nPROBLEMS (%d):" % len(problems))
    for org, label, url, code, status, final in problems:
        print("  [%-3d %-18s] %-14s %-8s  %s" % (code, status, org, label, url))
    sys.exit(1)
else:
    print("\nALL URLS PASS")
    sys.exit(0)
