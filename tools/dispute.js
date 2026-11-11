/*
 * LSA Command free tools: LSA lead dispute and credit helper, the logic and nothing else.
 * Pure functions, no DOM, so the same file runs in the browser (window.LSADispute) and in Node tests.
 *
 * It reads one lead's details and says how the lead lines up with Google's published Local Services Ads
 * lead-credit rules, then drafts the feedback text to paste into the lead's "Rate this lead" form.
 * It is not Google's decision: Google decides every credit. Each rule's help-page id is in `sources`.
 * Rules checked 2026-11-11 against:
 *   7195435   How leads work: what counts as a valid (charged) lead, spam and duplicates filtered,
 *             the 20-second missed-call rule, the 15-day repeat-contact rule, the feedback survey.
 *   15100654  Automated lead credits: credits usually within 30 days, "job type not serviced" and
 *             "geo not serviced" no longer credited, no credits for health care, tax specialists or EMEA.
 *   11444751  Leads can only be disputed within 30 days.
 *
 * Input: { leadType, chargeStatus, region, reason, daysAgo: 0-365, charge: >= 0 } plus optional
 *        { leadDate: 'YYYY-MM-DD', details: string } for the draft text.
 * Output: null if anything required is missing or invalid, otherwise
 *         { verdict, label, summary, notes[], steps[], sources[], draft, draftKind }.
 */
