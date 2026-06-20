// Runs in the browser: fetches live GA4 numbers from the SSR /api/traffic
// endpoint and hydrates each project card. Cards keep their baked demo values
// until (and unless) this succeeds, so the page is never blank or broken.

import { buildSparkline, fmtK } from "../lib/sparkline";

// Mirrors the SiteTraffic shape returned by /api/traffic (defined server-side
// in lib/ga.ts) — kept local so no server-only code is bundled into the client.
interface SiteTraffic {
  users28d: number;
  trend: number[];
  activeNow: number;
}

type Payload = {
  updatedAt: string;
  sites: Record<string, SiteTraffic>;
};

const AXIS_LABELS = ["4w", "3w", "2w", "1w", "now"];

function hydrateCard(card: HTMLElement, site: SiteTraffic) {
  // Badge — monthly visitors (last 28 days)
  const badge = card.querySelector<HTMLElement>(".js-badge");
  if (badge && site.users28d > 0) badge.textContent = fmtK(site.users28d);

  // Sparkline — redraw from the daily trend
  if (site.trend && site.trend.length >= 2 && site.trend.some((v) => v > 0)) {
    const { linePath, areaPath, max, min } = buildSparkline(site.trend);
    card.querySelector(".js-line")?.setAttribute("d", linePath);
    card.querySelector(".js-area")?.setAttribute("d", areaPath);
    const maxEl = card.querySelector<HTMLElement>(".js-max");
    const minEl = card.querySelector<HTMLElement>(".js-min");
    if (maxEl) maxEl.textContent = fmtK(max);
    if (minEl) minEl.textContent = fmtK(min);

    // Swap month labels for relative-week markers matching the 28-day window
    const axis = card.querySelector<HTMLElement>(".js-axis");
    if (axis) axis.innerHTML = AXIS_LABELS.map((l) => `<span>${l}</span>`).join("");
  }

  // "Active now" pill
  const pill = card.querySelector<HTMLElement>(".js-active");
  const count = card.querySelector<HTMLElement>(".js-active-count");
  if (pill && count) {
    if (site.activeNow > 0) {
      count.textContent = String(site.activeNow);
      pill.classList.remove("hidden");
      pill.classList.add("inline-flex");
    } else {
      pill.classList.add("hidden");
      pill.classList.remove("inline-flex");
    }
  }
}

async function refresh() {
  try {
    const res = await fetch("/api/traffic", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = (await res.json()) as Payload;
    if (!data?.sites) return;

    document.querySelectorAll<HTMLElement>("[data-domain]").forEach((card) => {
      const key = card.dataset.domain;
      const site = key ? data.sites[key] : undefined;
      if (site) hydrateCard(card, site);
    });

    // Sidebar "~N visits/mo" = live sum of every site's 28-day users.
    const total = Object.values(data.sites).reduce((a, s) => a + (s.users28d || 0), 0);
    const totalEl = document.querySelector<HTMLElement>(".js-total");
    if (totalEl && total > 0) totalEl.textContent = fmtK(total);
  } catch {
    /* network/API hiccup — keep the baked fallback values */
  }
}

refresh();
// Re-poll on the same cadence as the edge cache (5 min) so open tabs stay
// fresh without generating wasted worker/edge requests.
setInterval(refresh, 300_000);
