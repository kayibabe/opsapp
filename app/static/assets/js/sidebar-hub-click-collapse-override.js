/*
Operations Hub + Commercial Hub click-collapse override

Behavior:
- Clicking a collapsed hub expands it.
- Clicking an expanded hub collapses it.
- When expanding:
  - Operations Hub routes to Water Production
  - Commercial Hub routes to Customer Accounts
- Only one hub can stay expanded at a time.
*/

(function () {
  const DEFAULT_CHILD_PAGE = {
    operations: "production",
    commercial: "customer-accounts"
  };

  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function findGroup(groupId) {
    return document.querySelector(`.nav-group[data-group-id="${groupId}"]`);
  }

  function findChildren(groupId) {
    return document.querySelector(`.nav-children[data-children-for="${groupId}"]`);
  }

  function findTrigger(groupId) {
    return document.querySelector(`.hub-trigger[data-group-id="${groupId}"]`);
  }

  function collapseGroup(groupId) {
    const group = findGroup(groupId);
    const children = findChildren(groupId);
    const trigger = findTrigger(groupId);

    if (group) {
      group.classList.remove("is-expanded", "is-selected-group");
    }
    if (children) {
      children.hidden = true;
    }
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    }
  }

  function collapseAllGroups(exceptGroupId = null) {
    $all(".nav-group[data-group-id]").forEach((group) => {
      const gid = group.dataset.groupId;
      if (!gid || gid === exceptGroupId) return;
      collapseGroup(gid);
    });
  }

  function expandGroup(groupId) {
    const group = findGroup(groupId);
    const children = findChildren(groupId);
    const trigger = findTrigger(groupId);

    collapseAllGroups(groupId);

    if (group) {
      group.classList.add("is-expanded", "is-selected-group");
    }
    if (children) {
      children.hidden = false;
    }
    if (trigger) {
      trigger.setAttribute("aria-expanded", "true");
    }
  }

  function groupIsExpanded(groupId) {
    const group = findGroup(groupId);
    return !!group && group.classList.contains("is-expanded");
  }

  function resolveNavigateFn() {
    if (typeof window.navigateTo === "function") return window.navigateTo;
    if (typeof window.showPage === "function") {
      return function(pageId) { window.showPage(pageId); };
    }
    if (typeof window.setActivePage === "function") {
      return function(pageId) { window.setActivePage(pageId); };
    }
    return function(pageId) {
      try { localStorage.setItem("lastPageId", pageId); } catch (e) {}
      if (window.location.hash !== `#${pageId}`) {
        window.location.hash = `#${pageId}`;
      }
    };
  }

  function resolveActiveFn() {
    if (typeof window.setActivePage === "function") return window.setActivePage;
    return function(pageId) {
      $all(".nav-item, .nav-child").forEach((el) => el.classList.remove("is-active"));
      const child = document.querySelector(`.nav-child[data-page-id="${pageId}"]`);
      if (child) child.classList.add("is-active");
    };
  }

  function toggleHub(groupId) {
    if (groupIsExpanded(groupId)) {
      collapseGroup(groupId);
      return;
    }

    expandGroup(groupId);

    const pageId = DEFAULT_CHILD_PAGE[groupId];
    if (!pageId) return;

    const setActivePage = resolveActiveFn();
    const navigateTo = resolveNavigateFn();

    setActivePage(pageId);
    navigateTo(pageId);

    try { localStorage.setItem("lastPageId", pageId); } catch (e) {}
  }

  function bindHubToggle(groupId) {
    const trigger = findTrigger(groupId);
    if (!trigger) return;

    // Remove previous inline/attached handler competition by intercepting early.
    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleHub(groupId);
    }, true);
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindHubToggle("operations");
    bindHubToggle("commercial");
  });
})();
