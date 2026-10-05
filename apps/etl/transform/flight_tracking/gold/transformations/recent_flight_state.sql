-- A materialized view would trigger periodically, even when nobody visits the site + data would always be slightly outdated (since the last materialization run)
CREATE VIEW ${gold_schema}.${recent_flight_state_view}
AS
WITH recent_positions AS (
  SELECT
    icao24,
    slice(
      sort_array(collect_list(struct(unix_seconds(time_position) AS time_position, longitude, latitude, geo_altitude)), false),
      1,
      ${recent_positions_kept}
    ) AS recent_positions
  FROM ${silver_schema}.${flight_state_table}
  WHERE ingested_at >= current_timestamp() - INTERVAL 1 HOUR
  GROUP BY icao24
)
SELECT *
FROM ${gold_schema}.${last_known_flight_state_table}
JOIN recent_positions USING (icao24)
WHERE ingested_at >= current_timestamp() - INTERVAL 1 HOUR;
