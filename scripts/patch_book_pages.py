#!/usr/bin/env python3
"""One-time (safe to re-run) rewrite of /book/, /booked/ and /discovery/ for the booking KPI.
Run before scripts/booking_cta.py.  python3 scripts/patch_book_pages.py"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

BOOK_SCRIPT = r'''<script src="/lsa-tracking.js" defer></script>
    <script>
        // ===== BOOKING CALENDAR (LeadConnector / GoHighLevel) =====================================
        // LSA_BOOKING_EMBED_URL: the calendar's widget URL. Swap this ONE line to change calendars.
        // LSA_CALENDAR_READY: keep false until scripts/check_booking_calendar.py passes, i.e. the
        // calendar shows LSA Command branding only (no personal name, photo, other brand, or other
        // phone) and its confirmation redirect is https://lsacommand.com/booked/. While false, this
        // page shows the call/text fallback instead of the calendar.
        window.LSA_BOOKING_EMBED_URL = 'https://api.leadconnectorhq.com/widget/booking/P4Z0PkG4Jn47zv6Iq3lE';
        window.LSA_CALENDAR_READY = false;
        // ===========================================================================================
        (function () {
            var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
            var SENT_KEY = 'lsa-booking-sent';
            function readJSON(k) { try { return JSON.parse(window.localStorage.getItem(k) || 'null'); } catch (_) { return null; } }

            // 1. Attribution for this booking: URL params first, then what lsa-tracking.js saved.
            var here = new URLSearchParams(window.location.search);
            var first = readJSON('lsa-first-touch-v2');
            if (first && first.ts && Date.now() - first.ts > 90 * 864e5) first = null;
            var origin = readJSON('lsa-book-origin');
            if (origin && origin.ts && Date.now() - origin.ts > 864e5) origin = null;
            var attr = {
                post_slug: here.get('post_slug') || (origin && origin.post_slug) || (document.referrer ? 'unknown_referrer' : 'direct'),
                cta_position: here.get('cta_position') || (origin && origin.cta_position) || 'direct'
            };
            UTM.forEach(function (k) { var v = here.get(k) || (first && first[k]); if (v) attr[k] = String(v).slice(0, 100); });
            window.lsaBookingAttribution = attr;

            // 2. Put them on this page's URL: LeadConnector's form_embed.js hands the parent page's
            //    query params to the calendar (fetch-query-params), which fills UTM attribution and
            //    hidden fields (post_slug, cta_position) on the booking record. Also set on the iframe src.
            try {
                var u = new URL(window.location.href);
                Object.keys(attr).forEach(function (k) { u.searchParams.set(k, attr[k]); });
                window.history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString() + u.hash);
            } catch (_) {}
            function frameSrc() {
                var url = new URL(window.LSA_BOOKING_EMBED_URL);
                Object.keys(attr).forEach(function (k) { url.searchParams.set(k, attr[k]); });
                return url.toString();
            }

            // 3. Confirmed booking: fire booking_complete + generate_lead once, then go to /booked/.
            window.lsaBookingConfirmed = function (source) {
                var last = readJSON(SENT_KEY);
                var dup = last && Date.now() - last < 30 * 60 * 1000;
                var params = { method: 'walkthrough_booking', booking_source: source };
                Object.keys(attr).forEach(function (k) { params[k] = attr[k]; });
                var next = '/booked/?post_slug=' + encodeURIComponent(attr.post_slug) + '&cta_position=' + encodeURIComponent(attr.cta_position) + '&tracked=1';
                var gone = false;
                function go() { if (!gone) { gone = true; window.location.assign(next); } }
                if (dup || typeof window.gtag !== 'function') { go(); return; }
                try { window.localStorage.setItem(SENT_KEY, JSON.stringify(Date.now())); } catch (_) {}
                window.gtag('event', 'booking_complete', params);
                window.gtag('event', 'generate_lead', Object.assign({ event_callback: go, event_timeout: 1500 }, params));
                setTimeout(go, 1800);
            };
            window.addEventListener('message', function (event) {
                var host = (event.origin || '').replace(/^https?:\/\//, '');
                if (!/(^|\.)(leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com)$/.test(host)) return;
                var d = event.data;
                if (Array.isArray(d) && d[0] === 'msgsndr-booking-complete') window.lsaBookingConfirmed('calendar_postmessage');
            });

            // 4. Load the calendar (or the fallback while the calendar is not LSA Command branded).
            function load() {
                var wrap = document.getElementById('lsa-booking-wrap');
                var frame = document.getElementById('lsa-booking-frame');
                var fallback = document.getElementById('lsa-booking-fallback');
                if (!wrap || !frame) return;
                if (!window.LSA_CALENDAR_READY) { wrap.hidden = true; if (fallback) fallback.hidden = false; return; }
                if (frame.getAttribute('src')) return;
                frame.setAttribute('src', frameSrc());
                var helper = document.createElement('script');
                helper.src = 'https://link.msgsndr.com/js/form_embed.js';
                document.body.appendChild(helper);
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
        })();
    </script>
  '''

BOOK_MAIN = '''<main id="main" class="container">
    <section class="book" id="book">
      <p class="eyebrow">30-minute walkthrough · built for agencies only</p>
      <h1>100% of your clients' Google LSA calls answered within 30 seconds. See how in 30 minutes.</h1>
      <p class="lede">Each client's team gets the first 10 to 15 seconds, then AI answers, and AI messaging replies instantly. Open one client's Google Local Services Ads account on a screen share and the LSA Command team audits it live, so no passwords change hands.</p>
      <!-- BLACK-FRIDAY-OFFER START (remove on 2026-12-16) -->
      <p class="book-offer"><strong>Black Friday offer:</strong> get 5 client locations live on LSA Command by December 15, 2026, and the first month is free on every location you add before December 15.</p>
      <!-- BLACK-FRIDAY-OFFER END -->
      <div class="book-frame" id="lsa-booking-wrap">
        <h2 class="book-pick">Pick a time for your 30-minute walkthrough.</h2>
        <p class="book-pick-note">On the call, have one client's Google LSA account open to share on screen. You do not need it to book.</p>
        <iframe id="lsa-booking-frame" title="Book an LSA Command walkthrough, 30 minutes" loading="eager" scrolling="no"></iframe>
        <p class="book-alt">Prefer the phone? Call <a href="tel:+19897124370" data-cta="book-call">989-712-4370</a> or <a href="sms:+19897124370?&amp;body=LSA%20Command%20walkthrough.%20My%20agency%20name%20and%20two%20times%20that%20work%3A%20" data-cta="book-text">text us</a>.</p>
      </div>
      <div class="book-fallback cta-box" id="lsa-booking-fallback" hidden>
        <h2>Book by text. It takes one message.</h2>
        <p>Text your agency name and two times that work to 989-712-4370. The LSA Command team confirms by text and sends the calendar invite.</p>
        <a class="button" href="sms:+19897124370?&amp;body=LSA%20Command%20walkthrough.%20My%20agency%20name%20and%20two%20times%20that%20work%3A%20" data-cta="book-fallback-text">Text two times to 989-712-4370</a> <a class="button button-ghost" href="tel:+19897124370" data-cta="book-fallback-call">Call 989-712-4370</a>
      </div>
      <noscript><p>The booking calendar needs JavaScript. Call or text <a href="tel:+19897124370">989-712-4370</a> and we will set up a time.</p></noscript>
      <p class="book-proof">Across three pool contractor accounts, leads answered within 30 seconds went from 28% to 100%, December 2025 to April 2026. <a href="/case-studies/" data-cta="book-proof">See the case studies</a>.</p>
      <h2 class="book-after">What you see in 30 minutes</h2>
      <p>The full flow on a real account: the call answered, lead notes, High-value leads identified, and the notifications your clients get. When the AI books a job on a call, you see the Lead Summary filled in inside Google's LSA platform: Lead Status Booked, customer name, location and appointment.</p>
      <p>Then the LSA Command team audits your own client's account live, so you can compare what you just saw with what Google gives you today.</p>
      <p><strong>$200 per month per client. Built for agencies only.</strong> You leave with what the audit found on that account, whether or not you go ahead.</p>
    </section>
  </main>'''

BOOKED_SCRIPT = r'''<script>
        // Booking confirmed. Two ways to land here:
        //  1. /book/ saw the calendar's msgsndr-booking-complete message, fired booking_complete +
        //     generate_lead, and sent the visitor here with tracked=1.
        //  2. The calendar's own confirmation redirect (set to https://lsacommand.com/booked/ in
        //     LeadConnector). That can load this page inside the calendar iframe, so break out first.
        // Either way, booking_complete + generate_lead fire at most once per 30 minutes.
        (function () {
            if (window.top !== window.self) { try { window.top.location.replace(window.location.href); return; } catch (_) {} }
            var KEY = 'lsa-booking-sent';
            var last = null;
            try { last = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (_) {}
            if (last && Date.now() - last < 30 * 60 * 1000) return;
            try { window.localStorage.setItem(KEY, JSON.stringify(Date.now())); } catch (_) {}
            var q = new URLSearchParams(window.location.search), origin = null, first = null;
            try { origin = JSON.parse(window.localStorage.getItem('lsa-book-origin') || 'null'); first = JSON.parse(window.localStorage.getItem('lsa-first-touch-v2') || 'null'); } catch (_) {}
            var params = {
                method: 'walkthrough_booking',
                booking_source: 'booked_page',
                post_slug: q.get('post_slug') || (origin && origin.post_slug) || 'unknown',
                cta_position: q.get('cta_position') || (origin && origin.cta_position) || 'unknown'
            };
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { var v = q.get(k) || (first && first[k]); if (v) params[k] = String(v).slice(0, 100); });
            gtag('event', 'booking_complete', params);
            gtag('event', 'generate_lead', params);
        })();
    </script>'''


BOOK_CSS = '''
    .book-proof{margin:0 0 20px;padding:12px 16px;border-left:4px solid var(--teal,#007b8d);background:#f2fafc;border-radius:8px}
    .book-offer{margin:0 0 20px;padding:12px 16px;border-radius:12px;background:#fff7e0;border:1px solid #f2d68a}
    .book-pick{font-size:1.25rem;margin:0;padding:18px 22px 0}
    .book-frame .book-alt{padding:0 22px 18px}
    .book-proof-line{margin:-8px 0 18px;font-weight:600;color:#183e52}
    .book-pick-note{margin:6px 0 0;padding:0 22px;color:var(--muted)}
    .book-after{font-size:1.4rem;margin:36px 0 12px}
    .book-fallback[hidden],.book-frame[hidden]{display:none}'''


def book():
    import re
    p = ROOT / "book/index.html"; t = p.read_text()
    a = t.index('<script src="/lsa-tracking.js" defer></script>'); b = t.index('<meta charset="UTF-8">')
    t = t[:a] + BOOK_SCRIPT + t[b:]
    ms = t.index('<main id="main"'); me = t.index('</main>') + len('</main>')
    t = t[:ms] + BOOK_MAIN + t[me:]
    t = re.sub(r"\n    \.book-proof\{.*?\.book-frame\[hidden\]\{display:none\}", "", t, flags=re.S)
    t = t.replace('.book-alt{margin-top:18px;color:var(--muted)}', '.book-alt{margin-top:18px;color:var(--muted)}' + BOOK_CSS, 1)
    t = re.sub(r"<title>.*?</title>", "<title>Book a 30-Minute LSA Command Walkthrough | LSA Command</title>", t, count=1)
    p.write_text(t)


def booked():
    p = ROOT / "booked/index.html"; t = p.read_text()
    if "booking_complete" in t:
        return
    a = t.index('<script>\n        // Booking confirmed'); b = t.index('</script>', a) + len('</script>')
    p.write_text(t[:a] + BOOKED_SCRIPT + t[b:])


def discovery():
    p = ROOT / "discovery/index.html"; t = p.read_text()
    t = t.replace("var target = new URL('https://ryan.diyai.ai/30-min-discovery-call');",
                  "var target = new URL('/book/', window.location.href);\n            target.searchParams.set('post_slug', 'discovery_shortlink');\n            target.searchParams.set('cta_position', 'shortlink');")
    t = t.replace("count the visit in GA4, then go to the calendar.", "count the visit in GA4, then open /book/.")
    t = t.replace("Opening Ryan's calendar | LSA Command", "Opening the booking calendar | LSA Command")
    t = t.replace("<p>Opening Ryan's calendar…</p>", "<p>Opening the LSA Command booking calendar…</p>")
    t = t.replace('https://ryan.diyai.ai/30-min-discovery-call', 'https://lsacommand.com/book/?post_slug=discovery_shortlink&amp;cta_position=shortlink')
    p.write_text(t)


book(); booked(); discovery(); print("book pages patched")
