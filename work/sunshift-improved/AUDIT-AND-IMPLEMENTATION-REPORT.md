# SunShift India — Audit & Improvements (2026-10-30)

Live site audited: https://sunshift-india-1.vercel.app/
Improved local copy (NOT deployed): `workspace/goals/anvathon-2026-hackathon/sunshift/`
Original snapshot for comparison: `workspace/goals/anvathon-2026-hackathon/sunshift-audit/`

## Architecture (verified from the live site's own files)

Vanilla HTML/CSS/JS, no framework, no build, no backend, no database.
`index.html` + `src/app.js` (562 lines) + `src/sim.js` (147 lines, energy model) +
`src/weather.js` (73 lines, Open-Meteo). 11 hash views: Overview, Live flow, Forecast,
Battery, Appliances, Scenarios, Day-ahead plan, Savings, Run history, Reports, Settings.
No `vercel.json`, no `package.json`, no `/api/*` on the deployment.

## What works (do not rebuild)

- Live weather forecast: Open-Meteo, 7 days, hourly irradiance, Pune default, 7 cities
  in Settings. Verified live: Pune→Mumbai switch re-fetched and updated all pages.
  Formula: irradiance × system kWp × 0.80 performance factor, summed hourly.
- Day-ahead plan: 24-hour dispatch, battery 94% charge / 92% discharge efficiency,
  reserve respected, CSV export, save to history. Date/routine changes recalculate.
- Appliance planner: best-window scoring by solar surplus minus preferred-hour penalty.
  Add/remove reminders work and persist in this browser.
- Scenarios: clear/cloudy, demand, outage — values recalculate genuinely (cloudy +
  high demand + outage: 17.2 → 9.1 kWh solar, self-sufficiency 64%).
- Reports/history CSV exports work. All 11 nav links work.

## What was broken — severity

- **Critical — no backend on Vercel.** `/api/health`, `/api/settings`, `/api/schedule`,
  `/api/runs` all return Vercel 404. Everything falls back to localStorage only, while
  copy says "server-saved". Nothing persists across devices. Header shows "Local only".
- **High — solar utilisation double-counted** (`sim.js`). Surplus was added to both
  `exported` and `curtailedTotal`, so utilisation subtracted it twice: clear sample day
  reported 39% instead of ~70%. Fixed in the improved copy; covered by a test.
- **High — CO₂ factor undocumented and ~3× low.** Old: 0.227 kg/kWh. CEA grid average
  is ~0.71 (latest update ~0.675). Improved copy uses 0.71, labelled as a planning estimate.
- **High — two irreconcilable "days".** Sample dispatch models only 6 AM–8 PM
  (11.3 kWh load, no night load) and claims 100% self-sufficiency on a clear day; the
  day-ahead plan models 24 h. Improved copy labels the sample window everywhere it appears.
- **High — "Live flow" is not live.** Peak-solar-hour snapshot of the sample model;
  chart hover dot was placed by a fake diagonal formula from mouse x, not data. Fixed:
  dot now snaps to the nearest hour's real solar value.
- **High — appliance reminders leaked across days.** A reminder saved for today appeared
  in future days' plans (e.g. 2.86 kW water-heater spike on Sun 1 Nov). Fixed: reminders
  are date-stamped and only apply to their own day.
- **Medium — thin pages.** Battery was 3 numbers; Savings mixed sample and forecast
  figures without saying so; Live flow never showed the live forecast; Scenarios had no
  rain, tariff, battery-unavailable, or before/after comparison.
- **Medium — dead controls.** Notifications bell, "My solar home" switcher, "···" profile
  menu have no handlers. "Export energy report" on Overview navigates to Reports
  instead of downloading. Left as-is except labelling — removing them is a design
  decision for the team, not a silent fix.
- **Medium — slow history load.** Run history waited on the dead `/api` before falling
  back to local data (~20 s observed). Improved copy caps API calls at 5 s.
- **Low — cosmetic/labels.** "−0.0 kW Discharging" when idle (fixed: "0.0 / Idle");
  Forecast KPI said "NEXT DAY" even for a selected later day (fixed: "SELECTED DAY");
  "Projected battery: at end of selected day" initially showed the 1 PM value
  (fixed: sample model now returns `batteryEndPct`).
