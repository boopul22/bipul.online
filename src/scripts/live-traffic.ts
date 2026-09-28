// Runs in the browser: fetches live GA4 numbers from the /api/traffic
// endpoint and fills in the visit counts — the "Visitors / month" tiles
// (.js-total) and one number per project card (.js-visits). Cards keep
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

/** Area + line chart of daily visitors into an svg with a 0 0 100 32 viewBox. */
function drawTrend(svg: SVGSVGElement, trend: number[]) {
  if (trend.length < 2) return;
  const max = Math.max(...trend, 1);
  const pts = trend.map((v, i) => [
    (i / (trend.length - 1)) * 100,
    30 - (v / max) * 28,
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  svg.querySelector(".js-trend-line")?.setAttribute("d", line);
  svg.querySelector(".js-trend-area")?.setAttribute("d", `${line}L100,32L0,32Z`);
  svg.setAttribute("aria-label", `Daily visitors over the last ${trend.length} days, peak ${max}`);
  svg.closest("[data-trend-wrap]")?.removeAttribute("data-loading");
}

async function refresh() {
  try {
    const res = await fetch("/api/traffic", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = (await res.json()) as Payload;
    if (!data?.sites) return;

    // One count per project row; detail pages also get "online now" and a
    // 28-day trend chart.
    document.querySelectorAll<HTMLElement>("[data-domain]").forEach((row) => {
      const key = row.dataset.domain;
      const site = key ? data.sites[key] : undefined;
      if (!site) return;
      row.querySelectorAll<HTMLElement>(".js-visits").forEach((el) => {
        el.textContent = fmtK(site.users28d);
      });
      row.querySelectorAll<HTMLElement>(".js-active").forEach((el) => {
        el.textContent = String(site.activeNow);
      });
      row.querySelectorAll<SVGSVGElement>("svg.js-trend").forEach((svg) => {
        drawTrend(svg, site.trend);
      });
    });

    // "Visitors / month" tiles = live sum of every site's 28-day users.
    const total = Object.values(data.sites).reduce((a, s) => a + (s.users28d || 0), 0);
    if (total > 0) {
      document.querySelectorAll<HTMLElement>(".js-total").forEach((el) => {
        el.textContent = fmtK(total);
      });
    }

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
