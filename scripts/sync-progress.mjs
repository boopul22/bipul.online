#!/usr/bin/env node
// Pull public project progress out of the local OpenSEO instance and push it
// to the site's SESSION KV namespace, where /projects reads it.
//
// OpenSEO is the source of truth. Each website or YouTube project opts in with
// a custom context section whose slug is `public-progress`, written as
// `key: value` lines (lines starting with # are ignored):
//
//   status: building          idea | building | live | paused
//   progress: 60              0-100, blank hides the bar
//   now: Adding bulk export   one line
//   next:                     one item per line, starting with "- "
//   - Dark mode
//   changes: show             show | full | hide
//   about: A short paragraph  optional; sites default to their meta description
//   name: / tagline:          optional, for projects not in src/data/projects.ts
//
// YouTube projects also publish channel stats (subscribers, views, videos,
// 28-day views vs the previous 28 days) and their latest public upload. The
// connected account's email and analytics beyond those totals stay private.
//
// Only those fields leave this machine. OpenSEO's other context (goals,
// competitors, research) and change-log notes stay private. `changes: show`
// publishes the date, kind and page count of recent logged changes;
// `changes: full` also publishes each change's summary.
//
// Usage:
//   npm run sync:progress            sync to production KV
//   npm run sync:progress -- --dry   print the payload, push nothing
//   npm run sync:progress -- --local write to the local dev KV instead
//   npm run sync:progress -- --auto  background mode (see scripts/progress-agent.sh):
//                                    quiet no-op while OpenSEO is down; when it's
//                                    up, collects on startup and every 30 min and
//                                    pushes only when the data changed (or every
//                                    6 h, to keep "Updated" fresh)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const OPENSEO_MCP = process.env.OPENSEO_MCP_URL ?? "http://localhost:8741/mcp";
const SESSION_KV_ID = "d357ef8dfd5e4f09b8e1393587fa8ab1"; // same namespace as scripts/deploy.sh
// The wrangler login spans two accounts; the site lives on this one.
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "ab54ca2d01df4886aa0c3f240ace806d";

// --auto state (lives in the gitignored .wrangler/ folder).
const STATE_FILE = join(ROOT, ".wrangler", "progress-sync-state.json");
const COLLECT_EVERY_MS = 30 * 60_000; // each collect costs YouTube API quota
const PUSH_AT_LEAST_EVERY_MS = 6 * 60 * 60_000;
const KV_KEY = "progress:v1";
const SECTION_SLUG = "public-progress";
const STATUSES = ["idea", "building", "live", "paused"];
const MAX_CHANGES = 5;
const MAX_NEXT = 6;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry");
const local = args.has("--local");
const auto = args.has("--auto");

const CHANGE_LABELS = {
  title_meta: "Titles and meta descriptions",
  content: "Content",
  internal_links: "Internal links",
  schema: "Structured data",
  redirect_canonical: "Redirects and canonicals",
  technical_performance: "Performance and technical fixes",
  other: "Site update",
};