- **Not verified:** mobile layout at ~375 px (browser tool could not resize; CSS does
  collapse the sidebar to 62 px below 760 px) and DevTools console (not accessible
  through that tool). No stuck states were observed after the ~20–25 s forecast load.

## What was improved (local copy only)

P0 — utilisation fix; CO₂ factor 0.71 with source note; `batteryEndPct` field;
API 5 s timeout; honest "saved in this browser" copy; negative-zero fix; forecast label fix.
P1 — Scenarios: rain sky (0.30 factor), battery-available toggle, tariff input,
before/after comparison table vs a same-tariff baseline (solar, import, cost, battery
end, self-sufficiency, CO₂) plus rule-based recommendations explicitly labelled
"heuristic, not machine learning". Appliances: full-model comparison of best window
vs preferred hour vs 7 PM (grid import + cost), date-stamped reminders.
Battery: hourly charge/discharge/SoC table with reserve in kWh. Savings: sample and
live-forecast figures shown separately, never added together. Live flow: live-forecast
peak shown next to the sample snapshot.
P2 — chart cursor fix (above). P3 — no visual redesign; identity and layout preserved.

## What is still simulated / honest labelling

- All demand is a generic hourly routine (+ temperature cooling allowance in the
  forecast model), not smart-meter history. No hardware, no real-time monitoring.
- Sample dispatch is 6 AM–8 PM only. Forecast model is 24 h but still an estimate.
- No machine learning anywhere: forecasting = Open-Meteo irradiance × fixed factor;
  optimisation = hourly greedy dispatch (solar → home → battery → grid, reserve floor)
  plus surplus-based appliance ranking. Say so in the demo.
- Confidence: the old 78/46 "confidence" numbers were never a model interval and are
  not shown as one. Uncertainty is described in words (increases further into the week).

## Tests performed (improved copy)

`node tests/sim.test.js` — 9/9 passed: utilisation single-count, SoC bounds and
reserve, battery energy balance with efficiencies, rain < cloudy < clear, battery
unavailable (no charge/discharge, imports rise), outage (no import/export, curtailed
counted), CO₂ factor, appliance ranking order, 24 h forecast-day model.
`node --check` passed for `app.js`, `sim.js`, `weather.js`. Local static server
served the improved copy (200 on `/` and `/src/app.js`); a live-browser smoke test
of the new Scenarios/Appliances/Battery pages was run separately — see chat for its result.

## Build / deployment status

- No build step exists (static files). Nothing has been deployed or overwritten.
- The live Vercel site is UNCHANGED. Deployment needs the team's repo/Vercel access,
  which was not available in this workspace. To deploy: copy the `sunshift/` folder
  contents (index.html, src/, tests/) over the existing project and redeploy on Vercel.
- If cross-device persistence is wanted for judging, that needs a real backend or a
  Vercel KV/DB addition — it is NOT provided by this fix, and the UI no longer
  pretends otherwise.

## Remaining limitations

- Mobile layout unverified at 375 px; check on a real phone before demoing.
- Dead buttons (notifications, home switcher, profile menu) still do nothing.
- No time-of-use tariff, no panel shading/temperature derating beyond the 0.80 factor,
  no multi-day battery carry-over (each day starts at 42% / reserve floor).
- Forecast load takes ~20 s on first visit; add a skeleton state rather than "—" if time allows.

## Verification addendum — post-improvement checks, 2026-10-30 (no new features added)

### Correction made during verification (packaging only, not a product change)
The improved copy's `index.html` initially contained 534 bytes of HTTP response
headers at the top of the file. They came from the audit download itself
(`curl -i` output saved as the file) and were copied along with the site.
Browsers rendered that header text at the top of the page. The headers were
stripped from the improved copy, from the separate original backup, and from
the audit snapshot, restoring `index.html` to start with `<!doctype html>`.
After the fix, the page renders cleanly and the served file contains no
"Vercel" text. This was caught by the mobile screenshot check, not by users.

### Real-browser verification (Playwright Chromium, local server)
- All 11 views render with non-empty content: Overview, Live flow, Forecast,
  Battery, Appliances, Scenarios, Day-ahead plan, Savings, Run history,
  Reports, Settings.
