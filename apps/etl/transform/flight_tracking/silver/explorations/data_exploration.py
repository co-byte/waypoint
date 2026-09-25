# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# MAGIC %md
# MAGIC ## Background info
# MAGIC
# MAGIC ### icao24
# MAGIC - *Permanent, unique 24-bit hex code, hardcoded to the specific airfrome of the aircraft (does not change throughout lifetime of aircraft)*
# MAGIC - *Aircraft can have more than 1 transponder (eg 1 extra for back-up)*

# COMMAND ----------

# MAGIC %md
# MAGIC ## 0. Joins & Reference resolutions

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC select distinct o.origin_country, c.iso2_code, c.country_name from intro_to_data_engineering.bronze.opensky_states_raw o full join intro_to_data_engineering.reference.countries_iso c on o.origin_country = c.country_name

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Field-level constraints

# COMMAND ----------

# MAGIC %md
# MAGIC ### origin_country

# COMMAND ----------

# MAGIC %sql
# MAGIC -- select distinct origin_country from intro_to_data_engineering.bronze.opensky_states_raw
# MAGIC
# MAGIC select distinct origin_country from intro_to_data_engineering.bronze.opensky_states_raw where origin_country not rlike "^[A-Za-z ]+$"

# COMMAND ----------

# MAGIC %md
# MAGIC ### icao24

# COMMAND ----------

# MAGIC %sql
# MAGIC select len(icao24), count(*) as number_of_rows_with_this_length from intro_to_data_engineering.bronze.opensky_states_raw group by len(icao24) limit 1000

# COMMAND ----------

# MAGIC %md
# MAGIC - Single unique identifier of aircraft within OpenSky data
# MAGIC - 24-bit hex code
# MAGIC $$ len(icao24) = 6 $$

# COMMAND ----------

# MAGIC %md
# MAGIC ### callsign

# COMMAND ----------

# MAGIC %sql
# MAGIC select len(callsign), count(*) as number_of_rows from intro_to_data_engineering.bronze.opensky_states_raw group by len(callsign) limit 1000
# MAGIC -- select callsign from intro_to_data_engineering.bronze.opensky_states_raw where len(callsign)=0 limit 10

# COMMAND ----------

# MAGIC %md
# MAGIC Most rows have len=6, some have len=0
# MAGIC $$ len(callsign) = 8 \lor len(callsign) = 0 $$
# MAGIC
# MAGIC Airplanes are required to have a callsign [(source)](https://skybrary.aero/articles/aircraft-call-sign) -> empty values are NOT due to the airplane not having a callsign, but rather due to them not disclosing their callsign to flight trackers such as Opensky.

# COMMAND ----------

# MAGIC %sql
# MAGIC --select distinct o1.icao24, o2.callsign from intro_to_data_engineering.bronze.opensky_states_raw o1 left join intro_to_data_engineering.bronze.opensky_states_raw o2 on o1.icao24 = o2.icao24 where len(o1.callsign)=0
# MAGIC
# MAGIC -- 4481a1
# MAGIC -- 4d00d9
# MAGIC -- 44d1a6
# MAGIC -- 42529e
# MAGIC -- 49c31c
# MAGIC -- 44b2cd
# MAGIC -- 44815e
# MAGIC -- 500533
# MAGIC -- 394de5
# MAGIC -- 44adeb
# MAGIC -- 4d00c6
# MAGIC -- 4481af
# MAGIC --select * from intro_to_data_engineering.bronze.opensky_states_raw limit 3
# MAGIC select icao24, callsign, timestamp(time_position), longitude, latitude, on_ground from intro_to_data_engineering.bronze.opensky_states_raw where icao24="4481a1" order by time_position limit 20

# COMMAND ----------

# MAGIC %md
# MAGIC 2 observations:
# MAGIC     1. The bronze opensky table contains multiple rows with the same 'last_contact' value -> duplicate data
# MAGIC     2. 

# COMMAND ----------

# MAGIC %md
# MAGIC ### time_position

