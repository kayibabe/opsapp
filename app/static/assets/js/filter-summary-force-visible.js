(function () {
  const SUMMARY_RE = /(FY\s*\d|FY\s*202|All Zones|All Periods|Updated\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;

  function isLikelySummaryText(text) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    const hits = [
      /FY\s*\d/i.test(t),
      /All Zones/i.test(t) || /Zone/i.test(t),
      /Updated/i.test(t),
      /Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar/i.test(t) || /All Periods/i.test(t),
    ].filter(Boolean).length;
    return hits >= 3 || SUMMARY_RE.test(t);
  }

  function candidateElements() {
    const selectors = [
      "p","div","span","small","strong",".page-meta",".page-subtitle",".page-context",".report-meta",".report-subtitle",".page-header-meta",".toolbar-meta"
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")));
  }

  function findSummaryElement() {
    const nodes = candidateElements();
    let best = null;
    let bestScore = -1;

    for (const el of nodes) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!isLikelySummaryText(text)) continue;
      if (text.length > 180 || text.length < 20) continue;

      let score = 0;
      if (/FY\s*\d/i.test(text)) score += 2;
      if (/All Zones|Zone/i.test(text)) score += 2;
      if (/Updated/i.test(text)) score += 2;
      if (/Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|All Periods/i.test(text)) score += 2;
      if (el.closest(".page-header, .report-header, .content-header, .page-title-wrap, header")) score += 2;

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function applyHighlight(el) {
    if (!el) return;
    el.classList.add("filter-summary-force-pill");
    el.classList.remove("is-pulsing");
    void el.offsetWidth;
    el.classList.add("is-pulsing");
    clearTimeout(el.__pulseTimer);
    el.__pulseTimer = setTimeout(() => el.classList.remove("is-pulsing"), 3500);
  }

  function watchSummary(el) {
    if (!el || el.__summaryObserverAttached) return;
    el.__summaryObserverAttached = true;
    let last = (el.textContent || "").trim();
    const obs = new MutationObserver(() => {
      const now = (el.textContent || "").trim();
      if (now && now !== last) {
        last = now;
        applyHighlight(el);
      }
    });
    obs.observe(el, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    const el = findSummaryElement();
    if (el) {
      applyHighlight(el);
      watchSummary(el);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    setTimeout(init, 700);
    setTimeout(init, 1600);
    setTimeout(init, 2800);
  });
})();
