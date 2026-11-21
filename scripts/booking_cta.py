#!/usr/bin/env python3
"""Booking-KPI pass for lsacommand.com. Idempotent: run it as many times as you like.

  python3 scripts/booking_cta.py            # apply to the repo this script lives in
  python3 scripts/booking_cta.py --check    # report only, exit 1 if anything is off

What it does
  1. Site-wide: every booking link goes to https://lsacommand.com/book/ (never the old personal
     calendar URL), the GA4 cross-domain linker to the old calendar domain is removed, the /book
     redirects to the old calendar are dropped from vercel.json, and "with Ryan" CTA copy becomes
     "with our team".
  2. Every blog post (blog/<slug>/index.html and _scheduled/<slug>/index.html) gets the shared
     booking CTA blocks, each wrapped in <!-- LSA-BOOK-CTA <pos> START/END --> markers so a re-run
     replaces them instead of stacking:
       top    under the lede / article header
       mid    right after the booked-call Lead Summary proof (#booked-in-google-lsa), else the middle H2
       end    replaces the post's plain end-of-post booking box (keeps its headline)
       sticky dismissible bottom bar (shown by lsa-tracking.js after the top CTA scrolls away)
     Posts that already carry a hand-written CTA for a slot (article-start-book / article-mid-book /
     article-footer-book) keep it; the script only tags it with data-cta-position.
     The Black Friday line sits inside <!-- BLACK-FRIDAY-OFFER START ... --> / <!-- BLACK-FRIDAY-OFFER END -->
     and is only added to posts that do not already have a Black Friday block.
"""
import html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOK = "https://lsacommand.com/book/"
OLD_CAL = re.compile(r"https?://ryan\.diyai\.ai/30-min-discovery-call[^\"'\s<)]*")
LINKER = re.compile(r",\s*linker:\s*\{\s*domains:\s*\[[^\]]*\]\s*\}")
BLOCK = re.compile(r"[ \t]*<!-- LSA-BOOK-CTA (top|mid|end|sticky) START -->.*?<!-- LSA-BOOK-CTA \1 END -->\n?", re.S)
CHECK = "--check" in sys.argv

PROOF = ("Across three pool contractor accounts, leads answered within 30 seconds went from 28% to 100% "
         "between December 2025 and April 2026 (<a href=\"/case-studies/\">case studies</a>).")
PROOF_SHORT = ("From 28% to 100% of leads answered within 30 seconds, across three pool contractor accounts, "
               "December 2025 to April 2026 (<a href=\"/case-studies/\">case studies</a>).")
BF = ("<!-- BLACK-FRIDAY-OFFER START (remove on 2026-12-16) -->\n"
      "<p class=\"book-cta-offer\"><strong>Black Friday offer:</strong> get 5 client locations live on LSA Command "
      "by December 15, 2026, and the first month is free on every location you add before December 15.</p>\n"
      "<!-- BLACK-FRIDAY-OFFER END -->\n")


def link(slug, pos, label, cls="button"):
    return (f'<a class="{cls}" href="{BOOK}?post_slug={slug}&amp;cta_position={pos}" '
            f'data-cta="post-{pos}-book" data-cta-position="{pos}">{label}</a>')


def top_block(slug):
    return ("<!-- LSA-BOOK-CTA top START -->\n"
            '<aside class="book-cta book-cta-top" data-lsa-cta="top" aria-label="Book a walkthrough, top of article">'
            '<div class="book-cta-copy"><p class="book-cta-eyebrow">Built for agencies only: Google LSA for your clients</p>'
            "<p><strong>100% of your clients' Google LSA calls answered within 30 seconds.</strong> Their team gets "
            "the first 10 to 15 seconds, then AI answers. AI messaging replies instantly.</p>"
            '<p class="book-cta-proof">Across three pool contractor accounts, leads answered within 30 seconds went from 28% to 100% (December 2025 to April 2026, published case studies).</p>'
            "<p>Bring one client account and the LSA Command team audits it live in 30 minutes. No passwords "
            "change hands, and you keep what the audit finds whether or not you go ahead. $200 per month per client.</p></div>"
            + link(slug, "top", "Book my 30-minute walkthrough") +
            "</aside>\n<!-- LSA-BOOK-CTA top END -->\n")


