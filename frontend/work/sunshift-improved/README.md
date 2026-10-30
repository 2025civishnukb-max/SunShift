# SunShift India — improved version

Home-energy planning and optimisation demo for ANVATHON 2026 (problem statement
D2-PS3, SunShift India). Weather-based solar forecast, hour-by-hour battery
dispatch, appliance scheduling, what-if scenarios, and CSV reports.

**This is a planning estimate, not a real product.** There is no hardware
integration, no smart-meter history, and no machine-learning model. Demand is a
generic hourly routine; solar comes from the Open-Meteo forecast. See
`AUDIT-AND-IMPLEMENTATION-REPORT.md` for what is live, what is simulated, and
what was fixed.

## What is in this folder

```
index.html          Single-page app (11 hash views)
src/app.js          UI, navigation, scenario/appliance/plan pages
src/sim.js          Energy model: hourly dispatch, battery, appliance ranking
src/weather.js      Open-Meteo forecast fetch + solar conversion
src/styles.css      Layout and theme
src/features.css    Feature pages
src/polish.css      Final polish
tests/sim.test.js   Energy-model tests (no framework needed)
```

There is **no build step, no bundler, and no dependency to install**.
No backend is included on purpose: the original deployment had no `/api`
server, so settings, schedules, and run history are saved in the browser's
localStorage on the device you use. The app no longer pretends otherwise.

## Run it on Windows

You need only a browser and one of the options below. No admin rights,
no Node.js, and no API key are required.

### Option A — Python (recommended if Python is installed)

1. Open **Command Prompt** or **PowerShell**.
2. Go to this folder, e.g.:
   ```
   cd C:\Users\YourName\Downloads\sunshift-india
   ```
3. Start a local server:
   ```
   python -m http.server 8000
   ```
   (If `python` is not found, try `py -m http.server 8000`.)
4. Open http://localhost:8000/ in your browser.
5. Stop the server with `Ctrl+C` when you are done.

> Do not just double-click `index.html`. Opening it as a `file://` page can
> block the weather fetch and module scripts in some browsers. Always use a
> local server as above.

### Option B — Node.js (if Node is installed)

```
cd sunshift-india
npx --yes serve .
```

Then open the address it prints (usually http://localhost:3000/).

### Option C — VS Code Live Server

1. Open this folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click `index.html` → **Open with Live Server**.

## Run the tests (optional, needs Node.js)

```
node tests/sim.test.js
```

Expected: `9 tests passed.` The tests check energy balance, battery
state-of-charge bounds and reserve, rain < cloudy < clear generation,
battery-unavailable and outage behaviour, the CO2 factor, appliance ranking,
and the 24-hour forecast-day model. There is no test runner to install.

## Use it

1. **Overview** — wait ~20 seconds for the Open-Meteo forecast to load.
   The first numbers shown are the sample model; they are replaced by the
   forecast plan once it arrives.
2. **Settings** — pick a city (Pune, Mumbai, Delhi, Bengaluru, Hyderabad,
   Chennai, Kolkata) and adjust solar size, battery, tariff, reserve, tilt,
   and direction. Save — it is stored in this browser.
3. **Forecast** — 7-day outlook, hourly table, CSV download.
4. **Day-ahead plan** — pick a date and routine, download or save the plan.
5. **Scenarios** — change sky (clear/cloudy/rain), demand, tariff, grid
   outage, and battery availability, then **Recalculate dispatch**. The
   before/after table compares against a clear, typical, grid-on, battery-on
   baseline at the same tariff.
6. **Appliances** — pick an appliance and preferred hour to see its best
   solar window and a comparison against your preferred hour and 7 PM.
   Reminders are dated for today only and do not leak into other days.
7. **Battery / Savings / Run history / Reports** — dispatch detail, savings
   (sample and forecast figures shown separately), saved runs, CSV exports.

## Honest labels to use in a demo

- "Live weather forecast" = Open-Meteo data, fetched in the browser.
- "Sample model / sample dispatch" = the 6 AM–8 PM illustrative model.
- Recommendations = rule-based heuristics from the model's own numbers,
  **not machine learning**.
- CO2 uses a CEA grid-average factor of 0.71 kg/kWh (planning estimate).
- Battery: 94% charge / 92% discharge efficiency, capped at half its
  capacity per hour, never discharged below the protected reserve on a
  normal day. Each modelled day starts at 42% charge (or the reserve floor,
  whichever is higher); there is no multi-day carry-over.

## Troubleshooting

- **Forecast stays on "Getting the forecast"**: check your internet
  connection and that you opened the app through a local server
  (Option A/B/C), not `file://`. Open-Meteo can take ~20 seconds.
- **"Local only" in the header**: expected. There is no server; data
  stays in this browser. Clearing browser data clears settings/history.
- **Settings do not appear on another device**: expected — see above.
  Use the CSV exports to carry results across devices.
