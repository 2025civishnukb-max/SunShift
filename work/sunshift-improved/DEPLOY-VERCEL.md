# Deploying SunShift India to Vercel

**Status: NOT deployed by this package.** The live site at
https://sunshift-india-1.vercel.app/ is unchanged. Follow the steps below
to deploy this improved version yourself. Do not delete the existing
Vercel project until the new version has passed the checks in step 4.

## What you are deploying

The site is static, with one small Vercel function at `api/config.js` that
passes the public Supabase project URL and publishable key to the app. Supabase
Auth handles accounts; Postgres stores each account's settings, reminders, and
saved calculations behind row-level security. Follow `BACKEND-SETUP.md` before
expecting login or cross-device sync. If that backend is not configured, the
site falls back to browser-local storage.

## Option 1 — Vercel web dashboard (easiest, no terminal)

1. Go to https://vercel.com/new and sign in.
2. Choose **Deploy** from your existing SunShift project if you want to
   replace it, or create a new project for a preview first (recommended).
3. Connect a Git repository containing these files, or deploy the folder
   with the Vercel CLI. Use Git or CLI so the `/api/config` function is
   included with the static site.
4. Set the **Root Directory** to the folder containing `index.html`
   (the top of this package, not `src/`).
5. Leave **Framework Preset** as **Other** and leave **Build Command**
   and **Output Directory** empty. Vercel detects the `api/` function
   automatically; no frontend build is needed.
6. Click **Deploy** and wait for the "Congratulations" page.
7. Before testing account sync, configure the Supabase project and Vercel
   variables in `BACKEND-SETUP.md`, then redeploy.

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
- [ ] All 13 views open: Overview, Live flow, Forecast, Battery,
      Appliances, Roof estimator, Solar savings, Scenarios, Day-ahead plan,
      Savings, Run history, Reports, Settings.
- [ ] Scenarios: set Sky = Rain, Battery available = off, click
      **Recalculate dispatch** — the before/after table and
      recommendations appear.
- [ ] Appliances: add a Water heater time, then remove it.
- [ ] Roof estimator: select a preset, estimate it, then apply the kWp to
      home settings and confirm the day-ahead estimate refreshes.
- [ ] Solar savings: adjust bill and rate; verify the size/cost update;
      copy the installer request and test Print / Save as PDF.
- [ ] Settings: change city to Mumbai, save, confirm the forecast
      location changes (it saves in that browser only).
- [ ] Forecast → **Download forecast CSV** produces a file with
      Date/Time/Weather/Temperature/Solar power columns.
- [ ] Open the site on a phone (or a 375 px-wide browser window) and
      confirm navigation and cards are usable.
- [ ] Confirm the header shows "Local only" — that is correct, not an
      error, if Supabase is not configured. When configured, create an account,
      save home settings and a reminder, then sign in on a second browser and
      confirm the same account data appears.
- [ ] Create a second test account and confirm it cannot see the first
      account's home settings, reminders, or saved calculations.

## Rollback

Keep the original project files safe. A separate backup of the
pre-improvement site is kept outside this package by the team
(`sunshift-backup-original-2026-10-30/`). To roll back a Vercel
deployment, open the project in Vercel → **Deployments** → find the
previous production deployment → **⋯ → Promote to Production**.
No data is lost by rolling back, because all user data lives in each
visitor's browser or their account's Supabase tables, depending on whether
they are signed in and cloud configuration is available.

## What NOT to do

- Do not add an API key anywhere in this frontend code. Open-Meteo
  needs no key, and there is no other external API.
- Do not set a build command like `npm run build` — there is no
  build script that produces the site, and it will fail the deployment.
- Do not add a Supabase service-role key to this frontend. Only the
  publishable/anon key belongs in `SUPABASE_ANON_KEY`; row-level security
  protects account rows. Keep all database RLS policies enabled.