def contact(pos):
    return (f'Prefer the phone? <a href="tel:+19897124370" data-cta="post-{pos}-call">Call 989-712-4370</a> or '
            f'<a href="sms:+19897124370?&amp;body=LSA%20Command%20walkthrough.%20My%20agency%20name%20and%20two%20times%20that%20work%3A%20" data-cta="post-{pos}-text">text us</a>.')


def mid_block(slug, short=False):
    body = ("" if short else
            "<p>100% of calls answered within 30 seconds: your client's team gets the first 10 to 15 seconds, then "
            "AI answers. AI messaging replies instantly.</p>"
            f"<p>Proof: {PROOF}</p>"
            "<p>When the AI books a job on a call, LSA Command fills the Lead Summary inside Google's LSA platform: "
            "Lead Status Booked, customer name, location, and appointment.</p>"
            "<p>Bring one client account. The LSA Command team audits it live while you share your screen. "
            "No passwords change hands.</p>")
    return ("<!-- LSA-BOOK-CTA mid START -->\n"
            '<aside class="book-cta book-cta-mid" data-lsa-cta="mid" aria-label="Book a walkthrough, middle of article">'
            + ("<p class=\"book-cta-title\">Put this on every client's Google LSA account: 100% of calls answered within 30 seconds, with notes and notifications on every lead.</p>" if short else "<p class=\"book-cta-title\">Put this on every client's Google LSA account.</p>") + body +
            "<p>" + link(slug, "mid", "Book my 30-minute walkthrough") +
            f' <span class="book-cta-alt">{contact("mid")}</span></p>'
            "</aside>\n<!-- LSA-BOOK-CTA mid END -->\n")


def end_block(slug, headline, with_bf):
    h = headline or "See it on one of your client accounts."
    return ("<!-- LSA-BOOK-CTA end START -->\n"
            f'<section class="cta-box book-cta-end" data-lsa-cta="end" data-headline="{html.escape(h, quote=True)}">'
            f"<h2>{h}</h2>"
            "<p>100% of calls answered within 30 seconds. Your client's team gets the first 10 to 15 seconds, then AI "
            "answers. AI messaging replies instantly. Every lead gets notes and notifications, with High-value "
            "leads identified.</p>"
            "<p>Bring one client's Google LSA account to a 30-minute walkthrough and the LSA Command team audits it "
            "live. No passwords change hands, and you keep what the audit finds whether or not you go ahead.</p>"
            f'<p class="book-cta-proof">{PROOF_SHORT}</p>\n'
            "<p>Google Local Services Ads is all LSA Command does. Built for agencies only. $200 per month per client.</p>\n"
            + (BF if with_bf else "")
            + link(slug, "end", "Book my 30-minute walkthrough") +
            ' <a class="button button-ghost" href="tel:+19897124370" data-cta="post-end-call">Call 989-712-4370</a>'
            ' <a class="button button-ghost" href="sms:+19897124370?&amp;body=LSA%20Command%20walkthrough.%20My%20agency%20name%20and%20two%20times%20that%20work%3A%20" data-cta="post-end-text">Text 989-712-4370</a>'
            "</section>\n<!-- LSA-BOOK-CTA end END -->\n")


