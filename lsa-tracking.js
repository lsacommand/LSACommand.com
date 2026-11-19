/*
 * LSA Command conversion tracking (GA4 G-CSQW3SMTL4).
 *
 * KPI: booked walkthroughs on https://lsacommand.com/book/, attributed to the post that sent them.
 *
 * Booking convention for every page on the site:
 *   - Every "book" CTA links to /book/ (absolute https://lsacommand.com/book/ is fine) and carries
 *     data-cta="<where-on-the-page>". Blog CTA blocks also carry data-cta-position (top, mid, end, sticky).
 *   - Pages do NOT add their own click listener for booking links. This file handles all of it.
 *
 * Events sent from here:
 *   book_cta_click : a visitor clicks any booking link.  params: cta_position, cta_location, post_slug
 *   contact_click  : a visitor taps a call (tel:) or text (sms:) link.  params: method, cta_location, post_slug
 *   book_sticky_dismiss : the visitor closed the sticky booking bar.
 * Events sent from /book/ and /booked/ (see those pages):
 *   generate_lead + booking_complete : a booking is confirmed (mark generate_lead as a key event).
 *
 * Attribution carried to /book/ (and from there into the calendar's booking record):
 *   - First-touch UTMs (utm_source, utm_medium, utm_campaign, utm_content, utm_term) are kept in
 *     localStorage for 90 days, across pages and visits. We never invent UTMs for untagged visits.
 *   - post_slug (the blog post or page the CTA was on) and cta_position are added to the /book/ link
 *     on click and saved in localStorage, so a completed booking is credited to the originating post.
 */
