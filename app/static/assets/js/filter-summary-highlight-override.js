/*
Filter summary highlight patch
Adds a professional pulse highlight whenever the summary text changes.
*/

(function () {
  const SUMMARY_SELECTORS = [
    "#pageMetaLine",
    "#filterSummaryLine",
    "#headerFilterSummary",
    ".page-meta-line",
    ".page-context-meta",
    ".report-context-line",
    ".toolbar-context-line",
    ".filter-summary-line",
    "[data-filter-summary]"
  ];

  function getSummaryElement() {
    for (const selector of SUMMARY_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function pulseSummary(el) {
    if (!el) return;
    el.classList.remove("filter-summary-emphasis");
    void el.offsetWidth;
    el.classList.add("filter-summary-emphasis");
    window.clearTimeout(el.__summaryPulseTimer);
    el.__summaryPulseTimer = window.setTimeout(() => {
      el.classList.remove("filter-summary-emphasis");
    }, 1800);
  }

  function watchSummary() {
    const el = getSummaryElement();
    if (!el) return;

    let lastText = (el.textContent || "").trim();

    const observer = new MutationObserver(() => {
      const currentText = (el.textContent || "").trim();
      if (currentText && currentText !== lastText) {
        lastText = currentText;
        pulseSummary(el);
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also pulse after direct filter interactions if present
    const filterSelectors = [
      "select",
      "[data-filter]",
      "[data-filter-control]",
      "#fySelect",
      "#zoneSelect",
      "#periodSelect"
    ];

    document.querySelectorAll(filterSelectors.join(",")).forEach((control) => {
      control.addEventListener("change", () => {
        const target = getSummaryElement();
        window.setTimeout(() => pulseSummary(target), 60);
      });
    });

    // Initial emphasis once on load so users notice the line
    window.setTimeout(() => pulseSummary(el), 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchSummary);
  } else {
    watchSummary();
  }
})();
