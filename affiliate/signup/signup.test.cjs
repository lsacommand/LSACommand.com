const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/signup.js', 'utf8');
function run(search = '', saved = null, blocked = false) {
  const link = {};
  let target;
  vm.runInNewContext(source, {
    URL, URLSearchParams, Date, setTimeout: () => 1, clearTimeout: () => {},
    window: { location: { search, replace(value) { target = value; } } },
    document: { getElementById(id) { assert.equal(id, 'continue-signup'); return link; } },
    localStorage: { getItem() { if (blocked) throw Error('blocked'); return saved; }, setItem() { if (blocked) throw Error('blocked'); } },
  });
  assert.equal(link.href, target);
  return target;
}
const base = 'https://app.lsacommand.com/signup-agency';
assert.equal(run(), base);
assert.equal(run('?fpr=partner_123'), base + '?fpr=partner_123');
assert.equal(run('?fpr=partner_123', null, true), base + '?fpr=partner_123');
assert.equal(run('', JSON.stringify({token:'saved-partner', expires:Date.now()+60000})), base+'?fpr=saved-partner');
assert.equal(run('?fpr=current', JSON.stringify({token:'previous', expires:Date.now()+60000})), base+'?fpr=current');
assert.equal(run('', JSON.stringify({token:'expired', expires:0})), base);
assert.equal(run('', '{broken'), base);
assert.equal(run('?fpr=https://evil.example&redirect=https://evil.example&token=private'), base);
assert.equal(run('', null, true), base);
console.log('Affiliate entry: referral preservation, expiry, blocked storage, fixed destination and sensitive query filtering passed.');
for (const behavior of ['callback','blocked','throws']) {
  let navigateCount = 0, callback, timeout;
  vm.runInNewContext(source, {
    URL, URLSearchParams, Date,
    document: {getElementById:()=>({})},
    localStorage: {getItem:()=>null,setItem:()=>{}},
    setTimeout(fn){timeout=fn;return 1;}, clearTimeout(){},
    window: {location:{search:'?fpr=partner',replace(url){assert.equal(url,base+'?fpr=partner');navigateCount++;}}, fpr(action,payload,fn){assert.equal(action,'click');assert.equal(payload.ref_id,'partner');if(behavior==='throws')throw Error('blocked');callback=fn;}},
  });
  if (behavior==='callback') callback();
  timeout();
  if(callback)callback();
  assert.equal(navigateCount,1);
}
console.log('Click tracking completion, blocked trackers, errors and duplicate callbacks all continue exactly once.');
