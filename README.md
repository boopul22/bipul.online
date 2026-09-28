# Boopul.online

Astro portfolio deployed to the existing `bipulonline` Cloudflare Worker.

## Contact and email signup

Contact messages and email signups are validated by server endpoints, stored in
the Worker's `SESSION` KV namespace, and emailed to the verified
`blog.boopul@gmail.com` destination through the Worker's restricted `EMAIL`
binding. Keys use the prefixes `contact:` and `subscriber:` respectively.

Cloudflare Email Sending is enabled for `bipul.online`; notifications use
`website@bipul.online`. The deploy script binds both the existing KV namespace
and Cloudflare Email. Messages remain in KV if email delivery is unavailable.
To list saved entries:

```sh
npx wrangler kv key list --namespace-id d357ef8dfd5e4f09b8e1393587fa8ab1 --prefix contact:
npx wrangler kv key list --namespace-id d357ef8dfd5e4f09b8e1393587fa8ab1 --prefix subscriber:
```

## Project progress (/projects)

The homepage and `/projects` show tabbed cards for every website and YouTube
channel, each linking to a detail page (`/projects/<name>`,
`/projects/youtube/<handle>`) with status, progress, what's next, stats and
recent activity. The data lives in the local OpenSEO instance
(`localhost:8741`): each project has a **Public progress** custom context
section (slug `public-progress`); websites add their change log, channels
their YouTube stats. OpenSEO itself is never exposed.
`npm run sync:progress` reads it and writes only the public fields to the
`progress:v1` key in `SESSION` KV, which the pages read on request
(edge-cached for 5 minutes).

```sh
npm run sync:progress            # push to production KV
npm run sync:progress -- --dry   # preview the payload
npm run sync:progress -- --local # push to the local `astro dev` KV
```

Syncing is automatic: a launchd agent (`com.bipul.progress-sync`) checks every
5 minutes, syncs as soon as OpenSEO is up, re-collects every 30 minutes while
it stays up, and only writes to KV when something changed (or every 6 hours).

```sh
npm run sync:agent -- status     # loaded? OpenSEO up? last sync
npm run sync:agent -- logs       # follow ~/Library/Logs/com.bipul.progress-sync.log
npm run sync:agent -- run        # sync right now
npm run sync:agent -- install    # (re)install; uninstall removes it
```

The format is documented at the top of `scripts/sync-progress.mjs`. Deleting
a project's section hides it; `changes: full` also publishes change-log
summaries (off by default, since they're written as SEO notes).

## Development

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
