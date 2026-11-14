/*
 * LSA Command free tools: the math, and nothing else.
 * Pure functions, no DOM, so the same file runs in the browser (window.LSACalc) and in Node tests.
 * Percent inputs are whole numbers (75 means 75%). Every function returns plain numbers; the pages format them.
 */
(function (root) {
  'use strict';

  var LSA_COMMAND_PER_CLIENT = 200;   // LSA Command's published agency price, $/client/month
  var DAYS_PER_MONTH = 30.4;          // Google's monthly-cap factor (weekly × 30.4 ÷ 7, or daily × 30.4)
  var MAXIMIZE_LEADS_MIN_PER_WEEK = 10; // Google: budget for at least 10 leads/week on Maximize leads
  var TARGET_CPA_MIN_PER_MONTH = 15;  // Google Ads: Target CPA only above 15 leads/month

  function pct(n) { return Math.min(Math.max(n, 0), 100) / 100; }

  /* 1. Missed-call cost under the 20-second billing rule. */
  function missedCall(i) {
    var answered = pct(i.answerRate);
    var missed = i.calls * (1 - answered);
    var charged = missed * pct(i.chargedShare);
    var wastedSpend = charged * i.cpl;
    var lostJobs = missed * (1 - pct(i.recoveredShare)) * pct(i.closeRate);
    var revenueAtRisk = lostJobs * i.jobValue;
    var r = {
      missed: missed,
      charged: charged,
      wastedSpend: wastedSpend,
      wastedSpendYear: wastedSpend * 12,
      lostJobs: lostJobs,
      revenueAtRisk: revenueAtRisk,
      revenueAtRiskYear: revenueAtRisk * 12
    };
    // What answering 10 more of every 100 calls would be worth (capped at 100%).
    if (i.answerRate < 100 && !i._noUplift) {
      var better = missedCall(Object.assign({}, i, { answerRate: Math.min(i.answerRate + 10, 100), _noUplift: true }));
      r.upliftRate = Math.min(i.answerRate + 10, 100);
      r.upliftSpend = wastedSpend - better.wastedSpend;
      r.upliftRevenue = revenueAtRisk - better.revenueAtRisk;
    } else {
      r.upliftRate = null; r.upliftSpend = 0; r.upliftRevenue = 0;
    }
    return r;
  }

  /* 2. Agency LSA margin: manual lead review/disputes/reporting vs. with automation at $200/client. */
  function agencyMargin(i) {
    var toolPerClient = i.toolPerClient == null ? LSA_COMMAND_PER_CLIENT : i.toolPerClient;
    var revenue = i.clients * i.fee;
    var hrsManualPer = i.leadsPerClient * i.minPerLeadManual / 60 + i.disputeHrsManual + i.reportHrsManual;
    var hrsAutoPer = i.leadsPerClient * i.minPerLeadAuto / 60 + i.disputeHrsAuto + i.reportHrsAuto;
    var hrsManual = i.clients * hrsManualPer;
    var hrsAuto = i.clients * hrsAutoPer;
    var laborManual = hrsManual * i.hourlyCost;
    var laborAuto = hrsAuto * i.hourlyCost;
    var tool = i.clients * toolPerClient;
    var marginManual = revenue - laborManual;
    var marginAuto = revenue - laborAuto - tool;
    return {
      revenue: revenue,
      hrsManualPer: hrsManualPer,
      hrsAutoPer: hrsAutoPer,
      hrsManual: hrsManual,
      hrsAuto: hrsAuto,
      hoursSaved: hrsManual - hrsAuto,
      hoursSavedPer: hrsManualPer - hrsAutoPer,
      laborManual: laborManual,
      laborAuto: laborAuto,
      tool: tool,
      marginManual: marginManual,
      marginAuto: marginAuto,
      marginManualPct: revenue > 0 ? marginManual / revenue * 100 : null,
      marginAutoPct: revenue > 0 ? marginAuto / revenue * 100 : null,
      netChange: marginAuto - marginManual,
      breakEvenHrsPer: i.hourlyCost > 0 ? toolPerClient / i.hourlyCost : null,
      fteFreed: (hrsManual - hrsAuto) / 160,
      // Fee floor from our pricing guide: (hours × loaded cost + tools) ÷ (1 − target margin).
      floorManual: i.targetMargin < 100 ? hrsManualPer * i.hourlyCost / (1 - pct(i.targetMargin)) : null,
      floorAuto: i.targetMargin < 100 ? (hrsAutoPer * i.hourlyCost + toolPerClient) / (1 - pct(i.targetMargin)) : null
    };
  }

  /* 3. LSA budget estimate from the user's own numbers (Google publishes no lead prices). */
  function budgetFromJobs(i) {
    var book = pct(i.bookingRate);
    if (book <= 0) return null;
    var leadsPerWeek = i.jobsPerWeek / book;
    var weekly = leadsPerWeek * i.cpl;
    var r = budgetShape(weekly, leadsPerWeek, i.cpl, book);
    var lowerRate = Math.max(i.bookingRate - 10, 1);
    var lower = i.jobsPerWeek / pct(lowerRate);
    r.lowerRate = lowerRate;
    r.lowerLeadsPerWeek = lower;
    r.lowerWeekly = lower * i.cpl;
    return r;
  }

  function budgetFromSpend(i) {
    var book = pct(i.bookingRate);
    if (i.cpl <= 0) return null;
    var weekly = i.monthlyBudget * 7 / DAYS_PER_MONTH;
    var leadsPerWeek = weekly / i.cpl;
    return budgetShape(weekly, leadsPerWeek, i.cpl, book);
  }

  function budgetShape(weekly, leadsPerWeek, cpl, book) {
    var leadsPerMonth = leadsPerWeek * DAYS_PER_MONTH / 7;
    return {
      leadsPerWeek: leadsPerWeek,
      leadsPerMonth: leadsPerMonth,
      jobsPerWeek: leadsPerWeek * book,
      jobsPerMonth: leadsPerMonth * book,
      weekly: weekly,
      daily: weekly / 7,
      monthlyMax: weekly * DAYS_PER_MONTH / 7,
      costPerJob: book > 0 ? cpl / book : null,
      belowMaximizeMin: leadsPerWeek < MAXIMIZE_LEADS_MIN_PER_WEEK,
      targetCpaEligible: leadsPerMonth > TARGET_CPA_MIN_PER_MONTH
    };
  }

  var api = {
    LSA_COMMAND_PER_CLIENT: LSA_COMMAND_PER_CLIENT,
    DAYS_PER_MONTH: DAYS_PER_MONTH,
    missedCall: missedCall,
    agencyMargin: agencyMargin,
    budgetFromJobs: budgetFromJobs,
    budgetFromSpend: budgetFromSpend
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LSACalc = api;
})(this);
