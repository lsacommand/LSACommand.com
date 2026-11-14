/*
 * LSA Command free tools: shared page behavior (inputs → live results, share links, GA4 events).
 * The math lives in calc.js. Each tool page calls LSATools.mount({ form, tool, compute, extra }).
 *
 * GA4 (G-CSQW3SMTL4) events sent from here:
 *   tool_used           params: tool_name, interaction ('calculate' | 'share_link' | 'open_shared_link' | 'reset'), plus page extras
 *                       'calculate' fires once the visitor stops typing for 1.5s (max 20 per page view), never for the default numbers.
 *   book_meeting_click  params: cta_location, link_location. Fallback only: when /lsa-tracking.js (PR #9) is live it sends this
 *                       event itself and sets window.__lsaTracking via the script tag's onload, so this listener stands down.
 */
(function () {
  'use strict';

  var BOOKING_PATTERN = /30-min-discovery-call|^\/discovery\/?$/;
  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    var s = moneyFmt.format(Math.round(n));
    return s.charAt(0) === '-' ? '−' + s.slice(1) : s;
  }
  function signedMoney(n) {
    if (n == null || !isFinite(n)) return '—';
    return (Math.round(n) > 0 ? '+' : '') + money(n);
  }
  function num(n, digits) {
    if (n == null || !isFinite(n)) return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 0 : digits, minimumFractionDigits: 0 });
  }
  function set(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function send(name, params) {
    if (typeof window.gtag !== 'function') return;
    params.page_path = window.location.pathname;
    params.transport_type = 'beacon';
    window.gtag('event', name, params);
  }

  function parse(raw) {
    var cleaned = String(raw).replace(/[$,%\s]/g, '');
    if (cleaned === '') return NaN;
    return Number(cleaned);
  }

  function mount(opts) {
    var form = opts.form;
    var fields = Array.prototype.slice.call(form.querySelectorAll('input[name]'));
    var status = form.querySelector('[data-status]');
    var sent = 0, timer = null;

    function values() {
      var out = {}, ok = true;
      fields.forEach(function (input) {
        if (input.type === 'radio') {
          if (input.checked) out[input.name] = input.value;
          return;
        }
        var v = parse(input.value);
        var min = input.min === '' ? -Infinity : Number(input.min);
        var max = input.max === '' ? Infinity : Number(input.max);
        var bad = !isFinite(v) || v < min || v > max;
        if (input.closest('[hidden]')) bad = false; // inactive mode
        input.setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad && !input.closest('[hidden]')) ok = false;
        out[input.name] = v;
      });
      out._valid = ok;
      return out;
    }

    function run() {
      var v = values();
      form.classList.toggle('has-errors', !v._valid);
      opts.compute(v._valid ? v : null, v);
      return v;
    }

    function track(interaction) {
      if (sent >= 20) return;
      sent++;
      var params = { tool_name: opts.tool, interaction: interaction };
      if (opts.extra) {
        var extra = opts.extra(values());
        for (var k in extra) params[k] = extra[k];
      }
      send('tool_used', params);
    }

    form.addEventListener('input', function () {
      var v = run();
      clearTimeout(timer);
      if (v._valid) timer = setTimeout(function () { track('calculate'); }, 1500);
    });
    form.addEventListener('change', run);
    form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

    // Shareable links: numbers ride in the #hash, so they never reach a server or GA page URLs.
    var hash = window.location.hash.slice(1);
    if (hash.indexOf('=') > -1) {
      var params = new URLSearchParams(hash), used = false;
      fields.forEach(function (input) {
        if (!params.has(input.name)) return;
        var val = params.get(input.name).slice(0, 20);
        if (input.type === 'radio') input.checked = input.value === val;
        else input.value = val;
        used = true;
      });
      if (used) { form.dispatchEvent(new Event('change')); setTimeout(function () { track('open_shared_link'); }, 0); }
    }

    var shareBtn = form.querySelector('[data-share]');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var p = new URLSearchParams();
      fields.forEach(function (input) {
        if (input.type === 'radio') { if (input.checked) p.set(input.name, input.value); }
        else if (!input.closest('[hidden]')) p.set(input.name, input.value);
      });
      var url = window.location.origin + window.location.pathname + '#' + p.toString();
      try { window.history.replaceState(null, '', '#' + p.toString()); } catch (_) {}
      var done = function (msg) { if (status) status.textContent = msg; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done('Link copied. Anyone who opens it sees these numbers.'); },
          function () { done('Copy this link: ' + url); });
      } else done('Copy this link: ' + url);
      track('share_link');
    });

    var resetBtn = form.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      setTimeout(function () {
        try { window.history.replaceState(null, '', window.location.pathname); } catch (_) {}
        if (status) status.textContent = '';
        run();
        track('reset');
      }, 0);
    });

    run();
  }

  // book_meeting_click fallback (see header). data-cta names the spot on the page.
  document.addEventListener('click', function (event) {
    if (window.__lsaTracking) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || !BOOKING_PATTERN.test(link.getAttribute('href') || '')) return;
    var where = (link.dataset && link.dataset.cta) || 'page';
    send('book_meeting_click', { cta_location: where, link_location: where });
  }, true);

  window.LSATools = { mount: mount, money: money, signedMoney: signedMoney, num: num, set: set };
})();
