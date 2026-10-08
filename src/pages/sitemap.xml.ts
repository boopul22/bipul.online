// Built at deploy time so new guides and posts are listed automatically
// (replaces the old hand-written public/sitemap.xml).
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL("https://bipul.online");
  const url = (path: string) => new URL(path, base).href;
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const guides = await getCollection("guides", ({ data }) => !data.draft);
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  const entries = [
    { loc: url("/"), priority: "1.0" },
    { loc: url("/links"), priority: "0.9" },
    { loc: url("/projects"), priority: "0.8" },
    { loc: url("/posts"), priority: "0.7" },
    ...guides.map((g) => ({ loc: url(`/${g.id}`), lastmod: day(g.data.updated ?? g.data.pubDate), priority: "0.8" })),
    ...posts.map((p) => ({ loc: url(`/posts/${p.id}`), lastmod: day(p.data.pubDate), priority: "0.6" })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map((e) => `  <url><loc>${e.loc}</loc>${"lastmod" in e && e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}<priority>${e.priority}</priority></url>`)
  .join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
