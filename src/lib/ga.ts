// GA4 server-side client — runs on the Cloudflare Workers runtime (V8 with
// Web Crypto, atob/btoa, fetch). No googleapis SDK needed: we mint the OAuth
// token ourselves by signing a JWT with the service-account private key.
//
// This portfolio reads MANY GA4 properties (one per site, under the Site_mine
// account) and keys the result by domain. Secrets it expects:
//   GA_PROPERTY_MAP  JSON object mapping domain -> numeric property id, e.g.
//                    {"freetexttospeech.net":"532702784","imagepaste.org":"533689364"}
//   GA_SA_KEY        the full service-account JSON (the downloaded key file)
//
// The service account needs Viewer on each property — easiest done once at the
// account level (Site_mine -> Account Access Management), which cascades.

import { normalizeHost } from "./sparkline";

export interface SiteTraffic {
  users28d: number;
  trend: number[]; // ~28 daily activeUsers points, oldest -> newest
  activeNow: number; // users in the last 30 min
}

export interface TrafficPayload {
  updatedAt: string;
  sites: Record<string, SiteTraffic>; // keyed by normalised domain
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

// ---- base64url helpers ----
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64url(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signingInput = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function callApi(
  method: "runReport" | "runRealtimeReport",
  token: string,
  propertyId: string,
  body: unknown,
): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${method}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`${method} p${propertyId} ${res.status}: ${await res.text()}`);
  return res.json();
}

/** The last 28 calendar days as GA-style "YYYYMMDD" strings, oldest -> newest. */
function last28Dates(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${d.getUTCFullYear()}${m}${day}`);
  }
  return out;
}

/** Per-property: daily activeUsers trend + 28d total + realtime active users. */
async function fetchOne(token: string, propertyId: string): Promise<SiteTraffic> {
  const [daily, realtime] = await Promise.all([
    callApi("runReport", token, propertyId, {
      dateRanges: [{ startDate: "27daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      // Return a row for EVERY day in the window (0 for no-traffic days), so
      // low-traffic sites still get a full ~28-point trend instead of 1-2
      // points that fall back to the demo chart.
      keepEmptyRows: true,
      limit: 100,
    }),
    callApi("runRealtimeReport", token, propertyId, {
      metrics: [{ name: "activeUsers" }],
    }).catch(() => null), // realtime is best-effort
  ]);

  // Map GA's per-date values, then project onto a fixed 28-day calendar so
  // EVERY site yields exactly 28 points (0 for days GA omits) — otherwise
  // sparse sites get 1-2 points and the card falls back to the demo chart.
  const byDate = new Map<string, number>();
  for (const r of daily.rows ?? []) {
    byDate.set(r.dimensionValues[0].value, Number(r.metricValues[0].value) || 0);
  }
  const trend = last28Dates().map((d) => byDate.get(d) ?? 0);

  // Total stays accurate even if a row's date falls outside the calendar window.
  const users28d = (daily.rows ?? []).reduce(
    (a: number, r: any) => a + (Number(r.metricValues[0].value) || 0),
    0,
  );
  const activeNow = realtime?.rows?.length
    ? Number(realtime.rows[0].metricValues[0].value) || 0
    : 0;

  return { trend, users28d, activeNow };
}

/**
 * Fetch traffic for every property in the map. One OAuth token, then all
 * properties queried in parallel. A single property failing doesn't sink the
 * rest — that site just falls back to its baked card numbers.
 */
export async function fetchTraffic(
  propertyMap: Record<string, string>,
  saKeyJson: string,
): Promise<TrafficPayload> {
  const sa = JSON.parse(saKeyJson) as ServiceAccount;
  const token = await getAccessToken(sa);

  const entries = Object.entries(propertyMap);
  const results = await Promise.all(
    entries.map(async ([domain, pid]) => {
      try {
        return [normalizeHost(domain), await fetchOne(token, String(pid))] as const;
      } catch {
        return [normalizeHost(domain), null] as const;
      }
    }),
  );

  const sites: Record<string, SiteTraffic> = {};
  for (const [domain, traffic] of results) {
    if (traffic) sites[domain] = traffic;
  }

  return { updatedAt: new Date().toISOString(), sites };
}
