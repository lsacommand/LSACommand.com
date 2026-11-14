/*
 * LSA Command conversion tracking (GA4 G-CSQW3SMTL4).
 *
 * Shared booking convention for every page on the site:
 *   - Every on-site "book a call" CTA links straight to https://ryan.diyai.ai/30-min-discovery-call
 *     and carries data-cta="<where-on-the-page>". Pages do NOT add their own onclick/listener for it.
 *   - book_meeting_click fires here, once per click, for any booking link.
 *   - book_meeting fires on /booked/ (the calendar's after-booking redirect), not here.
 *   - /discovery is the off-site short link (YouTube, email); it fires its own book_meeting_click.
 *
 * Events sent:
 *   generate_lead       – a visitor taps a text (sms:) or call (tel:) link. params: method, cta_location
 *   book_meeting_click  – a visitor clicks any "book a call" link.            params: cta_location
 *   (both also send link_location with the same value, for reports built on the earlier name)
 *
 * Booking links to the external calendar also carry the visit's first-touch UTMs (when the
 * visitor arrived on a UTM-tagged link) so the calendar's contact record keeps the campaign.
 * We never invent UTMs for untagged visits: the calendar already records lsacommand.com as the
 * referrer, and fake UTMs would overwrite organic/direct attribution in GA4.
 */
(function () {
  'use strict';

  var BOOKING_PATTERN = /30-min-discovery-call|^\/discovery\/?$|lsacommand\.com\/discovery\/?$/;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var STORE_KEY = 'lsa-first-touch';

  function send(name, params) {
    if (typeof window.gtag !== 'function') return;
    params.link_location = params.cta_location;
    params.page_path = window.location.pathname;
    params.transport_type = 'beacon';
    window.gtag('event', name, params);
  }

  // Remember the first UTM-tagged landing of this visit so a later booking click keeps the source.
  var firstTouch = null;
  try {
    var current = new URLSearchParams(window.location.search);
    var found = {};
    UTM_KEYS.forEach(function (key) { if (current.get(key)) found[key] = current.get(key).slice(0, 100); });
    var saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || 'null');
    if (saved) firstTouch = saved;
    else if (found.utm_source) {
      firstTouch = found;
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(found));
    }
  } catch (_) { /* Storage blocked: booking links still work, just without carried UTMs. */ }

  function locationOf(link) {
    if (link.dataset && link.dataset.cta) return link.dataset.cta;
    var section = link.closest('[id]');
    return section ? section.id : 'page';
  }

  function decorateBookingLink(link) {
    if (!firstTouch) return;
    var url;
    try { url = new URL(link.href, window.location.href); } catch (_) { return; }
    if (url.hostname === window.location.hostname) return; // internal hop (/discovery) keeps the page's own URL
    if (url.searchParams.get('utm_source')) return;
    UTM_KEYS.forEach(function (key) { if (firstTouch[key]) url.searchParams.set(key, firstTouch[key]); });
    link.href = url.toString();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var where = locationOf(link);

    if (href.indexOf('sms:') === 0) {
      send('generate_lead', { method: 'sms', cta_location: where });
    } else if (href.indexOf('tel:') === 0) {
      send('generate_lead', { method: 'call', cta_location: where });
    } else if (BOOKING_PATTERN.test(href)) {
      decorateBookingLink(link);
      send('book_meeting_click', { cta_location: where });
    }
  }, true);
})();
