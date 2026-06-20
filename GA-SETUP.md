# Live GA4 traffic on the portfolio

The project cards on the homepage show **real traffic** pulled live from your
existing GA4 properties — one property per site, all under the **Site_mine**
account. No consolidation or re-tagging: we just read each property by ID.

## How it works

```
Browser → boopul.online (static, prerendered)
   └─ src/scripts/live-traffic.ts  fetch('/api/traffic')
        └─ src/pages/api/traffic.ts   (SSR, prerender=false, @astrojs/cloudflare)
             └─ src/lib/ga.ts
                  ├─ mints a Google OAuth token (JWT signed in-Worker, no SDK)
                  └─ for EACH property (in parallel):
                       ├─ GA4 Data API  runReport         → 28-day users + daily trend
                       └─ GA4 Realtime  runRealtimeReport → "active now"
```

Cards render with their baked demo numbers, then hydrate with live data on
load. A property that errors just leaves that card on its fallback number — the
page never breaks.

## Domain → property map

Baked into `src/pages/api/traffic.ts` (non-secret). Override with the
`GA_PROPERTY_MAP` env var if it changes.

| Domain | Property | ID |
|---|---|---|
| freetexttospeech.net | freetexttospeech.net | 532702784 |
| extractpics.com | extractpics | 532556993 |
| dailymeditationguide.com | dailymeditationguide.com | 532892573 |
| imagetourl.cloud | Image_to_url | 523343886 |
| freepromptbase.com | prompt-base-social | 525173786 |
| imagepaste.org | imagepaste.org | 533689364 |
| aigradecalculator.com | aigradecalculator.com | 539214928 |
| myhealthbestie.com | myhealthbestie.com | 534588662 |

---

## 1. Enable the API (Google Cloud)

1. [console.cloud.google.com](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → Enable APIs** → enable **Google Analytics Data API**
   (`analyticsdata.googleapis.com`). That single API serves both `runReport`
   and `runRealtimeReport`. (You do NOT need the Admin API or the old UA
   "Reporting API".)

## 2. Service account

1. **IAM & Admin → Service Accounts → Create**. Name it e.g. `portfolio-ga`.
2. On the new account → **Keys → Add key → JSON** → download the key file.
3. Grant it read access to the data. Easiest: in **GA4 → Admin → Account
   Access Management** (account = **Site_mine**) → **+** → add the service
   account's email (`...@<project>.iam.gserviceaccount.com`) as **Viewer**.
   Account-level Viewer **cascades to every property**, so you don't have to
   add it to each site one by one.

## 3. Wire the secret

Only one secret is required (`GA_SA_KEY`); the property map is in the code.

- **Local dev:** `cp .dev.vars.example .dev.vars`, paste the JSON key into
  `GA_SA_KEY`, then `npm run dev`.
- **Production (Cloudflare Pages):** Project → **Settings → Variables and
  Secrets** → add `GA_SA_KEY` (mark **Secret**), or:

  ```sh
  npx wrangler pages secret put GA_SA_KEY
  ```

`.dev.vars` is gitignored — never commit the real key.

## 4. Verify

```sh
npm run build && npm run preview   # then open http://localhost:4321/api/traffic
```

Expect JSON like:

```json
{
  "updatedAt": "2026-06-20T…",
  "sites": {
    "freetexttospeech.net": { "users28d": 1234, "trend": [./*28*/], "activeNow": 2 }
  }
}
```

On the homepage, card badges, sparklines, and the green "N now" pill update
from this. The endpoint is edge-cached 5 minutes; the client re-polls every
minute to keep "active now" fresh.

## Notes & knobs

- **Window:** change `27daysAgo` in `src/lib/ga.ts`.
- **Cache:** `EDGE_TTL` in `src/pages/api/traffic.ts` (seconds).
- **freepromptbase.com → prompt-base-social (525173786):** confirm this is the
  correct property; fix the id in `traffic.ts` if not.
- **Bipul Network (542449255):** an empty property created during an earlier
  consolidation attempt — safe to move to trash (Admin → Property Settings).
- **API quota:** the Data API has a generous free per-property daily token
  budget; the 5-minute edge cache keeps usage tiny.
