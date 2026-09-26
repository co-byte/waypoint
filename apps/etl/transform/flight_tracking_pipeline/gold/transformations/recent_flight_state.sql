-- A materialized view would trigger periodically, even when nobody visits the site + data would always be slightly outdated (since the last materialization run)
CREATE VIEW gold.recent_flight_state
AS
SELECT * 
FROM waypoint_catalog.gold.last_known_flight_state
WHERE ingested_at >= current_timestamp() - INTERVAL 1 HOUR;