- Interactions verified: Scenarios Rain + battery-off + tariff ₹12 recalculates
  (solar 5.2 vs baseline 17.2 kWh, import +6.7 kWh, cost +₹80.6, self-sufficiency
  40.5% vs 100%, CO2 3.3 vs 8.0 kg, with heuristic recommendations);
  Appliances Water heater added and removed; Settings Mumbai saved
  ("Could not reach the server; settings saved in this browser");
  Day-ahead plan date switch (7 date options) and Save; History shows saved runs.
- Console: 0 JavaScript page errors, 0 warnings. 14 console network messages,
  all expected in this setup: dead `/api` 404s, the test server's 501 for
  POST/DELETE (Python's simple server does not implement them; Vercel static
  returns 404 instead — the app handles both via its localStorage fallback),
  and Open-Meteo tunnel failures inside the sandboxed Playwright browser only
  (see below).
- Live forecast in the Playwright sandbox failed with
  `ERR_TUNNEL_CONNECTION_FAILED` (that browser's proxy cannot reach
  Open-Meteo). This is an environment limit, not an app bug: the earlier
  real-browser audit and a direct curl both loaded live Open-Meteo data, and
  the app's designed fallback worked — Forecast showed its error state with
  a "Use sample forecast" button, and the day-ahead plan fell back to the
  sample forecast. Forecast CSV was therefore verified on the sample
  fallback (106 lines, correct header), plus the original live-site check
  (11 KB forecast CSV).

### CSV exports verified
- Day-ahead plan CSV: 26 lines (header + 24 hourly rows + total).
- Hourly scenario report CSV: 18 lines (header + 15 hourly rows + totals).
- Run-history CSV: 3 lines (header + 2 saved runs).
- Forecast CSV (sample fallback): 106 lines with the documented columns.
- Forecast CSV on the live original site: 11 KB, downloaded successfully.

### Calculations verified
- `node tests/sim.test.js`: 9/9 passed (see README).
- One honest caveat found, not fixed (no feature changes were requested at
  this stage): the appliance comparison table's grid-import column can show
  identical values for best/preferred/evening (e.g. 7.0 kWh for all three
  under rain, ₹0 saving). That is because the battery absorbs most timing
  differences over the modelled day; the options differ mainly in export and
  battery end-state, which that table does not show. The underlying model
  numbers are correct — the comparison metric is weak. A future change
  should add export/battery-end columns to that table.

### Mobile verification — 375 px wide
- No horizontal scrolling: document scroll width = 375 px at 375 px viewport.
- Sidebar collapses to 64 px, main content starts at 64 px, no content
  overlap, topbar wraps but stays legible, scenario/appliance forms usable.