(function (root) {
  'use strict';

  var WINDOW_DAYS = 30;     // 11444751 and 15100654
  var REPEAT_DAYS = 15;     // 7195435
  var DETAILS_MAX = 300;

  var LEAD_TYPES = { call: 'Phone call', message: 'Message', booking: 'Booking request' };
  var STATUSES = { charged: 'Charged', inreview: 'In review', notcharged: 'Not charged', credited: 'Credited' };
  var REGIONS = { usca: 'US or Canada', other: 'Elsewhere outside Europe, the Middle East and Africa',
                  healthcare: 'Health care category', tax: 'Tax specialist category', emea: 'Europe, the Middle East or Africa' };

  var VERDICTS = {
    strong: 'Good case for a credit',
    possible: 'Worth flagging, no promise',
    unlikely: 'Google says it doesn’t credit this',
    not_eligible: 'Credits aren’t available for this account',
    too_late: 'Past the 30-day window',
    wait: 'Google is already reviewing it',
    nothing: 'Nothing to dispute'
  };

  /* Each reason: what it is, how it lines up with Google's rules, and the start of the feedback text. */
  var REASONS = {
    spam: { label: 'Spam, robocall or bot', verdict: 'strong', source: '7195435',
      why: 'Google says its systems filter invalid activity such as spam and credit low-quality leads. A spam lead that still shows as charged is the clearest case there is.',
      text: 'Spam or robocall, not a real customer. There was no service request.' },
    duplicate: { label: 'Same customer again within 15 days (same number or email)', verdict: 'strong', source: '7195435',
      why: 'Google says follow-up calls or messages from the same phone number or email within 15 days of a charged lead aren’t charged again.',
      text: 'Duplicate lead. This customer already contacted us from the same phone number or email within the last 15 days, and that earlier lead was charged.' },
    missedcall: { label: 'Missed call that shouldn’t be charged (under 20 seconds, outside hours, or hung up at the phone menu)', verdict: 'strong', source: '7195435',
      why: 'Google only charges a missed call when it comes in during Business Profile hours (and the ad schedule, if set) and the caller stays on more than 20 seconds. With a phone menu, the 20 seconds start at the first key press.',
      text: 'Missed call that doesn’t meet the charged-call rules: the caller hung up within 20 seconds, called outside our business hours, or hung up at our phone menu without pressing a key.' },
    solicitation: { label: 'Sales pitch, vendor or job seeker', verdict: 'possible', source: '7195435',
      why: 'This isn’t a customer asking for service, so it’s a low-quality lead. Google’s current help pages don’t name solicitation as a credit reason, so there’s no promise.',
      text: 'Solicitation, not a customer. The caller was selling a product or service to us and did not request any work.' },
    wrongnumber: { label: 'Wrong number, or looking for a different business', verdict: 'possible', source: '7195435',
      why: 'Google pays out on leads related to the business. A caller trying to reach someone else isn’t one, but Google’s current pages don’t name wrong numbers as a credit reason.',
      text: 'Wrong number. The customer was trying to reach a different business and did not want our services.' },
    other: { label: 'Something else that isn’t a real lead', verdict: 'possible', source: '7195435',
      why: 'Google credits leads its systems decide are invalid or low quality. Say exactly what happened in the details box.',
      text: 'Not a valid lead for our business.' },
    wrongservice: { label: 'Wanted a job type the client doesn’t offer', verdict: 'unlikely', source: '15100654',
      why: 'Google says it no longer credits “job type not serviced” leads. Fix the job types in the account settings so it stops happening.',
      text: 'The customer asked for a service we do not offer. Please send fewer leads for this job type.' },
    outsidearea: { label: 'Outside the client’s service area', verdict: 'unlikely', source: '15100654',
      why: 'Google says it no longer credits “geo not serviced” leads. Tighten the service areas in the account settings instead.',
      text: 'The customer is outside our service area. Please send fewer leads from this location.' },
    repeat: { label: 'Same customer again, but after 15 days or from a new number', verdict: 'unlikely', source: '7195435',
      why: 'Google says that after 15 days with no activity, a new call or message from the same customer is a new lead and is charged if it meets the valid-lead rules.',
      text: 'Repeat contact from an existing customer.' },
    nobooking: { label: 'Real customer, but they didn’t book (price shopping, no answer back)', verdict: 'unlikely', source: '7195435',
      why: 'Google charges for valid leads, meaning contacts related to the business. A real customer who asked about the service is a valid lead even if they never booked.',
      text: 'Real customer inquiry that did not turn into a job.' }
  };

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function has(obj, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k); }

  /* Whole days from dateStr to todayStr, both 'YYYY-MM-DD'. Null if either is malformed. */
  function daysBetween(dateStr, todayStr) {
    var re = /^(\d{4})-(\d{2})-(\d{2})$/;
    var a = re.exec(dateStr || ''), b = re.exec(todayStr || '');
    if (!a || !b) return null;
    var t1 = Date.UTC(+a[1], +a[2] - 1, +a[3]), t2 = Date.UTC(+b[1], +b[2] - 1, +b[3]);
    var d1 = new Date(t1), d2 = new Date(t2);
    if (d1.getUTCMonth() !== +a[2] - 1 || d1.getUTCDate() !== +a[3] || d2.getUTCMonth() !== +b[2] - 1 || d2.getUTCDate() !== +b[3]) return null;
    return Math.round((t2 - t1) / 86400000);
  }

  function money(n) {
    var r = Math.round(n * 100) / 100;
    var s = r.toFixed(r % 1 === 0 ? 0 : 2);
    return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function cleanDetails(s) {
    if (typeof s !== 'string') return '';
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > DETAILS_MAX) s = s.slice(0, DETAILS_MAX).replace(/\s+\S*$/, '') + '…';
    return s;
  }

  function when(input) {
    if (typeof input.leadDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.leadDate)) return 'on ' + input.leadDate;
    if (input.daysAgo === 0) return 'today';
    if (input.daysAgo === 1) return 'yesterday';
    return input.daysAgo + ' days ago';
  }

  function draftText(input, r) {
    var type = LEAD_TYPES[input.leadType].toLowerCase();
    var parts = [r.text];
    var d = cleanDetails(input.details);
    if (d) parts.push(d.replace(/[.!?…]?$/, function (m) { return m || '.'; }));
    parts.push('Lead: ' + type + ' ' + when(input) + ', charged ' + money(input.charge) + '.');
    parts.push(r.verdict === 'unlikely' ? 'Sharing this so you can send us better-matched leads.' : 'Please review this lead and credit it if it qualifies.');
    return parts.join(' ');
  }

  function assess(input) {
    if (!input) return null;
    if (!has(LEAD_TYPES, input.leadType) || !has(STATUSES, input.chargeStatus) || !has(REGIONS, input.region) || !has(REASONS, input.reason)) return null;
    if (!isInt(input.daysAgo) || input.daysAgo < 0 || input.daysAgo > 365) return null;
    if (typeof input.charge !== 'number' || !isFinite(input.charge) || input.charge < 0 || input.charge > 100000) return null;

    var r = REASONS[input.reason];
    var out = { verdict: null, label: '', summary: '', notes: [], steps: [], sources: [], draft: '', draftKind: 'credit' };
    function done(verdict, summary, sources) {
      out.verdict = verdict; out.label = VERDICTS[verdict]; out.summary = summary;
      out.sources = sources;
      return out;
    }
    var daysLeft = WINDOW_DAYS - input.daysAgo;

    // 1. Charge status first: an uncharged or credited lead needs nothing.
    if (input.chargeStatus === 'notcharged') {
      out.steps.push('Rate the lead anyway, so Google learns what the client wants.');
      return done('nothing', 'Google didn’t charge for this lead, so there’s nothing to get back.', ['15100654']);
    }
    if (input.chargeStatus === 'credited') {
      out.steps.push('Log the credit for the client report. The original charge still shows on the invoice, with the credit applied to the account balance.');
      return done('nothing', 'This lead is already credited.', ['15100654']);
    }

    // 2. Accounts Google excludes from lead credits.
    if (input.region === 'healthcare' || input.region === 'tax' || input.region === 'emea') {
      out.steps.push('Rate the lead so Google learns what the client wants, and fix the targeting settings that let it through.');
      return done('not_eligible', 'Google says lead credits aren’t available for health care categories, tax specialists, or advertisers in Europe, the Middle East and Africa.', ['15100654']);
    }

    // 3. Already in review.
    if (input.chargeStatus === 'inreview') {
      out.steps.push('Check the charge status again in a few days. Google says a lead in review gets a credit if it isn’t a good match.');
      out.steps.push('Make sure the lead is rated, with the reason below.');
      out.draft = draftText(input, r);
      return done('wait', 'The lead shows “In review”, so Google is already deciding.', ['15100654']);
    }

    // 4. The 30-day window.
    if (input.daysAgo > WINDOW_DAYS) {
      out.notes.push('Google says leads can only be disputed within 30 days, and automatic credits usually land within 30 days. Google doesn’t say whether feedback after that can still earn a credit.');
      out.steps.push('Rate the lead anyway: it still tells Google what to send.');
      out.steps.push('Check charged leads every week so the next one isn’t missed.');
      out.draft = draftText(input, r); out.draftKind = 'feedback';
      return done('too_late', 'This lead is ' + input.daysAgo + ' days old, past Google’s 30-day window.', ['11444751', '15100654']);
    }

    // 5. The reason itself.
    var verdict = r.verdict;
    out.notes.push(r.why);
    if (input.reason === 'missedcall' && input.leadType !== 'call') {
      verdict = 'possible';
      out.notes.push('The missed-call rules only apply to phone calls. For a message or booking request, pick the reason that fits what was sent.');
    }
    if (input.leadType === 'booking' && input.region !== 'usca') {
      out.notes.push('Google says booking leads are only available in the US and Canada, so double-check the lead type.');
    }
    if (verdict !== 'unlikely' && daysLeft <= 7) {
      out.notes.push(daysLeft === 0 ? 'Today is day 30. Rate it today.' : 'Only ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left in the 30-day window. Rate it this week.');
    }

    if (verdict === 'unlikely') {
      out.draftKind = 'feedback';
      out.steps.push('Rate the lead with the feedback below. It won’t earn a credit for this reason, but it tells Google what to send.');
      if (input.reason === 'wrongservice') out.steps.push('Turn off the job type in the account’s service settings.');
      if (input.reason === 'outsidearea') out.steps.push('Tighten the service areas in the account settings.');
      if (input.reason === 'nobooking') out.steps.push('Look at speed to reply and follow-up instead. That’s where this lead was lost.');
    } else {
      out.steps.push('Wait a few days first if the lead is brand new: Google reassesses charged leads and may credit it automatically.');
      out.steps.push('Open the lead on the Leads page, choose “Rate this lead”, and paste the text below into the feedback.');
      if (input.leadType === 'call') out.steps.push('Listen to the call recording first, if the account has them, so the feedback matches what happened.');
      out.steps.push('Check the charge status next week. It changes to “Credited” if Google agrees.');
    }
    out.draft = draftText(input, r);
    var summary = {
      strong: 'This matches a rule Google publishes for leads it doesn’t charge or credits.',
      possible: 'This isn’t a real lead for the client, but Google doesn’t name it as a credit reason. Flag it and see.',
      unlikely: 'Google’s current rules say this kind of lead isn’t credited.'
    }[verdict];
    return done(verdict, summary, verdict === 'unlikely' && r.source === '15100654' ? ['15100654'] : [r.source, '15100654']);
  }

  var api = { REASONS: REASONS, LEAD_TYPES: LEAD_TYPES, STATUSES: STATUSES, REGIONS: REGIONS, VERDICTS: VERDICTS,
              WINDOW_DAYS: WINDOW_DAYS, REPEAT_DAYS: REPEAT_DAYS, assess: assess, daysBetween: daysBetween, cleanDetails: cleanDetails };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LSADispute = api;
})(this);
