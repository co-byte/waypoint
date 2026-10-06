# Waypoint ETL

Databricks pipeline that ingests live aircraft positions from the OpenSky Network, cleans them and pushes the latest state to the [site](../site)'s Cloudflare KV. Part of [Waypoint](../../README.md).

## Pipeline

A job runs the pipeline every 5 minutes.

```mermaid
flowchart LR
    opensky["OpenSky API"] --> vectors[("opensky_state_vectors (bronze)")]
    vectors --> cleaned["opensky_cleaned"] --> enriched["opensky_enriched"]
    reference[("Reference tables (category, position source)")] --> enriched
    enriched --> aircraft[("aircraft (silver)")]
    enriched --> flight_state[("flight_state (silver)")] --> last_known[("last_known_flight_state (gold)")]
    last_known --> recent["recent_flight_state (gold view)"] --> kv[("Cloudflare KV")]
```

## Tables

```mermaid
erDiagram
    "aircraft (silver)" {
        string icao24 PK
        string category
        string origin_country
    }

    "flight_state (silver)" {
        string icao24 PK, FK
        timestamp time_position PK
        string callsign
        double longitude
        double latitude
        double geo_altitude
        double baro_altitude
        double velocity
        double true_track
        double vertical_rate
        string category
        timestamp ingested_at
        boolean baro_altitude_outlier "one flag per plausibility check"
    }

    "last_known_flight_state (gold)" {
        string icao24 PK, FK
        timestamp time_position
        double longitude
        double latitude
        double geo_altitude
        timestamp ingested_at
    }

    "recent_flight_state (gold view)" {
        string icao24 PK, FK
        array recent_positions "newest positions from the last hour"
    }

    "aircraft (silver)" ||--o{ "flight_state (silver)" : "icao24"
    "flight_state (silver)" ||--o| "last_known_flight_state (gold)" : "latest state per icao24"
    "last_known_flight_state (gold)" ||--o| "recent_flight_state (gold view)" : "seen in the last hour"
```

`last_known_flight_state` has the same columns as `flight_state`, and `recent_flight_state` adds `recent_positions` to them; only the key columns are shown.