let rpcId = 0;
async function callTool(name, args) {
  const res = await fetch(OPENSEO_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`OpenSEO ${name}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`OpenSEO ${name}: ${body.error.message}`);
  if (body.result?.isError) {
    throw new Error(`OpenSEO ${name}: ${body.result.content?.[0]?.text ?? "failed"}`);
  }
  return body.result.structuredContent;
}

function clean(text, max) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Parse the `public-progress` section into the fields we publish. */
function parseSection(content) {
  const out = { next: [] };
  let inNext = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (inNext && line.startsWith("- ")) {
      const item = clean(line.slice(2), 160);
      if (item && out.next.length < MAX_NEXT) out.next.push(item);
      continue;
    }
    inNext = false;

    const m = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    switch (key) {
      case "status":
        if (STATUSES.includes(value.toLowerCase())) out.status = value.toLowerCase();
        break;
      case "progress": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) out.progress = Math.max(0, Math.min(100, n));
        break;
      }
      case "now":
        if (value) out.now = clean(value, 200);
        break;
      case "next":
        inNext = true;
        // Also accept `next: a; b; c` on one line.
        for (const item of value.split(";")) {
          const v = clean(item, 160);
          if (v && out.next.length < MAX_NEXT) out.next.push(v);
        }
        break;
      case "changes":
        if (["show", "full", "hide"].includes(value.toLowerCase())) {
          out.changes = value.toLowerCase();
        }
        break;
      case "name":
        if (value) out.name = clean(value, 60);
        break;
      case "tagline":
        if (value) out.tagline = clean(value, 160);
        break;
      case "about":
        if (value) out.about = clean(value, 600);
        break;
    }
  }
  return out;
}

function normalizeHost(host) {
  return String(host).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

async function collectSite(p, parsed, section) {
  const mode = parsed.changes ?? "show";
  let changes = [];

  if (mode !== "hide") {
    const log = await callTool("list_changes", { projectId: p.id, limit: 20 });
    changes = (log.changes ?? [])
      .filter((c) => c.status !== "reverted" && !c.revertedAt)
      .slice(0, MAX_CHANGES)
      .map((c) => ({
        date: c.shipDate ?? String(c.shippedAt).slice(0, 10),
        label: CHANGE_LABELS[c.type] ?? CHANGE_LABELS.other,
        pages: (c.targets ?? []).filter((t) => t.kind === "page").length,
        ...(mode === "full" ? { summary: clean(c.summary, 300) } : {}),
      }));
  }

  const domain = normalizeHost(p.domain);
  return {
    domain,
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.tagline ? { tagline: parsed.tagline } : {}),
    about: parsed.about ?? (await fetchDescription(`https://${domain}/`)),
    status: parsed.status ?? "live",
    progress: parsed.progress ?? null,
    now: parsed.now ?? null,
    next: parsed.next,
    changes,
    updatedAt: latest(section.updatedAt?.slice(0, 10), changes[0]?.date),
  };
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** A page's own meta description (or og:description), used as the default "about". */
async function fetchDescription(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (bipul.online progress sync)", "accept-language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    for (const name of ["description", "og:description"]) {
      const tag = html.match(
        new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"),
      )?.[0];
      const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
      if (content?.trim()) return clean(decodeEntities(content), 600);
    }
  } catch {
    /* unreachable site: no description */
  }
  return null;
}

/** True when a video is publicly embeddable, i.e. not private or scheduled. */
async function isPublicVideo(videoId) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function collectChannel(p, parsed, section) {
  const info = await callTool("get_youtube_channel", { projectId: p.id });
  if (info?.status !== "ok" || !info.channel?.channelId) return null;

  // Analytics and the upload list are best-effort: the channel still shows
  // with its lifetime totals if either fails.
  const [overview, uploads] = await Promise.all([
    callTool("get_youtube_channel_overview", { projectId: p.id }).catch(() => null),
    callTool("list_youtube_videos", { projectId: p.id, sort: "newest", limit: 25 }).catch(
      () => null,
    ),
  ]);

  let latestVideo = null;
  for (const v of uploads?.videos ?? []) {
    if (await isPublicVideo(v.videoId)) {
      latestVideo = {
        id: v.videoId,
        title: clean(v.title, 140),
        publishedAt: v.publishedAt,
        views: v.views ?? 0,
      };
      break;
    }
  }

  const cur = overview?.status === "ok" ? overview.current : null;
  const prev = overview?.status === "ok" ? overview.previous : null;
  const ch = info.channel;

  return {
    channelId: ch.channelId,
    title: parsed.name ?? ch.channelTitle,
    handle: ch.channelHandle ?? null,
    avatar: ch.thumbnailUrl ?? null,
    ...(parsed.tagline ? { tagline: parsed.tagline } : {}),
    about: parsed.about ?? null,
    status: parsed.status ?? "live",
    progress: parsed.progress ?? null,
    now: parsed.now ?? null,
    next: parsed.next,
    stats: {
      subscribers: info.subscriberCount ?? null,
      views: info.viewCount ?? null,
      videos: info.videoCount ?? null,
      views28d: cur?.views ?? null,
      views28dPrev: prev?.views ?? null,
      watchHours28d: cur ? Math.round((cur.estimatedMinutesWatched ?? 0) / 60) : null,
      subscribers28d: cur ? (cur.subscribersGained ?? 0) - (cur.subscribersLost ?? 0) : null,
    },
    latestVideo,
    updatedAt: latest(section.updatedAt?.slice(0, 10), latestVideo?.publishedAt?.slice(0, 10)),
  };
}

function latest(...dates) {
  return dates.filter(Boolean).sort().at(-1) ?? null;
}

