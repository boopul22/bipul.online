// Public project progress, pushed into SESSION KV by scripts/sync-progress.mjs
// from the local OpenSEO instance. The site only ever reads it.
import { env } from "cloudflare:workers";
import { projects, type Project } from "../data/projects";
import { slugify } from "./slug";

export const PROGRESS_KV_KEY = "progress:v1";

export type ProgressStatus = "idea" | "building" | "live" | "paused";

export interface ProgressChange {
  date: string; // YYYY-MM-DD
  label: string;
  pages: number;
  summary?: string;
}

interface ProgressFields {
  tagline?: string;
  about?: string | null;
  status: ProgressStatus;
  progress: number | null;
  now: string | null;
  next: string[];
  updatedAt: string | null;
}

export interface ProjectProgress extends ProgressFields {
  domain: string;
  name?: string;
  changes: ProgressChange[];
}

export interface ChannelStats {
  subscribers: number | null;
  views: number | null;
  videos: number | null;
  views28d: number | null;
  views28dPrev: number | null;
  watchHours28d: number | null;
  subscribers28d: number | null;
}

export interface Channel extends ProgressFields {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  stats: ChannelStats;
  latestVideo: { id: string; title: string; publishedAt: string; views: number } | null;
}

export interface ProgressPayload {
  syncedAt: string;
  projects: ProjectProgress[];
  channels?: Channel[];
}

export interface ProjectWithProgress extends Project {
  slug: string;
  progress?: ProjectProgress;
}

export const STATUS: Record<ProgressStatus, { label: string; dot: string; bar: string }> = {
  building: { label: "Building", dot: "bg-primary", bar: "bg-primary" },
  idea: { label: "Idea", dot: "bg-warning", bar: "bg-warning" },
  live: { label: "Live", dot: "bg-success", bar: "bg-success" },
  paused: { label: "Paused", dot: "bg-muted", bar: "bg-muted" },
};

const STATUS_ORDER: Record<ProgressStatus, number> = {
  building: 0,
  idea: 1,
  live: 2,
  paused: 3,
};

export async function loadProgress(): Promise<ProgressPayload | null> {
  const kv = (env as unknown as { SESSION?: { get(key: string): Promise<string | null> } })
    .SESSION;
  if (!kv) return null;
  try {
    const raw = await kv.get(PROGRESS_KV_KEY);
    return raw ? (JSON.parse(raw) as ProgressPayload) : null;
  } catch (error) {
    console.error("Could not read project progress", error);
    return null;
  }
}

/** URL segment for a channel's detail page: its handle without "@". */
export function channelSlug(channel: Channel): string {
  return channel.handle ? channel.handle.replace(/^@/, "").toLowerCase() : channel.channelId;
}

export function channelUrl(channel: Channel): string {
  return channel.handle
    ? `https://www.youtube.com/${channel.handle}`
    : `https://www.youtube.com/channel/${channel.channelId}`;
}

export function faviconUrl(project: Project): string {
  return project.icon ?? `https://www.google.com/s2/favicons?domain=${project.domain}&sz=64`;
}

/**
 * Every project in src/data/projects.ts, plus any project that exists only in
 * OpenSEO (e.g. something still at the idea stage). Active work sorts first;
 * within a status, the order from projects.ts is kept.
 */
export function mergeProgress(payload: ProgressPayload | null): ProjectWithProgress[] {
  const byDomain = new Map(payload?.projects.map((p) => [p.domain, p]) ?? []);

  const merged: ProjectWithProgress[] = projects.map((project) => ({
    ...project,
    slug: slugify(project.name),
    progress: byDomain.get(project.domain),
  }));

  const known = new Set(projects.map((p) => p.domain));
  for (const p of payload?.projects ?? []) {
    if (known.has(p.domain)) continue;
    const name = p.name ?? p.domain;
    merged.push({
      name,
      slug: slugify(name),
      url: `https://${p.domain}/`,
      domain: p.domain,
      tagline: p.tagline ?? "",
      source: "live",
      progress: p,
    });
  }

  const rank = (p: ProjectWithProgress) => STATUS_ORDER[p.progress?.status ?? "live"];
  return merged
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

/** Channels with active work first, then by subscribers (the sync's order). */
export function sortChannels(payload: ProgressPayload | null): Channel[] {
  return (payload?.channels ?? [])
    .map((c, i) => ({ c, i }))
    .sort((a, b) => STATUS_ORDER[a.c.status] - STATUS_ORDER[b.c.status] || a.i - b.i)
    .map(({ c }) => c);
}

/** 14000 -> "14k", 6800 -> "6.8k", 1042889 -> "1M". */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .toLowerCase();
}

/** Percent change vs the previous period, or null when there's no baseline. */
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