def sticky_block(slug):
    return ("<!-- LSA-BOOK-CTA sticky START -->\n"
            '<div class="book-sticky" data-lsa-sticky hidden role="region" aria-label="Book a walkthrough, sticky bar">'
            '<p class="book-sticky-text"><strong>100% of your clients\' Google LSA calls answered within 30 seconds.</strong> '
            "\n<!-- BLACK-FRIDAY-OFFER START (remove on 2026-12-16) -->\n"
            '<span class="book-sticky-offer">Black Friday: get 5 client locations live by December 15, 2026, and the first month is free on every location you add before then.</span>'
            '<span class="book-sticky-offer-short">Black Friday: 5 client locations live by December 15, 2026. First month free on each one added before then.</span>'
            "\n<!-- BLACK-FRIDAY-OFFER END -->\n"
            '<span class="book-sticky-extra">Built for agencies only. $200 per month per client.</span></p>'
            + link(slug, "sticky", "Book my walkthrough") +
            '<button type="button" class="book-sticky-close" data-lsa-sticky-close aria-label="Dismiss booking bar">&times;</button>'
            "</div>\n<!-- LSA-BOOK-CTA sticky END -->\n")


def tag_existing(t, pattern, pos):
    def rep(m):
        tag = m.group(0)
        return tag if "data-cta-position" in tag else tag.replace("data-cta=", f'data-cta-position="{pos}" data-cta=', 1)
    return re.sub(r'<a [^>]*data-cta="' + pattern + r'"[^>]*>', rep, t)


def line_start(t, i):
    return t.rfind("\n", 0, i) + 1


