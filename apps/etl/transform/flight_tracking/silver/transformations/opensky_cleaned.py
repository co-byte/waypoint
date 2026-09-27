from pyspark import pipelines as dp
from pyspark.sql import functions as F

BRONZE_SCHEMA = spark.conf.get("bronze_schema")
OPENSKY_STATE_VECTORS_TABLE = spark.conf.get("opensky_state_vectors_table")
OPENSKY_CLEANED_TABLE = spark.conf.get("opensky_cleaned_table")

FAIL_EXPECTATIONS = {
    "valid_icao24": "icao24 IS NOT NULL AND length(icao24) = 6",
}

DROP_EXPECTATIONS = {
    # Field-level constraints
    "valid_callsign": "callsign IS NULL OR callsign IS NOT NULL AND (length(trim(callsign)) = 0 OR length(callsign) = 8)",
    "valid_origin_country": "origin_country IS NOT NULL and origin_country not rlike '^[^A-Za-z ]+$'",
    "valid_last_contact": "last_contact IS NOT NULL and unix_timestamp(last_contact) >= unix_timestamp(timestamp('2026-08-09T17:36:39'))",  # oldest data
    "valid_time_position": "time_position IS NOT NULL",
    "valid_longitude": "longitude IS NOT NULL and longitude >= -180 and longitude <= 180",
    "valid_latitude": "latitude IS NOT NULL and latitude >= -90 and latitude <= 90",
    "valid_baro_altitude": "baro_altitude IS NULL or baro_altitude between -1000 and 40000",
    "valid_on_ground": "on_ground IS NOT NULL",
    "valid_velocity": "velocity IS NOT NULL and velocity between 0 AND 1000",
    "valid_true_track": "true_track IS NOT NULL and true_track BETWEEN 0 AND 360",
    "valid_vertical_rate": "vertical_rate IS NULL or vertical_rate BETWEEN -50 and 30",
    "valid_geo_altitude": "geo_altitude is NULL or geo_altitude BETWEEN -500 and 40000",
    "valid_squawk": "squawk IS NULL OR squawk IS NOT NULL AND squawk BETWEEN 0 and 7777",
    "valid_spi": "spi IS NOT NULL",
    "valid_position_source": "position_source IS NOT NULL and position_source BETWEEN 0 AND 3",
    "valid_category": "category IS NOT NULL and category BETWEEN 0 AND 20",
    # Tuple-level constraints
    "valid_(time_position, last_contact)": "time_position <= last_contact",
    "valid_(on_ground,baro_altitude)": "baro_altitude is null and on_ground is true OR baro_altitude is not null and on_ground is false",
}

WARN_EXPECTATIONS = {}


@dp.table(name=OPENSKY_CLEANED_TABLE, private=True)
@dp.expect_all_or_fail(FAIL_EXPECTATIONS)
@dp.expect_all_or_drop(DROP_EXPECTATIONS)
@dp.expect_all(WARN_EXPECTATIONS)
def opensky_cleaned():
    df = (
        spark
        .readStream
        .table(f"{BRONZE_SCHEMA}.{OPENSKY_STATE_VECTORS_TABLE}")
        .drop("sensors")  # Always null
        .withColumn("time_position", F.col("time_position").cast("timestamp"))
        .withColumn("last_contact", F.col("last_contact").cast("timestamp"))
    )

    return df
