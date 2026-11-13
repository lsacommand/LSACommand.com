(() => {
  'use strict';
  const key = 'lsa-affiliate-referral';
  const lifetime = 60 * 24 * 60 * 60 * 1000;
  const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
  const query = new URLSearchParams(window.location.search).get('fpr');
  let referral = valid(query) ? query : null;
  try {
    if (referral) localStorage.setItem(key, JSON.stringify({ token: referral, expires: Date.now() + lifetime }));
    else {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && saved.expires > Date.now() && valid(saved.token)) referral = saved.token;
    }
  } catch (_) { /* The current link still works if browser storage is disabled. */ }
  // Use the app's signup and authentication flow. Only referral attribution
  // crosses origins; account credentials and session tokens stay in the app.
  const destination = new URL('https://app.lsacommand.com/signup-agency');
  if (referral) destination.searchParams.set('fpr', referral);
  document.getElementById('continue-signup').href = destination.href;
  let continued = false;
  const continueSignup = () => {
    if (continued) return;
    continued = true;
    window.location.replace(destination.href);
  };
  // Preserve click tracking without letting a blocked analytics script block signup.
  const fallback = setTimeout(continueSignup, 1500);
  if (typeof window.fpr === 'function') {
    try {
      window.fpr('click', referral ? { ref_id: referral } : {}, () => {
        clearTimeout(fallback);
        continueSignup();
      });
    } catch (_) { continueSignup(); }
  } else { continueSignup(); }
})();