# COMMAND ----------

# MAGIC %sql
# MAGIC select count(*) from bronze.opensky_states_raw where time_position is null or time_position < 

# COMMAND ----------

# MAGIC %md
# MAGIC ### last_contact

# COMMAND ----------

# MAGIC %md
# MAGIC ### latitude

# COMMAND ----------

# MAGIC %md
# MAGIC ### baro_altitude

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select min(baro_altitude), max(baro_altitude) from opensky_states_raw;

# COMMAND ----------

# MAGIC %md
# MAGIC ### on_ground

# COMMAND ----------

# MAGIC %sql
# MAGIC select icao24, on_ground, geo_altitude, baro_altitude, longitude, latitude, category.category from intro_to_data_engineering.bronze.opensky_states_raw opensky left join intro_to_data_engineering.reference.opensky_aircraft_category category on opensky.category = category.code where on_ground = true order by time_position limit 20

# COMMAND ----------

# MAGIC %md
# MAGIC ### velocity

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select min(velocity), max(velocity) from opensky_states_raw;
# MAGIC -- select round((count(*)-count(velocity))/count(*)*100, 5) as null_percentage from intro_to_data_engineering.bronze.opensky_states_raw
# MAGIC
# MAGIC select round(velocity, -1) from opensky_states_raw;
# MAGIC
# MAGIC
# MAGIC select * from opensky_states_raw where velocity > 2000

# COMMAND ----------

# MAGIC %md
# MAGIC ### true_track

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select min(true_track), max(true_track) from opensky_states_raw

# COMMAND ----------

# MAGIC %md
# MAGIC ### vertical_rate

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select min(vertical_rate), max(vertical_rate), count(*)-count(vertical_rate) as null_vals from opensky_states_raw;
# MAGIC select round(vertical_rate, 0) as vertical_rate from opensky_states_raw where vertical_rate is not null and vertical_rate >= -30 and vertical_rate <= 30 order by rand() limit 500

# COMMAND ----------

# MAGIC %md
# MAGIC #### Observations
# MAGIC - Points cluster in two normal distributions centered around -7° (descending) and +7° (ascending), with a single large spike at 0° (level flight)

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select distinct icao24, round(vertical_rate, 0) as vertical_rate from opensky_states_raw order by vertical_rate desc;
# MAGIC
# MAGIC -- select * from opensky_states_raw where icao24="39dd42"
# MAGIC -- select * from opensky_states_raw where on_ground is true and vertical_rate is not null

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select
# MAGIC     round(vertical_rate, 0) as vertical_rate,
# MAGIC     round(geo_altitude, 0) as geo_altitude,
# MAGIC     category
# MAGIC from opensky_states_raw
# MAGIC where category=5
# MAGIC order by rand(5)
# MAGIC limit 5000;

# COMMAND ----------

# MAGIC %md
# MAGIC #### Category
# MAGIC - 3 -> small aircraft; fly lower (ceiling= +-3k)
# MAGIC - 4 -> Large aircraft, seem to have fly horizontal around 11km height, vertical_rate around -10 and 8
# MAGIC - 5 -> no significant observations
# MAGIC - 6 -> heavy => flying stable around 11km, vertical_rate not really grouped between -10 and 14

# COMMAND ----------

from pyspark.sql import functions as F

states = (
    spark
    .table("intro_to_data_engineering.bronze.opensky_states_raw")
    .select(
        "geo_altitude",
        "vertical_rate",
        F.col("category").alias("numeric_category")
    )
    .na.drop(subset=["geo_altitude", "vertical_rate"])
    .filter(F.col("numeric_category") > 1)
    .alias("A")
    .join(
        other=(
            spark
            .table("intro_to_data_engineering.reference.opensky_aircraft_category")
            .select("code", "category")
            .alias("B")
            ),
        on=(
            F.col("A.numeric_category") == F.col("B.code")
        ),
        how="left"
    )
    .limit(10000)
)
display(states)

