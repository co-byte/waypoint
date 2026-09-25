from pyspark import pipelines as dp
from pyspark.sql import functions as F

REFERENCE_SCHEMA = spark.conf.get("reference_schema")
OPENSKY_CLEANED_TABLE = spark.conf.get("opensky_cleaned_table")
OPENSKY_ENRICHED_TABLE = spark.conf.get("opensky_enriched_table")
OPENSKY_AIRCRAFT_CATEGORY_TABLE = spark.conf.get("opensky_aircraft_category_table")
OPENSKY_POSITION_SOURCE_TABLE = spark.conf.get("opensky_position_source_table")

OPENSKY_AIRCRAFT_CATEGORY = f"{REFERENCE_SCHEMA}.{OPENSKY_AIRCRAFT_CATEGORY_TABLE}"
OPENSKY_POSITION_SOURCE = f"{REFERENCE_SCHEMA}.{OPENSKY_POSITION_SOURCE_TABLE}"

FAIL_EXPECTATIONS = {}
DROP_EXPECTATIONS = {}
WARN_EXPECTATIONS = {}


@dp.table(name=OPENSKY_ENRICHED_TABLE, private=True)
@dp.expect_all_or_fail(FAIL_EXPECTATIONS)
@dp.expect_all_or_drop(DROP_EXPECTATIONS)
@dp.expect_all(WARN_EXPECTATIONS)
def opensky_enriched_silver():
    opensky_cleaned =  (
        spark
        .readStream
        .table(OPENSKY_CLEANED_TABLE)
        )

    category_ref = (
        spark
        .read
        .table(OPENSKY_AIRCRAFT_CATEGORY)
        .select(["code", "category"])
        )

    position_source_ref = (
        spark.read
        .table(OPENSKY_POSITION_SOURCE)
        .select(["code", F.col("origin").alias("position_source")])
        )

    opensky_enriched = (
        opensky_cleaned
        .join(category_ref, opensky_cleaned.category == category_ref.code, "left")
        .drop(opensky_cleaned.category, category_ref.code)
        .join(position_source_ref, opensky_cleaned.position_source == position_source_ref.code, "left")
        .drop(opensky_cleaned.position_source, position_source_ref.code)
    )

    return opensky_enriched
