from pyspark import pipelines as dp

FLIGHT_STATE = (
    f"{spark.conf.get('silver_schema')}.{spark.conf.get('flight_state_table')}"
)
LATEST_FLIGHT_STATE = (
    f"{spark.conf.get('gold_schema')}.{spark.conf.get('last_known_flight_state_table')}"
)

# Keep only the most recently ingested state for each aircraft
dp.create_streaming_table(name=LATEST_FLIGHT_STATE)
dp.create_auto_cdc_flow(
    target=LATEST_FLIGHT_STATE,
    source=FLIGHT_STATE,
    keys=["icao24"],
    sequence_by="ingested_at",
)