category_counts = states.groupBy("category").count().collect()
display(category_counts)

states.plot(
    kind="scatter",
    x="vertical_rate",
    y="geo_altitude",
    color="category",
)

# COMMAND ----------

from pyspark.sql import functions as F

# Exluce nulls & take sample
df =(
    spark.table("intro_to_data_engineering.bronze.opensky_states_raw")
    .select("geo_altitude","vertical_rate")
    .na.drop(subset=["vertical_rate", "geo_altitude"])
    .sample(.1, seed=5)
    .withColumn("feature", F.expr("(geo_altitude*20/14000)*vertical_rate") )
)

median = df.agg(F.expr("percentile_approx(feature, .5)")).collect()[0][0]
df_dev = df.withColumn("deviation", F.abs(F.col("feature") - median))
mad =  1.4826 * df_dev.agg(F.expr("percentile_approx(deviation, .5)")).collect()[0][0]

df_grouped = df_dev.withColumn("outlier", F.when(F.col("deviation") > 3* mad, 1).otherwise(0))
display(df_grouped)


# COMMAND ----------

import pandas as pd
import numpy as np

from sklearn.neighbors import NearestNeighbors
from sklearn.cluster import DBSCAN
from pyspark.ml.feature import VectorAssembler, RobustScaler
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, DoubleType, IntegerType, StringType


data = (
  spark
  .table("intro_to_data_engineering.bronze.opensky_states_raw")
  .select(
    "geo_altitude",
    "vertical_rate",
    "category"
  )
  .na.drop(subset=["geo_altitude", "vertical_rate"])
  .filter(F.col("category") == 3)
  # .filter(F.col("vertical_rate") > 1.2)
  # .sample(.7, seed=6)
)

assembler = VectorAssembler(
  inputCols=["geo_altitude", "vertical_rate"],
  outputCol="features"
)
data_frame = assembler.transform(data)

# scaler = RobustScaler(
#   inputCol="features",
#   outputCol="scaledFeatures",
#   withScaling=True,
#   withCentering=False,
#   lower=0.25,
#   upper=0.75,
#   relativeError=0.01
# )
# scaler_model = scaler.fit(data_frame)

# Transform each feature to have unit quantile range.
quantiles = data.approxQuantile(
    ["geo_altitude", "vertical_rate"], [0.25, 0.75], 0.01
)
alt_q1, alt_q3 = quantiles[0]
vr_q1, vr_q3 = quantiles[1]

scaled_data = (
    data
    .withColumn("geo_altitude_scaled", (F.col("geo_altitude")) / (alt_q3 - alt_q1))
    .withColumn("vertical_rate_scaled", (F.col("vertical_rate")) / (vr_q3 - vr_q1))
)

schema = StructType([
    StructField("category", IntegerType()),
    StructField("vertical_rate", DoubleType()),
    StructField("geo_altitude", DoubleType()),
    StructField("cluster", IntegerType()),
])

def suggest_eps(X, k=5):
    nbrs = NearestNeighbors(n_neighbors=k).fit(X)
    distances, _ = nbrs.kneighbors(X)
    k_distances = np.sort(distances[:, -1])
    return k_distances

import matplotlib.pyplot as plt

sample_pdf = scaled_data.filter(F.col("category") == 3).toPandas()
X = sample_pdf[["geo_altitude_scaled", "vertical_rate_scaled"]].to_numpy()
k_distances = suggest_eps(X)

plt.plot(k_distances)
plt.ylabel("k-distance")
plt.show()

def run_dbscan(pdf: pd.DataFrame) -> pd.DataFrame:
  X = pdf[["geo_altitude_scaled", "vertical_rate_scaled"]].to_numpy()
  pdf["cluster"] = DBSCAN(eps=1).fit_predict(X)
  return pdf[["category", "geo_altitude", "vertical_rate", "cluster"]]

result = scaled_data.groupBy("category").applyInPandas(run_dbscan, schema=schema)
display(result)

# COMMAND ----------

