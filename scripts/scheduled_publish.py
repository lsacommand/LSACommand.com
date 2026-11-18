#!/usr/bin/env python3
"""Publish scheduled posts. Run from the repo root (every 15 minutes by .github/workflows/scheduled-publish.yml).
_scheduled/schedule.json lists posts: {"publish_at": ISO time with offset, "from": "_scheduled/<slug>", "to": "blog/<slug>",
"sitemap": "/blog/<slug>/", "card": "<article class=post-card ...>...</article>" (optional blog index card)}.
A due post is moved into place, added to sitemap.xml and blog/index.html, and removed from the schedule.
A post that still contains VIDEO_ID_PENDING is HELD (not published) and reported. Any <file>.b64 in a post folder is decoded to <file> on publish.
Also removes <!-- BLACK-FRIDAY-OFFER-START ... END --> blocks once the offer has ended (Dec 16, 2026 00:00 ET)."""
import json, re, shutil, sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT = Path.cwd(); SCHED = ROOT/"_scheduled/schedule.json"
NOW = datetime.now(ZoneInfo("America/New_York"))
if len(sys.argv) > 1: NOW = datetime.fromisoformat(sys.argv[1])  # test override
BF_END = datetime(2026, 12, 16, 0, 0, tzinfo=ZoneInfo("America/New_York"))
changed = []
items = json.loads(SCHED.read_text()) if SCHED.exists() else []
keep = []
for it in items:
    due = datetime.fromisoformat(it["publish_at"])
    src, dst = ROOT/it["from"], ROOT/it["to"]
    if due > NOW: keep.append(it); continue
    if not src.exists(): print("MISSING", it["from"]); keep.append(it); continue
    if "VIDEO_ID_PENDING" in (src/"index.html").read_text():
        print("HELD (VIDEO_ID_PENDING)", it["from"]); keep.append(it); continue
    if dst.exists(): shutil.rmtree(dst)
    shutil.move(str(src), str(dst)); changed.append(it["to"])
    # Binary images can be committed as base64 text (<name>.webp.b64) when only a text-only Git API is available.
    # Decode them into real files on publish so the live post serves real images.
    import base64
    for b in list(dst.rglob("*.b64")):
        b.with_suffix("").write_bytes(base64.b64decode(b.read_text())); b.unlink()
    sm = ROOT/"sitemap.xml"
    if sm.exists() and it["sitemap"] not in sm.read_text():
        d = NOW.strftime("%Y-%m-%d")
        sm.write_text(sm.read_text().replace("</urlset>", f'  <url><loc>https://lsacommand.com{it["sitemap"]}</loc><lastmod>{d}</lastmod></url>\n</urlset>'))
    bi = ROOT/"blog/index.html"
    if it.get("card") and bi.exists() and it["sitemap"] not in bi.read_text():
        anchor = '<section class="post-grid" aria-label="All guides">\n'
        t = bi.read_text()
        if anchor in t: bi.write_text(t.replace(anchor, anchor + it["card"] + "\n", 1))
SCHED.parent.mkdir(exist_ok=True); SCHED.write_text(json.dumps(keep, indent=2) + "\n")
if NOW >= BF_END:
    pat = re.compile(r"[ \t]*<!-- BLACK-FRIDAY-OFFER[- ]START.*?BLACK-FRIDAY-OFFER[- ]END -->\n?"
                     r"|[ \t]*<!-- BLACK-FRIDAY contents link:[^>]*-->\n[ \t]*<li>.*?</li>\n?", re.S)
    for f in ROOT.glob("**/*.html"):
        if ".git" in f.parts: continue
        t = f.read_text()
        if "BLACK-FRIDAY" in t and pat.search(t): f.write_text(pat.sub("", t)); changed.append(str(f.relative_to(ROOT)))
print("changed:", changed if changed else "nothing due")
