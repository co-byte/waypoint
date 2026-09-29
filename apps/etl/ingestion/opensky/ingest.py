import time
from datetime import datetime, timedelta, timezone

import requests
from pyspark import pipelines as dp
from pyspark.sql import functions as F
from pyspark.sql.datasource import DataSource, SimpleDataSourceStreamReader
from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    DoubleType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
)

# Static schema - source: https://openskynetwork.github.io/opensky-api/rest.html#own-state-vectors
SCHEMA = StructType(
    [
        StructField("icao24", StringType()),
        StructField("callsign", StringType()),
        StructField("origin_country", StringType()),
        StructField("time_position", LongType()),
        StructField("last_contact", LongType()),
        StructField("longitude", DoubleType()),
        StructField("latitude", DoubleType()),
        StructField("baro_altitude", DoubleType()),
        StructField("on_ground", BooleanType()),
        StructField("velocity", DoubleType()),
        StructField("true_track", DoubleType()),
        StructField("vertical_rate", DoubleType()),
        StructField("sensors", ArrayType(LongType())),
        StructField("geo_altitude", DoubleType()),
        StructField("squawk", StringType()),
        StructField("spi", BooleanType()),
        StructField("position_source", IntegerType()),
        StructField("category", IntegerType()),
    ]
)

# How many seconds before expiry to proactively refresh the token.
TOKEN_REFRESH_MARGIN = 30



class OpenSkyAccessToken:
    """
    OAuth2 client-credentials token, adapted from https://openskynetwork.github.io/opensky-api/rest.html#authentication
    """

    def __init__(self, token_url: str, client_id: str, client_secret: str):
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._token = None
        self._expires_at = None

    def __str__(self):
        if self._token and self._expires_at and datetime.now(timezone.utc) < self._expires_at:
            return self._token
        return self._refresh()

    def _refresh(self):
        """Fetch a new access token from the OpenSky authentication server."""
        r = requests.post(
            self._token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
        )
        r.raise_for_status()

        data = r.json()
        self._token = data["access_token"]
        expires_in = data.get("expires_in", 1800)
        self._expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=expires_in - TOKEN_REFRESH_MARGIN
        )
        return self._token



class OpenSkyDataSourceStreamReader(SimpleDataSourceStreamReader):
    """Each micro-batch is one live snapshot, which the API can't serve again, so a replayed batch is skipped."""

    def __init__(self, options: dict):
        self.token_url = options["token_url"]
        self.client_id = options["client_id"]
        self.client_secret = options["client_secret"]

    def initialOffset(self):
        return {"fetched_at": 0}

    def read(self, start):
        return self.fetch_states(), {"fetched_at": int(time.time())}

    def readBetweenOffsets(self, start, end):
        return iter([])

    def fetch_states(self):
        access_token = OpenSkyAccessToken(self.token_url, self.client_id, self.client_secret)
        response = requests.get(
            "https://opensky-network.org/api/states/all",
            params={ "extended": 1},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        states = response.json().get("states", [])

        return [tuple(state[: len(SCHEMA)]) for state in states]


class OpenSkyDataSource(DataSource):
    """
    A Databricks/Spark Data Source exposing OpenSky state vectors for a
    bounding box as `spark.readStream.format("opensky")`.

    Options:
        token_url: OAuth2 token endpoint.
        client_id / client_secret: OAuth2 client-credentials.
        lamin / lamax / lomin / lomax: bounding box, decimal degrees.
    """

    @classmethod
    def name(cls):
        return "opensky"

    def schema(self):
        return SCHEMA

    def simpleStreamReader(self, schema):
        return OpenSkyDataSourceStreamReader(self.options)


spark.dataSource.register(OpenSkyDataSource)

OPENSKY_STATE_VECTORS_TABLE = f"{spark.conf.get('bronze_schema')}.{spark.conf.get('opensky_state_vectors_table')}"

# Credentials, read from the "opensky" secret scope.
CLIENT_ID = dbutils.secrets.get(scope="opensky", key="CLIENT_USER")
CLIENT_SECRET = dbutils.secrets.get(scope="opensky", key="CLIENT_SECRET")

# The live API can't backfill, so a full refresh must never truncate this table.
dp.create_streaming_table(
    name=OPENSKY_STATE_VECTORS_TABLE,
    table_properties={"pipelines.reset.allowed": "false"},
)


@dp.append_flow(target=OPENSKY_STATE_VECTORS_TABLE)
def ingest_opensky_state_vectors():
    return (
        spark.readStream.format("opensky")
        .option("token_url", spark.conf.get("opensky_token_url"))
        .option("client_id", CLIENT_ID)
        .option("client_secret", CLIENT_SECRET)
        .load()
        .withColumn("ingested_at", F.current_timestamp())
    )


@dp.append_flow(target=OPENSKY_STATE_VECTORS_TABLE, once=True)
def backfill_legacy_opensky_state_vectors():
    return spark.read.table(f"{OPENSKY_STATE_VECTORS_TABLE}_legacy")