# MAGIC %md
# MAGIC ### sensors

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC select * from intro_to_data_engineering.bronze.opensky_states_raw

# COMMAND ----------

# MAGIC %md
# MAGIC ### geo_altitude

# COMMAND ----------

# MAGIC %sql
# MAGIC select min(geo_altitude), max(geo_altitude), count(*)-count(geo_altitude) as null_vals, (count(*)-count(geo_altitude))/count(*) as freq_of_nulls from opensky_states_raw;
# MAGIC
# MAGIC select distinct round(geo_altitude, -1) as geo_altitude from opensky_states_raw order by geo_altitude desc;
# MAGIC
# MAGIC select * from opensky_states_raw where geo_altitude > 30000;
# MAGIC
# MAGIC select * from opensky_states_raw where icao24='4ca770';
# MAGIC
# MAGIC select distinct(geo_altitude) from opensky_states_raw where geo_altitude between 16000 and 30000;
# MAGIC

# COMMAND ----------

# MAGIC %md
# MAGIC We should trigger a warning for geo_altitude values over 15000; values of 30k+ are likely expressed in feet instead of meters -> 30k feet ~= 10km

# COMMAND ----------

# MAGIC %md
# MAGIC ### squawk

# COMMAND ----------

# MAGIC %md
# MAGIC = (temporary) transponder code
# MAGIC - Value [0000-7777]
# MAGIC - Assigned by Air Traffic Control for a *specific flight or airspace sector* => VARIABLE
# MAGIC - value 7700 = general emergency
# MAGIC - value 7600 = radio failure

# COMMAND ----------

# MAGIC %sql
# MAGIC select count(*) from opensky_states_raw where squawk is null;
# MAGIC
# MAGIC select min(squawk), max(squawk) from opensky_states_raw

# COMMAND ----------

# MAGIC %sql
# MAGIC --select icao24, max(squawk), min(squawk) from intro_to_data_engineering.bronze.opensky_states_raw group by icao24
# MAGIC select icao24, callsign, squawk, on_ground, longitude, latitude, date_format(timestamp(last_contact), 'HH:mm:ss') as last_contact
# MAGIC from intro_to_data_engineering.bronze.opensky_states_raw 
# MAGIC where icao24='44ce6f' and last_contact >= unix_timestamp(date("2026-08-11"))
# MAGIC order by last_contact desc

# COMMAND ----------

# MAGIC %md
# MAGIC ### spi
# MAGIC
# MAGIC ### position_source
# MAGIC
# MAGIC ### category
# MAGIC

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Functional dependencies

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.dataframe import DataFrame
from itertools import permutations

def find_functional_dependencies(df: DataFrame) -> list[tuple[str, str]]:
    columns = df.columns
    row_counts = df.agg(
        *[F.approx_count_distinct(column).alias(column) for column in columns]
    ).first().asDict()

    functional_dependencies = list(tuple())

    for x, y in permutations(columns, 2):
        # Performance optimization/
        #   Filter out all pairs where count(Y) > count(X), since X cannot functionally determine Y if there are more Y values than X values
        if row_counts[x] < row_counts[y]:
            continue

        # If a single X value can result in multiple Y values, then X cannot functionally determine Y
        if df.groupby(x).agg(F.countDistinct(y).alias("n")).filter(F.col("n") > 1).first() is not None:
            continue

        functional_dependencies.append((x, y))

    return functional_dependencies


df = spark.table("intro_to_data_engineering.bronze.opensky_states_raw").sample(.1)
find_functional_dependencies(df)

# COMMAND ----------

# MAGIC %sql
# MAGIC select max(true_track), min(true_track), count(case when true_track is null then 1 else null end) from intro_to_data_engineering.bronze.opensky_states_raw

# COMMAND ----------

