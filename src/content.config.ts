import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

/**
 * Guides: one SEO page per Instagram carousel, served at the site root
 * (bipul.online/<file-name>). The newest guide also leads /links, the
 * Instagram link-in-bio page. Assets live in public/guides/<file-name>/.
 */
const link = z.object({ label: z.string(), url: z.string().url() });

const guides = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    keyword: z.string(),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    /** Portrait Instagram cover (3:4). */
    cover: z.string(),
    /** Horizontal 4:3 blog cover (1600x1200): page hero, share image and /links card. */
    coverWide: z.string().optional(),
    coverAlt: z.string(),
    instagramUrl: z.string().url().optional(),
    tldr: z.array(z.string()).min(1),
    primary: link,
    secondary: link.optional(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          replaces: z.string().optional(),
          url: z.string().url(),
          icon: z.string().optional(),
          note: z.string().optional(),
        }),
      )
      .default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    sources: z.array(link).default([]),
  }),
});

export const collections = { blog, guides };
