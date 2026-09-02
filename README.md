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
