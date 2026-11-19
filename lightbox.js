/* LSA Command screenshot lightbox: click or tap any screenshot to see it full size. */
(function () {
  if (window.__lsaLightbox) return; window.__lsaLightbox = true;
  var css = '.lb-zoomable{cursor:zoom-in}.lb-zoomable:focus-visible{outline:3px solid #007b8d;outline-offset:3px}' +
    '.lb-hint{display:block;font-size:.75rem;color:#4b5d6b;margin-top:6px}' +
    '.lb-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(5,20,32,.92);display:flex;flex-direction:column}' +
    '.lb-ov[hidden]{display:none}.lb-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;color:#fff;font:600 14px/1.3 Inter,system-ui,sans-serif}' +
    '.lb-cap{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}' +
    '.lb-btn{font:inherit;color:#052536;background:#fff;border:0;border-radius:999px;padding:9px 16px;cursor:pointer;min-height:40px}' +
    '.lb-btn:focus-visible{outline:3px solid #04bdce;outline-offset:2px}' +
    '.lb-stage{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;align-items:flex-start;justify-content:center;padding:0 12px 16px;touch-action:pan-x pan-y pinch-zoom}' +
    '.lb-stage img{display:block;background:#fff;border-radius:8px;max-width:100%;height:auto;cursor:zoom-in;margin:auto}' +
    '.lb-stage.lb-full img{max-width:none;cursor:zoom-out}' +
    'html.lb-lock,html.lb-lock body{overflow:hidden}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ov, img, cap, stage, btnSize, btnClose, lastFocus;
  function build() {
    ov = document.createElement('div'); ov.className = 'lb-ov'; ov.hidden = true;
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Screenshot, full size');
    ov.innerHTML = '<div class="lb-bar"><span class="lb-cap" id="lb-cap"></span>' +
      '<button type="button" class="lb-btn" data-lb-size>Actual size</button>' +
      '<button type="button" class="lb-btn" data-lb-close aria-label="Close full-size screenshot">Close &#10005;</button></div>' +
      '<div class="lb-stage"><img alt=""></div>';
    document.body.appendChild(ov);
    img = ov.querySelector('img'); cap = ov.querySelector('.lb-cap'); stage = ov.querySelector('.lb-stage');
    btnSize = ov.querySelector('[data-lb-size]'); btnClose = ov.querySelector('[data-lb-close]');
    ov.setAttribute('aria-describedby', 'lb-cap');
    btnClose.addEventListener('click', close);
    btnSize.addEventListener('click', toggle);
    img.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    stage.addEventListener('click', function (e) { if (e.target === stage) close(); });
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        var f = [btnSize, btnClose], i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    });
  }
  function toggle() {
    var full = stage.classList.toggle('lb-full');
    btnSize.textContent = full ? 'Fit to screen' : 'Actual size';
  }
  function captionFor(el) {
    var fig = el.closest('figure'), fc = fig && fig.querySelector('figcaption:not(.flex)');
    var t = (fc && fc.textContent.trim()) || el.getAttribute('alt') || '';
    return t.replace(/\s+/g, ' ');
  }
  function open(el) {
    if (!ov) build();
    lastFocus = document.activeElement;
    img.src = el.currentSrc || el.src; img.alt = el.getAttribute('alt') || '';
    cap.textContent = el.dataset.lbCap || captionFor(el);
    stage.classList.remove('lb-full'); btnSize.textContent = 'Actual size';
    ov.hidden = false; document.documentElement.classList.add('lb-lock'); stage.scrollTop = 0;
    btnClose.focus();
    if (window.gtag) try { gtag('event', 'screenshot_expand', { image: (el.getAttribute('src') || '').split('/').pop() }); } catch (e) {}
  }
  function close() {
    ov.hidden = true; document.documentElement.classList.remove('lb-lock'); img.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function eligible(el) {
    if (el.closest('a,button,header,nav,footer,[data-no-zoom],.lb-ov')) return false;
    var src = el.getAttribute('src') || '';
    if (/logo|favicon|avatar|icon/i.test(src)) return false;
    var w = parseInt(el.getAttribute('width') || '0', 10) || el.naturalWidth || 0;
    return w >= 300 || el.classList.contains('shot') || !!el.closest('figure');
  }
  function init() {
    var imgs = document.querySelectorAll('main img, article img, .wyg img, figure img');
    Array.prototype.forEach.call(imgs, function (el) {
      if (el.dataset.lb || !eligible(el)) return;
      el.dataset.lb = '1'; el.dataset.lbCap = captionFor(el); el.classList.add('lb-zoomable');
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Expand screenshot: ' + (el.getAttribute('alt') || 'image'));
      el.addEventListener('click', function () { open(el); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el); } });
      var fig = el.closest('figure');
      if (fig && !fig.querySelector('.lb-hint')) {
        var h = document.createElement('span'); h.className = 'lb-hint'; h.setAttribute('aria-hidden', 'true');
        h.textContent = 'Click or tap the screenshot to see it full size.';
        var fc = fig.querySelector('figcaption:not(.flex)'); (fc || fig).appendChild(h);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
