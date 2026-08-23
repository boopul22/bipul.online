// Projects — surfaced via `wrangler pages project list` (Cloudflare CLI)
// plus confirmed live tools.
//
// Visitor numbers and the sparkline are ALWAYS live GA4 data, fetched
// client-side by scripts/live-traffic.ts. Cards render a spinner until that
// arrives — there is no baked demo data.

export interface Project {
  name: string;
  url: string;
  /** Hostname used to load the real favicon. */
  domain: string;
  tagline: string;
  /** Explicit favicon URL; falls back to a favicon service when omitted. */
  icon?: string;
  /** Small status pill text shown when there's no metric yet. */
  status?: string;
  source: "cloudflare" | "live";
}

export const projects: Project[] = [
  {
    name: "Free Text to Speech",
    url: "https://freetexttospeech.net/",
    domain: "freetexttospeech.net",
    tagline: "Turn text into natural-sounding speech for free, without signing up.",
    source: "live",
  },
  {
    name: "ExtractPics",
    url: "https://www.extractpics.com/",
    domain: "extractpics.com",
    tagline: "Pull every image off any web page, then download them.",
    source: "live",
  },
  {
    name: "Daily Meditation Guide",
    url: "https://dailymeditationguide.com/",
    domain: "dailymeditationguide.com",
    tagline: "Short guided meditations for a calmer daily routine.",
    source: "cloudflare",
  },
  {
    name: "ImageToURL",
    url: "https://imagetourl.cloud/",
    domain: "imagetourl.cloud",
    tagline: "Upload an image and get a link without creating an account.",
    source: "live",
  },
  {
    name: "FreePromptBase",
    url: "https://freepromptbase.com/",
    domain: "freepromptbase.com",
    tagline: "A free collection of AI prompts you can copy and use.",
    source: "cloudflare",
  },
  {
    name: "ImagePaste",
    url: "https://imagepaste.org/",
    domain: "imagepaste.org",
    tagline: "Paste or drop an image and get a shareable link right away.",
    source: "cloudflare",
  },
  {
    name: "AI Grade Calculator",
    url: "https://aigradecalculator.com/",
    domain: "aigradecalculator.com",
    tagline: "Calculate test scores, percentages, and GPA in seconds.",
    source: "cloudflare",
  },
  {
    name: "My Health Bestie",
    url: "https://myhealthbestie.com/",
    domain: "myhealthbestie.com",
    tagline: "Health, nutrition, and wellness tips based on evidence.",
    source: "cloudflare",
  },
];
