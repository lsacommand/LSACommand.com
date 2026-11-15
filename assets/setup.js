(() => {
 let activeVideo = null;
 document.querySelectorAll('[data-youtube]').forEach(button => button.addEventListener('click', () => {
  if (activeVideo) activeVideo.player.replaceWith(activeVideo.button);
  const player = document.createElement('iframe');
  player.src = 'https://www.youtube.com/embed/' + button.dataset.youtube + '?autoplay=1&playsinline=1&rel=0';
  player.title = button.getAttribute('aria-label').replace(/^Play /, '');
  player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  player.allowFullscreen = true;
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  button.replaceWith(player);
  activeVideo = { button, player };
  player.focus();
 }));
 const boxes = [...document.querySelectorAll('[data-check]')];
 const key = 'lsa-setup-checklist-v1';
 const status = document.querySelector('#save-status');
 let saved = {};
 try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
 boxes.forEach(box => { box.checked = saved[box.dataset.check] === true; });
 function render(save) {
  const total = boxes.filter(box => box.checked).length;
  document.querySelector('#progress').value = total;
  document.querySelector('#progress-label').textContent = `${total} of ${boxes.length} complete`;
  if (save) {
   try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(boxes.map(box => [box.dataset.check,box.checked])))); status.textContent = total === boxes.length ? 'Checklist complete. Your progress is saved in this browser.' : `${total} of ${boxes.length} complete. Saved in this browser.`; }
   catch (_) { status.textContent = 'Browser storage is unavailable. Your checks will last only for this visit.'; }
  }
 }
 boxes.forEach(box => box.addEventListener('change', () => render(true)));
 document.querySelector('#reset').addEventListener('click', () => { boxes.forEach(box => box.checked = false); render(true); });
 render(false);
 let timer;
 document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const toast = document.querySelector('#toast');
  try { await navigator.clipboard.writeText(button.dataset.copy); toast.textContent = 'Copied to clipboard'; }
  catch (_) { toast.textContent = 'Select and copy the value shown beside this button.'; }
  toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove('show'), 3000);
 }));
 const referral = new URLSearchParams(location.search).get('fpr');
 if (referral && /^[a-zA-Z0-9_-]{1,128}$/.test(referral)) document.querySelectorAll('a[href="/affiliate/signup"]').forEach(link => link.href = '/affiliate/signup?fpr=' + encodeURIComponent(referral));
})();
