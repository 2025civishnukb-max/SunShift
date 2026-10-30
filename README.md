# SunShift India

SunShift India is a local, server-backed solar planning website for a household. It combines a seven-day weather forecast with a solar-output estimate, battery dispatch, household demand assumptions, appliance scheduling, outage scenarios, saved calculations and CSV exports.

## Run it on Windows

1. Install Node.js 18 or newer.
2. Open PowerShell in the SunShift folder.
3. Run `npm run dev`.
4. Open [http://localhost:5173](http://localhost:5173).
5. Leave the PowerShell window open while presenting; press `Ctrl+C` when finished.

The Node server serves the website and its JSON API. It stores home settings, appliance reminders and up to 200 saved calculations in `data/sunshift.json` on this computer. That data file is created automatically and is excluded from version control.

## Main workflows

- **Weather & solar forecast:** Fetches seven days of weather and irradiance from Open-Meteo for the selected city, then estimates hourly solar power from panel size, tilt and direction.
- **Day-ahead plan:** Estimates hourly household demand, battery charging and discharge, grid imports, cost and self-sufficiency. It incorporates saved appliance reminders and can export the selected day as CSV.
- **Appliance planner:** Finds sunny start-time windows for common appliances and saves or removes reminders on the local server.
- **Scenarios:** Recalculates clear/cloudy weather, typical/high demand and grid-outage cases, then saves each result in Run history.
- **Reports:** Exports hourly scenario dispatch and saved calculations as CSV.
- **Settings:** Saves location, panel, battery, reserve and tariff settings on the local server.

## Accuracy and connectivity

Weather information requires an internet connection and is provided by Open-Meteo. Solar generation is calculated from forecast irradiance with an 80% system-performance assumption. Household demand follows an example daily profile and optional cooling allowance; it is not learned from a smart meter. Battery dispatch uses the saved capacity and reserve with modeled charge/discharge efficiencies. Results are planning estimates, not measurements or guarantees.

The site does not yet communicate with an inverter, smart meter, utility account or home automation system. Connecting real-time readings would require a supported device/API and credentials. The local server is intended for running and presenting the project on this computer; a public deployment needs a hosting service that supports Node.js and persistent storage.

## Deploy on Vercel

The project includes a Vercel Function for the same JSON API. On Vercel, it stores settings, schedules and run history in a **private Vercel Blob store**; do not use a public store for application state.

1. Upload this project folder or a ZIP to [Vercel Drop](https://vercel.com/drop) and deploy it.
2. Open the new project’s **Storage** tab, create a **private Blob** store, and connect it to the project. Vercel then provides the storage credentials to its Functions.
3. Confirm `/api/health` returns `"ok":true` and the overview shows `Connected · saved`.

If the private Blob store is not connected, the website still opens, but saving falls back to that browser’s local storage and will not sync between browsers or devices. Vercel Functions use the Node.js runtime, and their local filesystem is not used for persistent app state.
