// Progressive enhancement for [data-tabs]: tabs are plain `?tab=` links that
// work without JS; with JS they switch panels in place, keep the URL in sync,
// and follow the WAI-ARIA tabs keyboard pattern (arrows, Home, End).

function init(list: HTMLElement) {
  const tabs = [...list.querySelectorAll<HTMLAnchorElement>("[role=tab]")];

  const select = (tab: HTMLAnchorElement, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.remove(...(on ? t.dataset.off : t.dataset.on)!.split(" "));
      t.classList.add(...(on ? t.dataset.on : t.dataset.off)!.split(" "));
      const panel = document.getElementById(t.getAttribute("aria-controls")!);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    const url = new URL(location.href);
    url.searchParams.set("tab", tab.dataset.tab!);
    history.replaceState(null, "", url);
  };

  for (const tab of tabs) {
    tab.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      select(tab);
    });
  }

  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    const to =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    select(tabs[to], true);
  });
}

document.querySelectorAll<HTMLElement>("[data-tabs]").forEach(init);
