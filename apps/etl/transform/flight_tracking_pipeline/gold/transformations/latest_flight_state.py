from pyspark import pipelines as dp


# Keep only the most recently ingested state for each aircraft
dp.create_streaming_table(name="gold.last_known_flight_state")

dp.create_auto_cdc_flow(
    target="gold.last_known_flight_state",
    source="flight_state",
    keys=["icao24"],
    sequence_by="ingested_at",
)