async function collect() {
  const { projects } = await callTool("list_projects", {});
  const sites = [];
  const channels = [];

  for (const p of projects) {
    const isSite = p.projectType === "website" && p.domain;
    const isChannel = p.projectType === "youtube";
    if (!isSite && !isChannel) continue;

    const context = await callTool("get_project_context", { projectId: p.id });
    const section = context.customSections?.find((s) => s.slug === SECTION_SLUG);
    if (!section) continue; // not opted in

    const parsed = parseSection(section.content ?? "");
    if (isSite) {
      sites.push(await collectSite(p, parsed, section));
    } else {
      const channel = await collectChannel(p, parsed, section);
      if (channel) channels.push(channel);
    }
  }

  // Biggest channels first.
  channels.sort((a, b) => (b.stats.subscribers ?? 0) - (a.stats.subscribers ?? 0));
  return { syncedAt: new Date().toISOString(), projects: sites, channels };
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function openSeoIsUp() {
  try {
    const res = await fetch(new URL("/", OPENSEO_MCP), { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Hash of the payload minus its timestamp, to tell whether anything changed. */
function contentHash(payload) {
  const { syncedAt, ...rest } = payload;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function push(json) {
  const dir = mkdtempSync(join(tmpdir(), "progress-"));
  const file = join(dir, "progress.json");
  writeFileSync(file, json);
  const localWrangler = join(ROOT, "node_modules", ".bin", "wrangler");
  const [cmd, pre] = existsSync(localWrangler) ? [localWrangler, []] : ["npx", ["wrangler"]];
  try {
    execFileSync(
      cmd,
      [
        ...pre,
        "kv", "key", "put", KV_KEY,
        // `astro dev` keys its local KV by binding name, not the real id.
        "--namespace-id", local ? "SESSION" : SESSION_KV_ID,
        "--path", file,
        local ? "--local" : "--remote",
      ],
      {
        cwd: ROOT,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID },
        stdio: ["ignore", auto ? "ignore" : "inherit", "inherit"],
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

async function runAuto() {
  const state = readState();
  const now = Date.now();

  if (!(await openSeoIsUp())) {
    if (state.openSeoUp !== false) {
      console.log(`${stamp()} OpenSEO is down; waiting for it to start`);
      writeState({ ...state, openSeoUp: false });
    }
    return;
  }

  const justStarted = state.openSeoUp !== true;
  const due = now - (state.lastCollectAt ?? 0) >= COLLECT_EVERY_MS;
  if (!justStarted && !due) return;

  const payload = await collect();
  const hash = contentHash(payload);
  const changed = hash !== state.lastHash;
  const stale = now - (state.lastPushAt ?? 0) >= PUSH_AT_LEAST_EVERY_MS;
  const summary = `${payload.projects.length} sites, ${payload.channels.length} channels`;

  if (changed || stale) {
    push(JSON.stringify(payload));
    writeState({ openSeoUp: true, lastCollectAt: now, lastPushAt: now, lastHash: hash });
    const why = justStarted ? "OpenSEO started" : changed ? "data changed" : "refresh";
    console.log(`${stamp()} pushed ${summary} (${why})`);
  } else {
    writeState({ ...state, openSeoUp: true, lastCollectAt: now });
    console.log(`${stamp()} no changes (${summary})`);
  }
}

async function main() {
  if (auto) {
    try {
      await runAuto();
    } catch (err) {
      // Leave lastCollectAt alone so the next tick retries.
      console.error(`${stamp()} sync failed: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
    return;
  }

  let payload;
  try {
    payload = await collect();
  } catch (err) {
    console.error(`✖ Could not read OpenSEO at ${OPENSEO_MCP}. Is it running?`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const json = JSON.stringify(payload);
  console.log(`▶ ${payload.projects.length} sites, ${payload.channels.length} channels opted in:`);
  for (const p of payload.projects) {
    const pct = p.progress == null ? "" : ` ${p.progress}%`;
    console.log(`  ${p.domain.padEnd(28)} ${p.status}${pct}${p.now ? ` · ${p.now}` : ""}`);
  }
  for (const c of payload.channels) {
    console.log(`  ${(c.handle ?? c.title).padEnd(28)} ${c.status} · ${c.stats.subscribers ?? "?"} subs`);
  }

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  push(json);
  if (!local) {
    // Keep --auto from re-pushing the same data right after a manual sync.
    writeState({ ...readState(), lastPushAt: Date.now(), lastHash: contentHash(payload) });
  }
  console.log(`✅ Synced to ${local ? "local" : "production"} KV (${KV_KEY}, ${json.length} bytes)`);
}

main();
