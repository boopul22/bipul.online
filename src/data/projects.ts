// Projects — surfaced via `wrangler pages project list` (Cloudflare CLI)
// plus confirmed live tools.
//
// `chart` is DEMO monthly-visitor data so the cards match the Indie Page look.
// Edit these to your real numbers any time — `chart` is 13 monthly points
// (Jul → May); `visits` overrides the badge value (defaults to the last point).

export interface Project {
  name: string;
  url: string;
  /** Hostname used to load the real favicon. */
  domain: string;
  tagline: string;
  /** Explicit favicon URL; falls back to a favicon service when omitted. */
  icon?: string;
  /** Demo monthly visitors per month, Jul → May (13 points). */
  chart: number[];
  /** Optional override for the badge number; otherwise uses last chart point. */
  visits?: number;
  /** Small status pill text shown when there's no metric yet. */
  status?: string;
  source: "cloudflare" | "live";
}

export const projects: Project[] = [
  {
    name: "Free Text to Speech",
    url: "https://freetexttospeech.net/",
    domain: "freetexttospeech.net",
    tagline: "Turn text into natural-sounding speech. Free, no signup.",
    chart: [4200, 5100, 4800, 6300, 7000, 6800, 8200, 9100, 8800, 10400, 11800, 12600, 14000],
    source: "live",
  },
  {
    name: "ExtractPics",
    url: "https://www.extractpics.com/",
    domain: "extractpics.com",
    tagline: "Pull every image off any web page, then download them.",
    chart: [3000, 3600, 3400, 4500, 5200, 5000, 6100, 7000, 7600, 8400, 9200, 10100, 11000],
    source: "live",
  },
  {
    name: "Daily Meditation Guide",
    url: "https://dailymeditationguide.com/",
    domain: "dailymeditationguide.com",
    tagline: "Short guided meditations for a calmer daily routine.",
    chart: [2400, 2900, 2700, 3800, 4600, 5400, 5200, 6300, 7100, 6900, 7800, 8600, 9200],
    source: "cloudflare",
  },
  {
    name: "ImageToURL",
    url: "https://imagetourl.cloud/",
    domain: "imagetourl.cloud",
    tagline: "Upload an image, get a link. No account needed.",
    chart: [1800, 2200, 2900, 2700, 3400, 4100, 4800, 4600, 5300, 6100, 6500, 6300, 6800],
    source: "live",
  },
  {
    name: "FreePromptBase",
    url: "https://freepromptbase.pages.dev/",
    domain: "freepromptbase.pages.dev",
    icon: "https://freepromptbase.pages.dev/favicon.png",
    tagline: "A free library of AI prompts to get you started.",
    chart: [600, 900, 1200, 1100, 1600, 2000, 2400, 2300, 2800, 3000, 3500, 3200, 3400],
    source: "cloudflare",
  },
];