def apply_post(t, slug):
    # Remember a headline from a previous run's end block before stripping our blocks.
    prev = re.search(r'<section class="cta-box book-cta-end"[^>]*data-headline="([^"]*)"', t)
    prev_headline = html.unescape(prev.group(1)) if prev else None
    # Keep each earlier block's spot as a token so a re-run puts the new block back in the same place.
    t = BLOCK.sub(lambda m: f"\x00LSA-{m.group(1)}\x00", t)
    has_bf = "BLACK-FRIDAY-OFFER START" in t
    tok = lambda pos: f"\x00LSA-{pos}\x00"

    # end: replace the plain end-of-post booking box, keep its headline.
    headline = prev_headline
    m = re.search(r'[ \t]*<section class="cta-box">(?:(?!</section>).)*?data-cta="article-cta-book"(?:(?!</section>).)*?</section>\n?', t, re.S)
    end_needed = 'data-cta="article-footer-book"' not in t
    if tok("end") in t:
        t = t.replace(tok("end"), end_block(slug, headline, not has_bf))
    elif m:
        hm = re.search(r"<h2[^>]*>(.*?)</h2>", m.group(0), re.S)
        headline = headline or (hm.group(1).strip() if hm else None)
        t = t[:m.start()] + end_block(slug, headline, not has_bf) + t[m.end():]
    elif end_needed:
        for anchor in ('<aside class="author-box"', '<aside class="related"', "</article>"):
            i = t.find(anchor)
            if i != -1:
                ls = line_start(t, i)
                i = ls if (anchor == "</article>" or not t[ls:i].strip()) else i
                t = t[:i] + end_block(slug, headline, not has_bf) + t[i:]
                break
    t = tag_existing(t, r"article-footer-book", "end")

    # top: under the article header (after lede + meta).
    if tok("top") in t:
        t = t.replace(tok("top"), top_block(slug))
    elif re.search(r'data-cta="article-(start|early)-book"', t):
        t = tag_existing(t, r"article-(?:start|early)-book", "top")
    else:
        hs = t.find('<header class="article-header"')
        he = t.find("</header>", hs) if hs != -1 else -1
        if he != -1:
            i = he + len("</header>")
            t = t[:i] + "\n" + top_block(slug) + t[i:].lstrip("\n")
        else:
            lm = re.search(r'<p class="lede">.*?</p>', t, re.S)
            if lm:
                t = t[:lm.end()] + "\n" + top_block(slug) + t[lm.end():]

    # mid: after the booked-call proof section, else before the middle H2 of the body.
    t = t.replace(tok("mid"), "")  # mid is recomputed from the headings every run
    if 'data-cta="article-mid-book"' in t:
        t = tag_existing(t, r"article-mid-book", "mid")
    else:
        body_start = t.find('class="article-body"')
        if body_start == -1:
            body_start = t.find("<article")
        end_cta = t.find("<!-- LSA-BOOK-CTA end START -->")
        limit = end_cta if end_cta != -1 else t.find("</article>")
        heads = [h.start() for h in re.finditer(r"<h2[ >]", t) if body_start < h.start() < limit]
        bil = t.find('id="booked-in-google-lsa"')
        at = None
        if bil != -1:
            nxt = [h for h in heads if h > bil]
            at = nxt[0] if nxt else None
        if at is None:
            faq = [h for h in heads if re.match(r'<h2[^>]*id="faq', t[h:h + 60])]
            usable = [h for h in heads if not faq or h < faq[0]]
            # Past the middle, and never before the 2nd section (keeps it clear of the top CTA).
            if len(usable) >= 3:
                at = usable[max(2, (len(usable) + 1) // 2)] if len(usable) > 2 else None
        if at is not None:
            # Never land inside a Black Friday block.
            bfs = t.rfind("BLACK-FRIDAY-OFFER START", 0, at)
            if bfs != -1 and t.rfind("BLACK-FRIDAY-OFFER END", 0, at) < bfs:
                at = t.find("\n", t.find("BLACK-FRIDAY-OFFER END", at)) + 1
            i = line_start(t, at)
            words = len(re.sub(r"<[^>]+>", " ", t[body_start:limit]).split())
            t = t[:i] + mid_block(slug, short=words < 600) + t[i:]

    # sticky bar, just before </main>.
    i = t.rfind("</main>")
    if tok("sticky") in t:
        t = t.replace(tok("sticky"), sticky_block(slug))
    elif i != -1:
        i = line_start(t, i)
        t = t[:i] + sticky_block(slug) + t[i:]
    return re.sub(r"\x00LSA-\w+\x00", "", t)


def sitewide(t):
    t = OLD_CAL.sub(BOOK, t)
    t = LINKER.sub("", t)
    t = re.sub(r"(walkthrough|30-min call|30-minute call|call|30 minutes|</a>) with Ryan\b", r"\1 with our team", t)
    t = t.replace("on Ryan's calendar", "on our calendar").replace("<!-- PLACEHOLDER: Ryan to", "<!-- PLACEHOLDER: team to")
    return t


def fix_vercel(t):
    data = json.loads(t)
    data["redirects"] = [r for r in data.get("redirects", [])
                         if not (r.get("source") in ("/book", "/book/") and "diyai" in r.get("destination", ""))]
    return json.dumps(data, indent=2) + "\n"


CSS = r"""/* LSA-BOOK-CTA CSS START (scripts/booking_cta.py blocks) */
.book-cta{margin:28px 0;padding:18px 22px;border-radius:16px;background:#f2fafc;border:1px solid #bfebf1;border-left:5px solid #04bdce;font-size:1rem;line-height:1.6}
.book-cta p{margin:0 0 10px}.book-cta p:last-child{margin-bottom:0}
.book-cta-top{margin:0 0 36px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px}
.book-cta-top .book-cta-copy{flex:1 1 420px}.book-cta-top .book-cta-copy p{margin:0 0 6px}.book-cta-eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;font-weight:800;color:var(--teal)}
.book-cta-top .button{white-space:nowrap}
.book-cta-title{font-weight:800;font-size:1.15rem;color:var(--ink)}
.book-cta-mid .button{margin-right:8px}
.book-cta-alt{color:var(--muted);font-size:.92rem}
.book-cta-proof{font-size:.95rem;color:#183e52}
.book-cta-offer{padding:10px 14px;border-radius:12px;background:#fff7e0;border:1px solid #f2d68a}
.book-cta-end .button{margin:8px 10px 0 0}
.book-sticky{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;gap:10px 18px;padding:10px 52px 10px 16px;background:rgba(5,37,54,.97);color:#fff;box-shadow:0 -6px 24px rgba(5,37,54,.18);font-size:.95rem}
.book-sticky[hidden]{display:none}
.book-sticky-text{margin:0;line-height:1.4}
.book-sticky-offer,.book-sticky-offer-short{color:#ffe7a3}.book-sticky-offer-short{display:none}.book-sticky-offer~.book-sticky-extra{display:none}
.book-sticky .button{padding:9px 18px;white-space:nowrap}
.book-sticky-close{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:1.3rem;line-height:1;cursor:pointer}
.book-sticky-close:focus-visible{outline:3px solid #04d9eb;outline-offset:2px}
body.has-book-sticky{padding-bottom:72px}
@media(max-width:600px){.book-sticky-extra,.book-sticky-offer,.book-sticky-offer-short{display:none!important}}
@media(max-width:760px){.book-sticky{flex-wrap:wrap;justify-content:flex-start;gap:6px;padding:8px 52px 10px 14px;font-size:.84rem}.book-sticky-text{flex:1 1 100%}.book-sticky-text strong{font-weight:650}.book-sticky .button{flex:1 1 auto;padding:9px 14px}.book-sticky-offer{display:none!important}.book-sticky-offer-short{display:block;font-size:.78rem}.book-sticky-close{top:12px;transform:none}.book-cta-top{display:block}.book-cta-top .book-cta-copy{margin-bottom:10px}body.has-book-sticky{padding-bottom:110px}}
@media print{.book-sticky{display:none!important}}
/* LSA-BOOK-CTA CSS END */
"""


def fix_css(t):
    t = re.sub(r"\n?/\* LSA-BOOK-CTA CSS START.*?LSA-BOOK-CTA CSS END \*/\n?", "", t, flags=re.S)
    return t.rstrip("\n") + "\n" + CSS


def posts():
    for base in ("blog", "_scheduled"):
        for f in sorted((ROOT / base).glob("*/index.html")):
            yield f


def main():
    changed, problems = [], []
    for f in ROOT.rglob("*"):
        if not f.is_file() or ".git" in f.parts or f.suffix not in (".html", ".js", ".json", ".xml", ".txt", ".md", ".css"):
            continue
        if f.name in ("booking_cta.py",) or "node_modules" in f.parts:
            continue
        t = f.read_text(encoding="utf-8", errors="ignore")
        n = fix_vercel(t) if f.name == "vercel.json" and f.parent == ROOT else sitewide(t)
        if f == ROOT / "blog" / "blog.css":
            n = fix_css(t)
        if f in set(posts()):
            n = apply_post(n, f.parent.name)
        if n != t:
            changed.append(str(f.relative_to(ROOT)))
            if not CHECK:
                f.write_text(n, encoding="utf-8")
    for f in ROOT.rglob("*.html"):
        if ".git" in f.parts:
            continue
        t = f.read_text(encoding="utf-8", errors="ignore")
        for pat, why in ((r"ryan\.diyai\.ai|30-min-discovery-call", "old personal calendar URL"),
                         (r"\bRyan\b|Steinolfson", "founder name"),
                         (r"[\u2013\u2014]", "en/em dash")):
            if re.search(pat, t):
                problems.append(f"{f.relative_to(ROOT)}: {why}")
    for f in posts():
        t = f.read_text(encoding="utf-8", errors="ignore") if not CHECK else apply_post(sitewide(f.read_text()), f.parent.name)
        for blk in BLOCK.finditer(t):
            b = blk.group(0)
            for pat, why in ((r"[\u2013\u2014]", "dash in CTA"), (r"(?i)\balerts?\b", "'alerts' in CTA"),
                             (r"(?i)24 hours", "'24 hours' in CTA"), (r"(?i)accelerate|convertly", "brand in CTA"),
                             (r"(?i)credit", "credit in CTA")):
                if re.search(pat, b):
                    problems.append(f"{f.relative_to(ROOT)}: {why}")
            for num in re.findall(r"\d{3}-\d{3}-\d{4}", b):
                if num != "989-712-4370":
                    problems.append(f"{f.relative_to(ROOT)}: phone {num} in CTA")
    print(("would change" if CHECK else "changed"), len(changed), "files")
    for c in changed:
        print("  ", c)
    if problems:
        print("remaining issues (not all are fixed by this script; dashes/names elsewhere are other passes):")
        for p in sorted(set(problems)):
            print("  !", p)
    if CHECK and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