(function () {
  'use strict';

  var BOOKING_PATTERN = /^(https?:\/\/(www\.)?lsacommand\.com)?\/(book|discovery)\/?(\?|#|$)/;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var FIRST_TOUCH_KEY = 'lsa-first-touch-v2';
  var ORIGIN_KEY = 'lsa-book-origin';
  var NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  function store() { try { return window.localStorage; } catch (_) { return null; } }
  function readJSON(key) { var s = store(); if (!s) return null; try { return JSON.parse(s.getItem(key) || 'null'); } catch (_) { return null; } }
  function writeJSON(key, value) { var s = store(); if (!s) return; try { s.setItem(key, JSON.stringify(value)); } catch (_) {} }

  // post_slug: the blog slug on /blog/<slug>/, otherwise a short page key (home, pricing, agencies...).
  function postSlug(pathname) {
    var p = (pathname || window.location.pathname).replace(/\/index\.html$/, '/');
    var m = p.match(/^\/blog\/([^\/]+)\/?$/);
    if (m) return m[1];
    var key = p.replace(/^\/|\/$/g, '').replace(/\//g, '_').replace(/\.html$/, '');
    return key || 'home';
  }
  window.lsaPostSlug = postSlug;

  // First-touch UTMs: saved once, kept 90 days, never overwritten by a later untagged visit.
  var firstTouch = readJSON(FIRST_TOUCH_KEY);
  if (firstTouch && (!firstTouch.ts || Date.now() - firstTouch.ts > NINETY_DAYS)) firstTouch = null;
  try {
    var here = new URLSearchParams(window.location.search);
    if (!firstTouch && here.get('utm_source')) {
      firstTouch = { ts: Date.now(), landing: postSlug() };
      UTM_KEYS.forEach(function (k) { var v = here.get(k); if (v) firstTouch[k] = v.slice(0, 100); });
      writeJSON(FIRST_TOUCH_KEY, firstTouch);
    }
  } catch (_) {}

  function send(name, params) {
    params.post_slug = params.post_slug || postSlug();
    params.page_path = window.location.pathname;
    params.link_location = params.cta_location;
    params.transport_type = 'beacon';
    if (firstTouch) UTM_KEYS.forEach(function (k) { if (firstTouch[k]) params['first_' + k] = firstTouch[k]; });
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  function locationOf(link) {
    if (link.dataset && link.dataset.cta) return link.dataset.cta;
    var section = link.closest('[id]');
    return section ? section.id : 'page';
  }
  function positionOf(link, where) {
    if (link.dataset && link.dataset.ctaPosition) return link.dataset.ctaPosition;
    if (/nav|header/.test(where)) return 'nav';
    if (/footer/.test(where)) return 'footer';
    if (/sticky/.test(where)) return 'sticky';
    if (/hero|early|start|top/.test(where)) return 'top';
    if (/mid/.test(where)) return 'mid';
    return 'inline';
  }

  // Booking link: add post_slug + cta_position (and first-touch UTMs) so /book/ and the calendar get them.
  function decorate(link, slug, position) {
    var url;
    try { url = new URL(link.href, window.location.href); } catch (_) { return; }
    url.searchParams.set('post_slug', slug);
    url.searchParams.set('cta_position', position);
    if (firstTouch && !url.searchParams.get('utm_source')) UTM_KEYS.forEach(function (k) { if (firstTouch[k]) url.searchParams.set(k, firstTouch[k]); });
    link.href = url.toString();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var where = locationOf(link);
    var slug = postSlug();

    if (href.indexOf('sms:') === 0) {
      send('contact_click', { method: 'sms', cta_location: where, post_slug: slug });
    } else if (href.indexOf('tel:') === 0) {
      send('contact_click', { method: 'call', cta_location: where, post_slug: slug });
    } else if (BOOKING_PATTERN.test(href) && !/^\/book(ed)?\//.test(window.location.pathname)) {
      var position = positionOf(link, where);
      writeJSON(ORIGIN_KEY, { post_slug: slug, cta_position: position, cta_location: where, ts: Date.now() });
      decorate(link, slug, position);
      send('book_cta_click', { cta_position: position, cta_location: where, post_slug: slug });
      try { window.sessionStorage.setItem('lsa-sticky-clicked', '1'); } catch (_) {}
    }
  }, true);

  // Sticky booking bar (blog posts): shows after the top CTA scrolls away, hides while any other
  // in-article booking CTA or the footer is on screen, and stays closed for 7 days once dismissed.
  function initSticky() {
    var bar = document.querySelector('[data-lsa-sticky]');
    if (!bar || !('IntersectionObserver' in window)) return;
    var DISMISS_KEY = 'lsa-sticky-dismissed';
    var dismissed = readJSON(DISMISS_KEY);
    if (dismissed && Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return;
    try { if (window.sessionStorage.getItem('lsa-sticky-clicked')) return; } catch (_) {}
    var top = document.querySelector('[data-lsa-cta="top"]');
    var watched = Array.prototype.slice.call(document.querySelectorAll('[data-lsa-cta], article a[data-cta-position], .site-footer'));
    var visible = new Set();
    var pastTop = !top;
    function update() {
      var show = pastTop && visible.size === 0;
      bar.hidden = !show;
      document.body.classList.toggle('has-book-sticky', show);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
        if (e.target === top) pastTop = !e.isIntersecting && e.boundingClientRect.top < 0;
      });
      update();
    });
    watched.forEach(function (el) { if (!bar.contains(el)) io.observe(el); });
    var close = bar.querySelector('[data-lsa-sticky-close]');
    if (close) close.addEventListener('click', function () {
      writeJSON(DISMISS_KEY, Date.now());
      io.disconnect();
      bar.hidden = true;
      document.body.classList.remove('has-book-sticky');
      send('book_sticky_dismiss', { cta_location: 'sticky-dismiss' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSticky); else initSticky();
})();

// Screenshot lightbox (click or tap to expand) on every page.
(function () {
  if (window.__lsaLightbox || document.querySelector('script[src^="/lightbox.js"]')) return;
  var s = document.createElement('script'); s.src = '/lightbox.js?v=1'; s.defer = true; document.head.appendChild(s);
})();
