import type { APIRoute } from "astro";
// Astro v6 + @astrojs/cloudflare: env (vars + secrets) comes from this virtual
// module, populated from .dev.vars locally and Pages secrets in production.
import { env } from "cloudflare:workers";
import { fetchTraffic } from "../../lib/ga";
import { DEFAULT_PROPERTY_MAP } from "../../lib/ga-properties";

// Server-rendered on demand (not prerendered at build time).
export const prerender = false;

// Cache the live response at the edge so we don't hammer the GA4 API on every
// page view — GA4 daily metrics don't change second-to-second anyway.
const EDGE_TTL = 300; // seconds

export const GET: APIRoute = async ({ request }) => {
  // Cache-Control alone does not cache a Worker's own response, so without the
  // Cache API every hit would mint a token and fan out to GA. The key drops the
  // query string so `?x=1` can't skip the cache.
  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
  const cacheKey = new Request(new URL("/api/traffic", request.url));
  const hit = await cache?.match(cacheKey);
  if (hit) return new Response(hit.body, hit);

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
    const response = json(payload, 200, EDGE_TTL);
    await cache?.put(cacheKey, response.clone()).catch(() => {});
    return response;
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