# MAGIC %md
# MAGIC ### Observations
# MAGIC '**sensors**', '**position_source**', and '**spi**' all have very low cardinality (eg only 'true'/'false' values) => although target of many functional determinations, these are caused by the low cardinality, rather than by actual tangible relations.
# MAGIC
# MAGIC Actual functional determinations found are:
# MAGIC
# MAGIC 1. $$ icao24 \mapsto origin\\_country $$
# MAGIC 2. $$ icao24 \mapsto category $$
# MAGIC 3. $$ baro\\_altitude \mapsto on\\_ground $$
# MAGIC
# MAGIC ### Conclusion
# MAGIC - Functional dependencies 1 and 2 expose origin_country and category being dependent solely on icao24 instead of (icao24, timestamp) -> 2NF violation; we should move these to a separate 'aircraft' table {icao24 (PK), origin_country, category}
# MAGIC
# MAGIC on_ground is determined by baro_altitude -> can be 

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Tuple-level constraints
# MAGIC

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC select baro_altitude, geo_altitude, on_ground from opensky_states_raw where geo_altitude is null and on_ground is false limit 50;
# MAGIC
# MAGIC select icao24, callsign, timestamp(time_position), timestamp(last_contact), longitude, latitude, baro_altitude, geo_altitude, vertical_rate from opensky_states_raw where icao24="48c239"

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC
# MAGIC -- View distribution of (geo-baro)
# MAGIC with base as(
# MAGIC     select
# MAGIC         icao24,
# MAGIC         geo_altitude,
# MAGIC         baro_altitude,
# MAGIC         (geo_altitude - baro_altitude) as diff,
# MAGIC         (geo_altitude / baro_altitude) as ratio
# MAGIC     from opensky_states_raw
# MAGIC     where baro_altitude is not null and baro_altitude != 0 and geo_altitude is not null and (geo_altitude - baro_altitude) > 0
# MAGIC     order by rand()
# MAGIC     limit 2000
# MAGIC     )
# MAGIC select
# MAGIC     b.icao24,
# MAGIC     b.geo_altitude,
# MAGIC     b.baro_altitude,
# MAGIC     b.diff,
# MAGIC     b.ratio
# MAGIC from base b

# COMMAND ----------

# MAGIC %md
# MAGIC ### Observations
# MAGIC - (geo_altitude - baro_altitude) is binomially distributed
# MAGIC - (geo_altitude / baro_altitude) is heavily skewed
# MAGIC - extreme outliers are present
# MAGIC - both geo_altitude and baro_altitude values can go from (below) 0 to +10k
# MAGIC
# MAGIC ### Next steps
# MAGIC - Use IQR to detect outliers
# MAGIC - Verify assumption that using the diff will result in fewer false positives than when relying on ratio (due to the large range of altitude values)

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Setup to inspect geo versus baro outliers
# MAGIC with base as(
# MAGIC     select
# MAGIC         icao24,
# MAGIC         geo_altitude,
# MAGIC         baro_altitude,
# MAGIC         round(geo_altitude/baro_altitude, 3) as diff
# MAGIC     from opensky_states_raw
# MAGIC     where baro_altitude is not null and baro_altitude != 0 and geo_altitude is not null
# MAGIC     order by rand()
# MAGIC     limit 1000
# MAGIC     ),
# MAGIC stats as(
# MAGIC     select
# MAGIC         min(diff) as min_ratio,
# MAGIC         percentile_cont(0.25) within group (order by diff) as q1,
# MAGIC         percentile_cont(0.50) within group (order by diff) as median,
# MAGIC         percentile_cont(0.75) within group (order by diff) as q3,
# MAGIC         max(diff) as max_ratio,
# MAGIC         q3 - q1 as iqr
# MAGIC     from base
# MAGIC     )
# MAGIC select
# MAGIC     b.icao24,
# MAGIC     b.geo_altitude,
# MAGIC     b.baro_altitude,
# MAGIC     b.diff,
# MAGIC     case
# MAGIC         when b.diff < s.q1 - 1.5 * s.iqr then true
# MAGIC         when b.diff > s.q3 + 1.5 * s.iqr then true
# MAGIC         else false
# MAGIC     end as outlier
# MAGIC from base b
# MAGIC cross join stats s;
# MAGIC
# MAGIC -- Similar operation but adjusted for 'scaling heterogenity' (smaller values are too quickly flagged as outlier due to the ratio)
# MAGIC with base as(
# MAGIC     select
# MAGIC         icao24,
# MAGIC         geo_altitude,
# MAGIC         baro_altitude,
# MAGIC         (geo_altitude - baro_altitude) as diff
# MAGIC     from opensky_states_raw
# MAGIC     where baro_altitude is not null and baro_altitude != 0 and geo_altitude is not null
# MAGIC     order by rand()
# MAGIC     limit 2000
# MAGIC     ),
# MAGIC stats as(
# MAGIC     select
# MAGIC         min(diff) as min_ratio,
# MAGIC         percentile_cont(0.25) within group (order by diff) as q1,
# MAGIC         percentile_cont(0.50) within group (order by diff) as median,
# MAGIC         percentile_cont(0.75) within group (order by diff) as q3,
# MAGIC         max(diff) as max_ratio,
# MAGIC         q3 - q1 as iqr
# MAGIC     from base
# MAGIC     )
# MAGIC select
# MAGIC     b.icao24,
# MAGIC     b.geo_altitude,
# MAGIC     b.baro_altitude,
# MAGIC     b.diff,
# MAGIC     case
# MAGIC         when b.diff < s.q1 - 1.5 * s.iqr then true
# MAGIC         when b.diff > s.q3 + 1.5 * s.iqr then true
# MAGIC         else false
# MAGIC     end as outlier
# MAGIC from base b
# MAGIC cross join stats s

