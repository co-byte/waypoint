-- A materialized view would trigger periodically, even when nobody visits the site + data would always be slightly outdated (since the last materialization run)
CREATE VIEW ${gold_schema}.recent_flight_state
AS
SELECT *
FROM ${gold_schema}.${last_known_flight_state_table}
WHERE ingested_at >= current_timestamp() - INTERVAL 1 HOUR;