- Known pre-existing cosmetic wart, NOT fixed in this package: `polish.css`
  loads after `styles.css` and sets `.nav-item { font-size: 12px }`
  unconditionally, overriding the mobile rule that collapses nav labels to
  icons only. Result: nav labels render clipped inside the 64 px sidebar
  (e.g. "Live flow" wrapped, "Day-ahead plan" wrapped). Icons remain
  tappable and navigation works; it looks untidy rather than broken.
  Suggested later fix (one line, in `polish.css`'s ≤760 px block):
  hide the label text or set `.nav-item { font-size: 0 }` there.

### Run/build confirmation
- No build step exists and none is needed: static files served with
  `python -m http.server` return 200 for `/` and `/src/app.js`, and
  `node --check` passes for `app.js`, `sim.js`, and `weather.js`.
- Deployment was NOT performed. See `DEPLOY-VERCEL.md`.

## Final targeted fixes (2026-10-30)

- Appliance planning now accepts a selected date. Its comparison reruns the same
  scenario with and without the added appliance, and shows the modelled change
  in grid imports, start-hour direct solar use, battery discharge, total export,
  estimated total grid cost, and end-of-day battery charge. Identical grid
  import values remain valid when the appliance consumes energy that otherwise
  would have been exported. The existing simulation calculations were not
  changed.
- Mobile CSS now hides sidebar text labels at widths below 760 px and hides the
  decorative mini bars in compact KPI cards. Comparison tables scroll within
  their own container on narrow screens.
- The notification bell opens local, scenario-based planning alerts. The home
  switcher opens Settings; the profile display is static and has no fake menu.
- The README now describes these controls and the selected-date workflow.
- Verification after these edits: `node tests/sim.test.js` passed 9/9; syntax
  checks passed for `src/app.js`, `src/sim.js`, and `src/weather.js`. I could not
  reconnect the in-app browser to the edited local copy after restarting its
  preview server, so post-edit viewport checks, all-view interaction checks,
  downloads, settings persistence, and browser-console review remain unverified.
  Earlier checks recorded above apply to the prior improved copy only.

## Account backend added (2026-10-30)

- Added email/password sign-up and sign-in using Supabase Auth, with session refresh and sign-out controls in the header.
- Added per-account cloud storage for home settings, dated appliance reminders and saved energy calculations. `supabase/schema.sql` applies owner-only row-level security to all three tables; no service-role key is used in browser code.
- Added a user-entered average daily electricity-use setting. It scales the generic hourly household profile; the default 15.63 kWh/day preserves the existing baseline profile. This remains an estimate, not a meter reading.
- Added `api/config.js` for Vercel to provide the public Supabase project URL and publishable key, plus `BACKEND-SETUP.md` and `.gitignore` guidance.
- Verification: `node tests/sim.test.js` passed 10/10; syntax checks passed for the app, simulation, and Vercel config function; `package.json` parsed successfully.
- Not connected or deployed: Supabase project credentials were not available in this workspace. Account creation, database/RLS behavior, browser flows and cross-device sync still need testing after the owner configures Supabase and Vercel variables. The live Vercel site remains unchanged.

## Appliance list and duplicate protection (2026-10-31)

- Expanded the appliance picker from 4 to 14 options and made it searchable using the browser's accessible native suggestion list. Added microwave oven, electric kettle, induction cooktop, rice cooker, air conditioner, ceiling fan, clothes iron, water pump, laptop/computer, and vacuum cleaner, with clearly identified planning estimates.
- The add action disables while saving, validates against the catalog, blocks same-name/date/time duplicates locally, and shows a live confirmation distinguishing account-database saves from device-only saves.
- Supabase schema now uses a unique per-user appliance/date/time index and a per-account 50-reminder database cap serialized with an advisory transaction lock. The API uses conflict-ignore and returns whether a new row was created.
- Verification: existing simulation suite passes 10/10; syntax checks pass for app, simulator, and Vercel config function. Live Supabase behavior still requires the project owner to apply the updated schema and configure credentials; the in-app preview was unavailable for a post-edit UI smoke test.

## Rooftop estimator and savings calculator added (2026-10-31)

- Added two navigable pages from the supplied JSX and ZIP: a roof-outline/preset estimator and a bill-based solar savings calculator. Both can apply the recommended kWp to the saved home settings and reload the day-ahead plan.
- The roof canvas is labeled illustrative (not satellite imagery) and the analysis is a deterministic estimate, not AI. A panel pattern is shown only as a visual aid, not an engineered layout.
- Replaced the previous estimator interaction with the revised uploaded component's practical photo workflow: JPG/PNG/WebP upload, known-distance scale calibration, and tracing on the photo. Uploaded images must be calibrated for meaningful area estimates; preset drawings remain available on the illustrative grid.
- The savings calculator pre-fills from the home daily-use/tariff settings, and supports editing bill/rate, size recommendation, generation, savings, costs, payback, and a quote-request text copy. Its proposal print view uses the browser's print-to-PDF flow; it does not claim to send WhatsApp messages.
- Corrected the supplied CFA calculator's tiering to the general-state residential structure (₹30,000/kW for first 2 kW, ₹18,000/kW for next 1 kW, capped at ₹78,000) and aligned its CO₂ estimate to the app's 0.71 kg/kWh factor. CFA and financial figures remain labeled indicative. See the official MNRE [operational-guidelines page](https://mnre.gov.in/notice/operational-guidelines-for-implementation-of-the-component-central-financial-assistance-to-residential-consumers-of-pm-surya-ghar-muft-bijli-yojana) and portal for eligibility and state-specific verification.
- Existing 10 simulation tests pass; syntax checks pass for `src/app.js`, `src/solar-tools.js`, `src/sim.js`, and `api/config.js`. The in-app preview was not available for browser interaction checks, so the new pages still need a smoke test after redeployment. No Supabase schema change was made.
