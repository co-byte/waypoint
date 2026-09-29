# Waypoint

![Status: work in progress](https://img.shields.io/badge/status-work%20in%20progress-orange)
[![Last deploy](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fco-byte%2Fwaypoint%2Factions%2Fworkflows%2Fcd.yaml%2Fruns%3Fstatus%3Dsuccess%26branch%3Dmain%26per_page%3D1&query=%24.workflow_runs%5B0%5D.updated_at&label=last%20deploy&cacheSeconds=300)](https://github.com/co-byte/waypoint/actions/workflows/cd.yaml)
[![License: MIT](https://img.shields.io/github/license/co-byte/waypoint)](LICENSE)


![Screenshot of the flight tracker map](https://placehold.co/1200x600?text=Screenshot+coming+soon)

A web map that shows live aircraft positions from [OpenSky Network](https://opensky-network.org/) data. 

## How it works

1. A Cloudflare Worker (`apps/site/`) gets the latest flight data from Databricks.
2. The page uses [CesiumJS](https://cesium.com/platform/cesiumjs/) to show a 3D globe with each aircraft at its position and altitude.

## Roadmap

### Animation

- [ ] ![UI][ui] ![API][api] Update aircraft positions without reloading the page
- [ ] ![UI][ui] ![API][api] ![Data][data] Send each aircraft's previous position as well and let the UI smoothly fill in the gaps (simple 2-point interpolation)
- [ ] ![UI][ui] ![ML][ml] Predict the next position in `/etl`, so movement stays smooth without showing aircraft with a delay (the last few positions are known, the next one is predicted)

### Aircraft details

- [ ] ![API][api] ![Data][data] Add [hexdb.io](https://hexdb.io/) as a data source for airframe information to `/etl` and expand the normalized data models
- [ ] ![Data][data] ![UI][ui] Use [hexdb.io](https://hexdb.io/) to retrieve a thumbnail for each airframe
- [ ] ![Data][data] ![UI][ui] Add a thumbnail and more aircraft info to the details panel
- [ ] ![API][api] ![Data][data] Fetch airframe pictures from [airport-data.com](https://airport-data.com) instead of hexdb to get more pictures and metadata (eg info about photographer) per airframe
- [ ] ![GenAI][genai] Find out whether a vision model can be used to pick the best of an aircraft's photos (lighting, sharpness, framing)

### Airports

- [ ] ![Data][data] Load airport data from [hexdb.io](https://hexdb.io/)

### Data quality

- [ ] ![Data][data] Remove aircraft that stopped sending data (right now, every aircraft ever seen stays on the map)
- [ ] ![Data][data] Fill in missing aircraft type info from new data, instead of only checking if an aircraft is already known
- [ ] ![Data][data] ![Outliers][outliers] Check speed and altitude against limits for each aircraft type instead of one limit for all aircraft

### Aircraft summaries

- [ ] ![GenAI][genai] ![Ops][ops] Send Workers AI calls through AI Gateway to cache answers
- [ ] ![GenAI][genai] ![UI][ui] Search the map in plain English, like "helicopters over Brussels"

### SecOps

- [ ] ![Ops][ops] Move the site to a custom domain
- [ ] ![Security][security] ![Ops][ops] Turn on Cloudflar's Bot Fight Mode to block bots (requires custom domain)
- [ ] ![Ops][ops] Deploy the Databricks jobs and pipeline from GitHub Actions, similar to the site

### Varia

- [ ] ![Data][data] Add a table that shows the busiest areas
- [ ] ![Data][data] Track how many aircraft are shown, optionally by category, for live README badges
- [ ] ![UI][ui] ![Outliers][outliers] Highlight unusual flights, like emergency codes, circling or odd altitudes

[ui]: https://img.shields.io/badge/UI-1f6feb
[api]: https://img.shields.io/badge/API-8250df
[data]: https://img.shields.io/badge/Data-1a7f37
[ml]: https://img.shields.io/badge/ML-bf8700
[outliers]: https://img.shields.io/badge/Outliers-1b7c83
[genai]: https://img.shields.io/badge/GenAI-e16f24
[security]: https://img.shields.io/badge/Security-cf222e
[ops]: https://img.shields.io/badge/Ops-6e7781
