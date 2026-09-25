from pyspark import pipelines as dp
from pyspark.sql import functions as F

FAIL_EXPECTATIONS = {}
DROP_EXPECTATIONS = {}
WARN_EXPECTATIONS = {}


@dp.table(name="opensky_enriched", private=True)
@dp.expect_all_or_fail(FAIL_EXPECTATIONS)
@dp.expect_all_or_drop(DROP_EXPECTATIONS)
@dp.expect_all(WARN_EXPECTATIONS)
def opensky_enriched_silver():
    opensky_cleaned =  (
        spark
        .readStream
        .table("opensky_cleaned")
        )

    category_ref = (
        spark
        .read
        .table("reference.opensky_aircraft_category")
        .select(["code", "category"])
        )

    position_source_ref = (
        spark.read
        .table("reference.opensky_position_source")
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
