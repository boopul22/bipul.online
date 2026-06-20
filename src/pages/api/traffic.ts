import type { APIRoute } from "astro";
// Astro v6 + @astrojs/cloudflare: env (vars + secrets) comes from this virtual
// module, populated from .dev.vars locally and Pages secrets in production.
import { env } from "cloudflare:workers";
import { fetchTraffic } from "../../lib/ga";

// Server-rendered on demand (not prerendered at build time).
export const prerender = false;

// Cache the live response at the edge so we don't hammer the GA4 API on every
// page view — GA4 daily metrics don't change second-to-second anyway.
const EDGE_TTL = 300; // seconds

// Domain -> GA4 property id (Site_mine account). Non-secret, so it lives here
// as the default; override via the GA_PROPERTY_MAP env var if it ever changes.
const DEFAULT_PROPERTY_MAP: Record<string, string> = {
  "freetexttospeech.net": "532702784",
  "extractpics.com": "532556993",
  "dailymeditationguide.com": "532892573",
  "imagetourl.cloud": "523343886",
  "freepromptbase.com": "525173786",
  "imagepaste.org": "533689364",
  "aigradecalculator.com": "539214928",
  "myhealthbestie.com": "534588662",
};

export const GET: APIRoute = async () => {
  const e = env as Record<string, string | undefined>;
  const saKey = e.GA_SA_KEY;
  let propertyMap = DEFAULT_PROPERTY_MAP;
  if (e.GA_PROPERTY_MAP) {
    try {
      propertyMap = JSON.parse(e.GA_PROPERTY_MAP);
    } catch {
      return json({ error: "GA_PROPERTY_MAP is not valid JSON." }, 503, 0);
    }
  }

  if (!saKey) {
    return json({ error: "GA_SA_KEY is not configured." }, 503, 0);
  }

  try {
    const payload = await fetchTraffic(propertyMap, saKey);
    return json(payload, 200, EDGE_TTL);
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 502, 0);
  }
};

function json(body: unknown, status: number, ttl: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        ttl > 0
          ? `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=600`
          : "no-store",
    },
  });
}
