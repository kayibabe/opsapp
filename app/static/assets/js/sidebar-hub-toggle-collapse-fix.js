/*
Hub toggle collapse fix
Purpose:
- Make Operations Hub and Commercial Hub truly toggle:
  click once = expand + open default child
  click again = collapse
- Uses capture-phase interception so existing sidebar handlers do not immediately reopen the group.
*/

(function () {
  const HUBS = {
    operations: { defaultPageId: "production" },
    commercial: { defaultPageId: "customer-accounts" }
  };

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function getGroup(groupId) {
    return qs(`.nav-group[data-group-id="${groupId}"]`)
      || qs(`[data-sidebar-group="${groupId}"]`);
  }

  function getTrigger(groupId) {
    return qs(`.hub-trigger[data-group-id="${groupId}"]`)
      || qs(`.nav-item[data-group-id="${groupId}"]`)
      || qs(`[data-hub-trigger="${groupId}"]`);
  }

  function getChildren(groupId) {
    return qs(`.nav-children[data-children-for="${groupId}"]`)
      || qs(`[data-children-for="${groupId}"]`)
      || qs(`[data-sidebar-children="${groupId}"]`);
  }

  function isExpanded(groupId) {
    const group = getGroup(groupId);
    const children = getChildren(groupId);
    if (group && group.classList.contains("is-expanded")) return true;
    if (children && !children.hidden && getComputedStyle(children).display !== "none") return true;
    return false;
  }

  function collapseGroup(groupId) {
    const group = getGroup(groupId);
    const trigger = getTrigger(groupId);
    const children = getChildren(groupId);

    if (group) {
      group.classList.remove("is-expanded", "is-selected-group", "is-open", "expanded", "open");
    }
    if (trigger) {
      trigger.classList.remove("is-expanded", "is-selected-group", "is-open", "expanded", "open");
      trigger.setAttribute("aria-expanded", "false");
    }
    if (children) {
      children.hidden = true;
      children.style.display = "none";
    }
  }

  function expandGroup(groupId) {
    collapseAll(groupId);

    const group = getGroup(groupId);
    const trigger = getTrigger(groupId);
    const children = getChildren(groupId);

    if (group) {
      group.classList.add("is-expanded", "is-selected-group");
    }
    if (trigger) {
      trigger.classList.add("is-expanded");
      trigger.setAttribute("aria-expanded", "true");
    }
    if (children) {
      children.hidden = false;
      children.style.display = "";
    }
  }

  function collapseAll(exceptId) {
    Object.keys(HUBS).forEach((id) => {
      if (id !== exceptId) collapseGroup(id);
    });
  }

  function clearActiveStates() {
    qsa(".nav-item, .nav-child, .submenu-item, .sidebar-subitem").forEach((el) => {
      el.classList.remove("is-active", "active", "current");
    });
  }

  function setChildActive(pageId) {
    clearActiveStates();
    const child = qs(`.nav-child[data-page-id="${pageId}"]`)
      || qs(`.submenu-item[data-page-id="${pageId}"]`)
      || qs(`.sidebar-subitem[data-page-id="${pageId}"]`)
      || qs(`[data-page-id="${pageId}"]`);
    if (child) child.classList.add("is-active");
  }

  function navigateTo(pageId) {
    if (!pageId) return;

    if (typeof window.navigateTo === "function") {
      window.navigateTo(pageId);
      return;
    }
    if (typeof window.showPage === "function") {
      window.showPage(pageId);
      return;
    }
    if (typeof window.setActivePage === "function") {
      window.setActivePage(pageId);
    }
    try {
      localStorage.setItem("lastPageId", pageId);
    } catch (e) {}
    if (window.location.hash !== `#${pageId}`) {
      window.location.hash = `#${pageId}`;
    }
  }

  function toggleHub(groupId) {
    if (!HUBS[groupId]) return;

    if (isExpanded(groupId)) {
      collapseGroup(groupId);
      return;
    }

    expandGroup(groupId);
    const pageId = HUBS[groupId].defaultPageId;
    setChildActive(pageId);
    navigateTo(pageId);
  }

  function interceptHub(groupId) {
    const trigger = getTrigger(groupId);
    if (!trigger || trigger.__hubToggleBound) return;
    trigger.__hubToggleBound = true;

    const handler = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      toggleHub(groupId);
      return false;
    };

    trigger.addEventListener("click", handler, true);

    const chevron = trigger.querySelector(".nav-chevron, .sidebar-chevron, .chevron");
    if (chevron) {
      chevron.addEventListener("click", handler, true);
    }
  }

  function init() {
    interceptHub("operations");
    interceptHub("commercial");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-bind in case the sidebar is re-rendered dynamically
  setTimeout(init, 600);
  setTimeout(init, 1600);
})();
