# Deploying SunShift India to Vercel

**Status: NOT deployed by this package.** The live site at
https://sunshift-india-1.vercel.app/ is unchanged. Follow the steps below
to deploy this improved version yourself. Do not delete the existing
Vercel project until the new version has passed the checks in step 4.

## What you are deploying

A static site only: `index.html` + `src/` + docs. There is no serverless
function, no database, and no environment variable in this package.
Vercel serves it as static files. That is why settings/history stay in
the visitor's browser (localStorage) — if you want cross-device
persistence later, that is a separate backend project, not a config change.

## Option 1 — Vercel web dashboard (easiest, no terminal)

1. Go to https://vercel.com/new and sign in.
2. Choose **Deploy** from your existing SunShift project if you want to
   replace it, or create a new project for a preview first (recommended).
3. If asked for a repository: either connect a GitHub repo containing
   these files, or use Vercel's **drag-and-drop / CLI upload** flow.
4. Set the **Root Directory** to the folder containing `index.html`
   (the top of this package, not `src/`).
5. Leave **Framework Preset** as **Other** and leave **Build Command**
   and **Output Directory** empty — there is nothing to build.
6. Click **Deploy** and wait for the "Congratulations" page.

## Option 2 — Vercel CLI (from this folder)

1. Install Node.js, then in a terminal in this folder:
   ```
   npm install -g vercel
   vercel login
   ```
2. Preview first (does not touch production):
   ```
   vercel
   ```
3. When the preview passes step 4 below, promote it:
   ```
   vercel --prod
   ```

## Option 3 — GitHub (recommended for a team)

1. Create a new GitHub repository and push this folder's contents so
   `index.html` is at the repository root.
2. In Vercel, **Add New → Project → Import** that repository.
3. Keep Framework Preset **Other**, no build command, and deploy.
4. Every push to the main branch redeploys automatically.

## 4. Post-deploy checks (do these before announcing it)

- [ ] Homepage loads and the forecast resolves within ~30 seconds
      (initial sample numbers are replaced by forecast numbers).
- [ ] All 11 views open: Overview, Live flow, Forecast, Battery,
      Appliances, Scenarios, Day-ahead plan, Savings, Run history,
      Reports, Settings.
- [ ] Scenarios: set Sky = Rain, Battery available = off, click
      **Recalculate dispatch** — the before/after table and
      recommendations appear.
- [ ] Appliances: add a Water heater time, then remove it.
- [ ] Settings: change city to Mumbai, save, confirm the forecast
      location changes (it saves in that browser only).
- [ ] Forecast → **Download forecast CSV** produces a file with
      Date/Time/Weather/Temperature/Solar power columns.
- [ ] Open the site on a phone (or a 375 px-wide browser window) and
      confirm navigation and cards are usable.
- [ ] Confirm the header shows "Local only" — that is correct, not an
      error, until a backend is added.

## Rollback

Keep the original project files safe. A separate backup of the
pre-improvement site is kept outside this package by the team
(`sunshift-backup-original-2026-10-30/`). To roll back a Vercel
deployment, open the project in Vercel → **Deployments** → find the
previous production deployment → **⋯ → Promote to Production**.
No data is lost by rolling back, because all user data lives in each
visitor's browser, not on the server.

## What NOT to do

- Do not add an API key anywhere in this frontend code. Open-Meteo
  needs no key, and there is no other external API.
- Do not set a build command like `npm run build` — there is no
  build script that produces the site, and it will fail the deployment.
- Do not expect `/api/*` routes to work. This package intentionally
  contains none; the app's 5-second API timeout falls back to
  localStorage by design.
