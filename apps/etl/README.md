# Waypoint ETL

Databricks pipeline that ingests live aircraft positions from the OpenSky Network, cleans them and pushes the latest state to the [site](../site)'s Cloudflare KV. Part of [Waypoint](../../README.md).

## Pipeline

```mermaid
flowchart LR
    raw[("Raw OpenSky data")] --> clean["Clean & validate"] --> enrich["Enrich"]
    enrich --> aircraft[("Aircraft info")]
    enrich --> history[("Flight history")] --> latest[("Latest positions")]
```

## Tables

```mermaid
erDiagram
    "aircraft (silver)" {
        string icao24 PK
        int category
        string origin_country
    }

    "flight_state (silver)" {
        string icao24 PK, FK
        timestamp time_position PK
        double longitude
        double latitude
        double baro_altitude
        double velocity
        boolean baro_altitude_outlier
    }

    "latest_flight_state (gold)" {
        string icao24 PK, FK
        double longitude
        double latitude
        double baro_altitude
        double velocity
    }

    "aircraft (silver)" ||--o{ "flight_state (silver)" : "icao24"
    "flight_state (silver)" ||--|| "latest_flight_state (gold)" : "most recent state per icao24"
```
