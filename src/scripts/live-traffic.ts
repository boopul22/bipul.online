// Runs in the browser: fetches live GA4 numbers from the /api/traffic
// endpoint and fills in the visit counts — the total in the hero
// (.js-total) and one number per project row (.js-visits). Rows keep
// their placeholder until (and unless) this succeeds.

interface SiteTraffic {
  users28d: number;
  trend: number[];
  activeNow: number;
}

type Payload = {
  updatedAt: string;
  sites: Record<string, SiteTraffic>;
};

/** 14000 -> "14k", 6800 -> "6.8k", 940 -> "940". */
function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 10 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, "")) + "k";
  }
  return Math.round(n).toString();
}

async function refresh() {
  try {
    const res = await fetch("/api/traffic", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = (await res.json()) as Payload;
    if (!data?.sites) return;

    // One count per project row.
    document.querySelectorAll<HTMLElement>("[data-domain]").forEach((row) => {
      const key = row.dataset.domain;
      const site = key ? data.sites[key] : undefined;
      const el = row.querySelector<HTMLElement>(".js-visits");
      if (el && site) el.textContent = fmtK(site.users28d);
    });

    // Hero "~N visits/mo" = live sum of every site's 28-day users.
    const total = Object.values(data.sites).reduce((a, s) => a + (s.users28d || 0), 0);
    const totalEl = document.querySelector<HTMLElement>(".js-total");
    if (totalEl && total > 0) totalEl.textContent = fmtK(total);

    // Header "N online" = live users across every site (last 30 min).
    const online = Object.values(data.sites).reduce((a, s) => a + (s.activeNow || 0), 0);
    const liveEl = document.querySelector<HTMLElement>(".js-live");
    if (liveEl) liveEl.textContent = String(online);
  } catch {
    /* network/API hiccup — keep the placeholders */
  }
}

refresh();
// Re-poll on the same cadence as the edge cache (5 min) so open tabs stay
// fresh without generating wasted worker/edge requests.
setInterval(refresh, 300_000);
