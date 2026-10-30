# SunShift India

A Windows-friendly home energy dashboard prototype. It uses simulated October data for a solar-powered home in Pune. No package install is needed to run the app; Node.js 18 or newer is required.

## Run on Windows

1. Open PowerShell in this folder.
2. Run `npm run dev`.
3. Open [http://localhost:5173](http://localhost:5173) in your browser.
4. Press `Ctrl+C` in PowerShell to stop the local server.

The dashboard includes solar generation, household use, battery dispatch, estimated grid savings and an hourly chart. Its Weather & Solar Forecast view requests a seven-day Pune forecast from Open-Meteo and estimates hourly power and daily energy using your panel size, tilt and direction. Scenarios compare clear or cloudy weather, typical or high household demand, and grid outages. The model respects battery capacity, reserve and charge/discharge efficiency while estimating imports, exports and unserved essential load. Settings cover solar capacity, battery capacity, electricity tariff and reserve. The Appliance planner compares start times for a washer, dishwasher, water heater or EV charger and saves a removable reminder list in the browser. The 7-day History view generates an illustrative week, and Reports exports hourly dispatch or daily summaries as CSV.

Weather information comes from Open-Meteo when internet access is available. Solar output is an estimate using irradiance and an 80% system-performance factor; it is not a live inverter reading or production guarantee. The dashboard's history and dispatch data remain simulated. Home settings and saved appliance reminders stay in this browser using local storage.
