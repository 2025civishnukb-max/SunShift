# Set up account login and cloud storage

SunShift uses Supabase Auth for email/password accounts and Supabase Postgres with row-level security for each account's home settings, average daily-use input, dated appliance reminders, and saved energy estimates. It does not collect meter readings automatically; the stored figures are user-configured inputs and model calculations.

## 1. Create the database

1. Create a Supabase project at https://supabase.com/.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Authentication → Providers → Email**, enable email/password. For an easy hackathon demo, email confirmation may be disabled; otherwise new users must confirm from their email before signing in.
4. In **Authentication → URL Configuration**, set the Site URL to the deployed Vercel URL and add any preview URLs to the redirect allow list.

The schema enables RLS and scopes every row to `auth.uid()`. Appliance reminders also have a unique per-user name/date/time key and a database-enforced limit of 50, so rapid or direct API submissions cannot create duplicate rows or grow an account without bound. Do not disable those policies or safeguards.

## 2. Configure Vercel

In the Vercel project, open **Settings → Environment Variables** and add these values for Preview and Production:

- `SUPABASE_URL` — the Supabase project's Project URL.
- `SUPABASE_ANON_KEY` — the project's publishable/anon key.

Redeploy after saving the environment variables. The app exposes only this publishable key through `/api/config`; the database enforces access by the signed-in user's JWT and RLS. **Never put a Supabase service-role/secret key in this project or in a browser variable.**

## 3. Test accounts and data

Open the deployed site and select **Sign in**. Create an account with a valid email and a password of at least 8 characters. Then set the home's location, panel size, battery size, tariff and reserve in Settings; add a reminder and save a day-ahead or scenario calculation. Sign out, then sign in on another browser/device: those settings, reminders and saved calculations should load from that account. CSV exports remain generated on demand.

The first sign-in on a browser can move that browser's existing local settings, reminders and history into the account if they are not already there. Signing out clears that browser's cached household data and session; the cloud copy remains in the account. Different account IDs are prevented from importing one another's local cache.

## Local development

Static preview using `py -m http.server` continues to work in local-only mode. To test the Vercel function locally, install/use the Vercel CLI, put the two variables in `.env.local` (do not commit it), and run `npx vercel dev`. The `/api/config` function will report that account sync is unavailable when those credentials are absent.

## Data boundaries

Account storage holds a home profile and SunShift's own estimates. It does not connect to a smart meter, inverter, utility account, or billing provider. Users should not enter account passwords from their utility provider here; utility integrations require a separately approved provider API and additional security design.