# COMMAND ----------

# MAGIC %md
# MAGIC ### Observations
# MAGIC - Relying on (geo / baro) to detect outliers results in systematic false positives for lower altitudes
# MAGIC - (geo - baro) does not suffer from this
# MAGIC
# MAGIC ### Conclusion
# MAGIC - (geo-baro)
# MAGIC - We can label data points as outliers if:
# MAGIC $$ (geo\\_altitude - baro\\_altitude) \notin [Q1 - 1.5\*IQR, Q3 + 1.5\*IQR] $$

# COMMAND ----------

# MAGIC %sql
# MAGIC use intro_to_data_engineering.bronze;
# MAGIC -- Final quick query to get the lower_bound and upper_bound for the diff column, can be used as static thresholds for outlier detection during the ETL process for now
# MAGIC with base as(
# MAGIC     select
# MAGIC         icao24,
# MAGIC         geo_altitude,
# MAGIC         baro_altitude,
# MAGIC         (geo_altitude - baro_altitude) as diff
# MAGIC     from opensky_states_raw
# MAGIC     where baro_altitude is not null and baro_altitude != 0 and geo_altitude is not null
# MAGIC     order by rand()
# MAGIC     limit 2000
# MAGIC     ),
# MAGIC stats as(
# MAGIC     select
# MAGIC         min(diff) as min_ratio,
# MAGIC         percentile_cont(0.25) within group (order by diff) as q1,
# MAGIC         percentile_cont(0.50) within group (order by diff) as median,
# MAGIC         percentile_cont(0.75) within group (order by diff) as q3,
# MAGIC         max(diff) as max_ratio,
# MAGIC         q3 - q1 as iqr
# MAGIC     from base
# MAGIC     )
# MAGIC select
# MAGIC     s.q1 - 1.5 * s.iqr as lower_bound,
# MAGIC     s.q3 + 1.5 * s.iqr as upper_bound
# MAGIC from stats s

# COMMAND ----------

# MAGIC %md
# MAGIC ## X. Enrichment
# MAGIC
# MAGIC ### Map aircraft_category & position_source codes to string values

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC select * from intro_to_data_engineering.bronze.opensky_states_raw states left join intro_to_data_engineering.reference.opensky_aircraft_category category on states.category = category.code left join intro_to_data_engineering.reference.opensky_position_source position_source on states.position_source = position_source.code