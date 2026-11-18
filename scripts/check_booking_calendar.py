#!/usr/bin/env python3
"""Is the LeadConnector calendar embedded on /book/ safe to show on lsacommand.com?

  python3 scripts/check_booking_calendar.py   # exit 0 = OK to set LSA_CALENDAR_READY = true

Reads LSA_BOOKING_EMBED_URL from book/index.html, fetches the public widget page, and checks the
calendar config the widget itself renders: name, description, logo, confirmation redirect, and
thank-you text. Read-only; it changes nothing in LeadConnector.
"""
import json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "book/index.html").read_text()
url = re.search(r"LSA_BOOKING_EMBED_URL = '([^']+)'", src).group(1)
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/131 Safari/537.36"})
page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
data = json.loads(re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', page, re.S).group(1))


def field(key):
    for x in data:
        if isinstance(x, dict) and key in x and isinstance(x[key], int) and x[key] < len(data):
            v = data[x[key]]
            if isinstance(v, (str, bool)) or v is None:
                return v
    return None


cfg = {k: field(k) for k in ("name", "description", "form_submit_type", "form_submit_redirect_url", "form_submit_thanks_message", "slug", "widget_slug")}
logos = sorted(set(re.findall(r"https://[^\"']*calendar-widget-logo[^\"']+", page)))
cfg["logos"] = logos
banned = re.compile(r"(?i)ryan|steinolfson|diyai|561[-. )]*309|accelerate|convertly")
problems = []
for k in ("name", "description", "form_submit_thanks_message", "slug", "widget_slug"):
    if cfg[k] and banned.search(str(cfg[k])):
        problems.append(f"{k} mentions a personal name, another brand, or another phone: {str(cfg[k])[:140]!r}")
if (cfg["form_submit_redirect_url"] or "").rstrip("/") != "https://lsacommand.com/booked":
    problems.append(f"confirmation redirect is {cfg['form_submit_redirect_url']!r}, should be 'https://lsacommand.com/booked/'")
if cfg["form_submit_type"] not in ("RedirectURL", None):
    problems.append(f"form_submit_type is {cfg['form_submit_type']!r}, should be RedirectURL")
if "LSA Command" not in (cfg["name"] or ""):
    problems.append(f"calendar name {cfg['name']!r} should say LSA Command")
print(json.dumps(cfg, indent=2)[:2000])
if logos:
    print("NOTE: check the logo image by eye; it must be the LSA Command logo, not a person or another brand:", logos)
if problems:
    print("\nNOT READY. Keep LSA_CALENDAR_READY = false in book/index.html:")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("\nREADY: calendar is LSA Command branded and redirects to /booked/. Set LSA_CALENDAR_READY = true.")
