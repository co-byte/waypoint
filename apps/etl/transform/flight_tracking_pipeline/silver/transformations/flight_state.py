from pyspark import pipelines as dp
from pyspark.sql import functions as F

FAIL_EXPECTATIONS = {}
DROP_EXPECTATIONS = {}
WARN_EXPECTATIONS = {
    "plausible_baro_altitude": "baro_altitude IS NOT NULL and baro_altitude BETWEEN -100 and 36000",
    "plausible_vertical_rate": "vertical_rate IS NOT NULL and vertical_rate > -30",
    "plausible_geo_altitude": "geo_altitude IS NOT NULL and geo_altitude BETWEEN -450 and 15000",
    "plausible_velocity": "velocity IS NOT NULL and velocity < 300",

    ## Tuple-level constraints
    "plausible_altitude_disagreement": "geo_altitude IS NOT NULL and baro_altitude IS NOT NULL and geo_altitude - baro_altitude BETWEEN -293 and 1017", # Static check for now, can be made dynamic later
}

@dp.temporary_view(name="flight_state_changes")
@dp.expect_all_or_fail(FAIL_EXPECTATIONS)
@dp.expect_all_or_drop(DROP_EXPECTATIONS)
@dp.expect_all(WARN_EXPECTATIONS)
def aircraft():
    df = (
        spark.readStream
        .table("opensky_enriched")
        .select(
            "icao24",
            "callsign",
            "time_position",
            "last_contact",
            "longitude",
            "latitude",
            "baro_altitude",
            "on_ground",
            "velocity",
            "true_track",
            "vertical_rate",
            "geo_altitude",
            "squawk",
            "spi",
            "position_source",
            "category",
            "ingested_at"
            )
    )

    for expectation, condition in WARN_EXPECTATIONS.items():
        outlier_indicator_column = f"{expectation.replace('plausible_', '')}_outlier"
        df = df.withColumn(outlier_indicator_column, ~F.expr(condition))

    return df

dp.create_streaming_table("flight_state")

dp.create_auto_cdc_flow(
    source="flight_state_changes",
    target="flight_state",
    keys=["icao24", "time_position"],
    sequence_by="time_position",
)