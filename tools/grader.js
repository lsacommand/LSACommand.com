/*
 * LSA Command free tools: LSA account health grader, the scoring and nothing else.
 * Pure functions, no DOM, so the same file runs in the browser (window.LSAGrader) and in Node tests.
 *
 * The weights and thresholds below are LSA Command's own heuristic for "how much this usually matters",
 * not a Google formula. Google doesn't publish an account score. Where a question rests on a Google rule,
 * the help-page answer id is in `source` and the page cites it.
 *
 * Input: { answerRate: 0-100, ratedShare: 0-100, weeklyLeads: >= 0, <choice questions>: option key }.
 * Output: null if anything is missing or out of range, otherwise { score, grade, categories, items, fixes }.
 */
(function (root) {
  'use strict';

  var CATEGORIES = [
    { key: 'response', name: 'Responsiveness' },
    { key: 'leads', name: 'Lead management' },
    { key: 'profile', name: 'Reviews and profile' },
    { key: 'setup', name: 'Setup and coverage' },
    { key: 'budget', name: 'Budget and bids' }
  ];

  function clamp01(n) { return Math.min(Math.max(n, 0), 1); }

  /* Each question: max points, how answers turn into points, and the plain-English fix shown when it loses points. */
  var QUESTIONS = [
    // ---- Responsiveness (30)
    { key: 'answerRate', cat: 'response', max: 14, type: 'number', min: 0, max_value: 100,
      // Heuristic: 60% or less answered earns 0, 95% or more earns full marks, linear in between.
      points: function (v) { return 14 * clamp01((v - 60) / (95 - 60)); },
      source: '7527305',
      fix: 'Answer more of the LSA calls live.',
      why: 'Google says missed calls can hurt responsiveness, which feeds ad ranking, and a missed call that lasts over 20 seconds in business hours can still be charged.' },
    { key: 'missedCalls', cat: 'response', max: 6, type: 'choice',
      options: { answered: 6, voicemail: 2, rings: 0 },
      source: '7195435',
      fix: 'Send unanswered calls to something that picks up before 20 seconds.',
      why: 'Google treats voicemail and automated greetings as connected, so those calls can be charged after 20 seconds with no conversation.' },
    { key: 'messageReply', cat: 'response', max: 6, type: 'choice',
      options: { under5: 6, under30: 4, under2h: 2, slower: 0 },
      source: '6224859',
      fix: 'Reply to message leads faster.',
      why: 'Google says a consistently fast response time could improve ad ranking. It averages message response time over the last 90 days, weighted to recent leads.' },
    { key: 'contactOptions', cat: 'response', max: 4, type: 'choice',
      options: { both: 4, one: 2, none: 0 },
      source: '7527305',
      fix: 'Turn on message leads (and booking, if offered).',
      why: 'Google lists extra contact options as part of how likely an ad is to produce a lead, especially nights and weekends when nobody can answer the phone.' },

    // ---- Lead management (20)
    { key: 'ratedShare', cat: 'leads', max: 8, type: 'number', min: 0, max_value: 100,
      points: function (v) { return 8 * clamp01(v / 100); },
      source: '15100654',
      fix: 'Rate every lead.',
      why: 'Google says lead feedback helps it send leads that suit the business, and leaving feedback can earn a bonus credit on a charged lead.' },
    { key: 'disputes', cat: 'leads', max: 7, type: 'choice',
      options: { weekly: 7, sometimes: 3, never: 0 },
      source: '11444751',
      fix: 'Review charged leads every week and dispute bad ones.',
      why: 'Google only accepts disputes within 30 days of the lead, so a monthly habit misses some of them. Disputes are a separate route from Google’s automatic credits.' },
    { key: 'outcomes', cat: 'leads', max: 5, type: 'choice',
      options: { all: 5, some: 2, none: 0 },
      source: null,
      fix: 'Track which leads became booked jobs.',
      why: 'Without it you can’t show the client cost per booked job, which is the number that keeps them paying for LSA. This one is our view, not a Google rule.' },

    // ---- Reviews and profile (25)
    { key: 'ratingVsComp', cat: 'profile', max: 6, type: 'choice',
      options: { higher: 6, same: 3, lower: 0 },
      source: '7496631',
      fix: 'Close the star-rating gap with nearby competitors.',
      why: 'Google says star rating and number of reviews affect how a business ranks in Local Services Ads.' },
    { key: 'reviewsVsComp', cat: 'profile', max: 6, type: 'choice',
      options: { more: 6, same: 3, fewer: 0 },
      source: '7496631',
      fix: 'Build review count past the competitors you show next to.',
      why: 'Google says star rating and number of reviews affect ranking, and providers with more reviews typically book more jobs.' },
    { key: 'reviewAsks', cat: 'profile', max: 5, type: 'choice',
      options: { every: 5, sometimes: 2, never: 0 },
      source: '7496631',
      fix: 'Ask for a review after every completed job.',
      why: 'Google says customers are more likely to leave a review when the request comes from the business directly, using its own review link.' },
    { key: 'profile', cat: 'profile', max: 8, type: 'choice',
      options: { complete: 8, partial: 4, bare: 0 },
      source: '7527305',
      fix: 'Finish the profile: business bio and good photos.',
      why: 'Google counts high-quality images in profile quality, and uses the services offered and business bio to judge relevance to a search.' },

    // ---- Setup and coverage (15)
    { key: 'verification', cat: 'setup', max: 6, type: 'choice',
      options: { current: 6, pending: 2, lapsed: 0 },
      source: '7527305',
      fix: 'Get every verification check current.',
      why: 'Google lists completed verification checks as part of profile quality, next to rating, reviews and response time.' },
    { key: 'hours', cat: 'setup', max: 5, type: 'choice',
      options: { match: 5, close: 2, nomatch: 0 },
      source: '7195435',
      fix: 'Make Business Profile hours match the hours someone answers.',
      why: 'Unanswered calls are charged inside the Business Profile hours (and ad schedule). Hours wider than the staffed hours turn into paid missed calls.' },
    { key: 'coverage', cat: 'setup', max: 4, type: 'choice',
      options: { exact: 4, mostly: 2, off: 0 },
      source: '15100654',
      fix: 'Switch off job types and areas the client doesn’t want.',
      why: 'Google no longer credits leads for job types or areas that aren’t serviced, so the settings have to be right up front.' },

    // ---- Budget and bids (10)
    { key: 'weeklyLeads', cat: 'budget', max: 6, type: 'number', min: 0, max_value: 1000,
      points: function (v) { return 6 * clamp01(v / 10); },
      source: '10125017',
      fix: 'Raise the budget toward 10 leads a week, or narrow the target.',
      why: 'Google recommends budgeting for at least 10 leads a week, so Maximize leads has enough data to work with.' },
    { key: 'bidMode', cat: 'budget', max: 4, type: 'choice',
      options: { maximize: 4, manualReviewed: 3, manualStale: 0 },
      source: '7527305',
      fix: 'Move to Maximize leads, or review manual bids monthly.',
      why: 'The bid is one of Google’s ranking factors and Google recommends Maximize leads. Manual bids nobody has looked at in months drift out of line.' }
  ];

  var TOTAL = QUESTIONS.reduce(function (s, q) { return s + q.max; }, 0); // 100

  function letter(score) {
    return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  }

  function grade(answers) {
    if (!answers) return null;
    var items = [];
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i], v = answers[q.key], pts;
      if (q.type === 'number') {
        if (typeof v !== 'number' || !isFinite(v) || v < q.min || v > q.max_value) return null;
        pts = q.points(v);
      } else {
        if (!Object.prototype.hasOwnProperty.call(q.options, v)) return null;
        pts = q.options[v];
      }
      items.push({ key: q.key, cat: q.cat, points: pts, max: q.max, lost: q.max - pts, order: i,
                   fix: q.fix, why: q.why, source: q.source });
    }
    var raw = items.reduce(function (s, it) { return s + it.points; }, 0);
    var score = Math.round(raw);
    var categories = CATEGORIES.map(function (c) {
      var mine = items.filter(function (it) { return it.cat === c.key; });
      var pts = mine.reduce(function (s, it) { return s + it.points; }, 0);
      var max = mine.reduce(function (s, it) { return s + it.max; }, 0);
      return { key: c.key, name: c.name, points: pts, max: max, pct: pts / max * 100 };
    });
    // Top fixes: the questions losing the most points; ties go to the earlier question (the order above is our priority order).
    var fixes = items.filter(function (it) { return it.lost > 0.05; })
      .sort(function (a, b) { return (b.lost - a.lost) || (a.order - b.order); })
      .slice(0, 3);
    return { raw: raw, score: score, grade: letter(score), total: TOTAL, categories: categories, items: items, fixes: fixes };
  }

  var api = { QUESTIONS: QUESTIONS, CATEGORIES: CATEGORIES, TOTAL: TOTAL, grade: grade, letter: letter };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LSAGrader = api;
})(this);
