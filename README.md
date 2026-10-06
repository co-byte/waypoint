<div align="center">

# Waypoint

A live 3D map of aircraft around the globe, built on [OpenSky Network](https://opensky-network.org/) data.

[![CD](https://github.com/co-byte/waypoint/actions/workflows/cd.yaml/badge.svg)](https://github.com/co-byte/waypoint/actions/workflows/cd.yaml)
[![License: MIT](https://img.shields.io/github/license/co-byte/waypoint)](LICENSE)

**[Live demo](https://waypoint.vandersteencobe.workers.dev/)**

![An Emirates Boeing 777 selected over Brussels, with its photo, altitude, speed and AI summary in the details panel](https://repository-images.githubusercontent.com/1375205848/61a497f7-e88f-436d-98a7-9f508bcc1722)

![Databricks](https://img.shields.io/badge/Databricks-FF3621?logo=databricks&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflareworkers&logoColor=white)
![CesiumJS](https://img.shields.io/badge/CesiumJS-6CADDF?logo=cesium&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)

</div>

Coverage depends on where OpenSky receives data, which varies by region and time of day.

## Features

- ✈️ A 3D model for each aircraft category, from light aircraft and helicopters to airliners and heavies
- 🔍 Search by callsign or ICAO address, with a count of matching aircraft
- 🖼️ A details panel with a photo of the airframe and a short AI-written summary
- 🌍 Smooth movement between position updates, without reloading the page

## How it works

```mermaid
flowchart LR
    opensky["OpenSky Network"] --> ingest

    subgraph databricks["Databricks, every 5 minutes"]
        ingest["Ingest"] --> silver["Silver"] --> gold["Gold"]
    end

    gold --> kv[("Cloudflare KV")] --> worker["Cloudflare Worker"] --> cesium["CesiumJS globe"]
    hexdb["hexdb.io"] -- "airframe info and photos" --> worker
    ai["Workers AI"] -- "aircraft summaries" --> worker
```

## Repository layout

| Folder                               | Contents                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| [`apps/etl`](apps/etl)               | Databricks pipeline that ingests, cleans and serves the flight data |
| [`apps/site`](apps/site)             | Cloudflare Worker and the CesiumJS front end                        |
| [`apps/monitoring`](apps/monitoring) | Databricks dashboard that tracks compute usage                      |

## Roadmap

Planned work is tracked in [GitHub issues](https://github.com/co-byte/waypoint/issues).

## Credits

- Flight data: [OpenSky Network](https://opensky-network.org/)
- Airframe info and photos: [hexdb.io](https://hexdb.io/)
- 3D models: various authors via [Poly Pizza](https://poly.pizza/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), see [the model credits](apps/site/public/models/CREDITS.md)
- Basemap: [OpenFreeMap](https://openfreemap.org/), [© OpenMapTiles](https://www.openmaptiles.org/), data from [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Terrain: [Mapzen, AWS Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
