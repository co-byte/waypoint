import json

import requests
from pyspark import pipelines as dp

LAST_KNOWN_FLIGHT_STATE = f"{spark.conf.get('gold_schema')}.{spark.conf.get('last_known_flight_state_table')}"
RECENT_FLIGHT_STATE = f"{spark.conf.get('gold_schema')}.recent_flight_state"
COLUMNS = ["longitude", "latitude", "geo_altitude", "category", "true_track", "vertical_rate", "velocity", "icao24", "callsign"]

# Read by the site's Worker
KV_KEY = "latest-flight-state"
# Matches the window of the recent flight state, so the site stops showing aircraft once the pipeline stops pushing
KV_EXPIRATION_TTL_SECONDS = 60 * 60

# Credentials, read from the "cloudflare" secret scope.
ACCOUNT_ID = dbutils.secrets.get(scope="cloudflare", key="ACCOUNT_ID")
KV_API_TOKEN = dbutils.secrets.get(scope="cloudflare", key="KV_API_TOKEN")
KV_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces/"
    f"{spark.conf.get('flight_cache_kv_namespace_id')}/values/{KV_KEY}"
)


@dp.foreach_batch_sink(name="cloudflare_kv")
def push_flight_state(changes, batch_id):
    """Replaces the site's copy with the full recent flight state, whatever changed."""
    rows = changes.sparkSession.read.table(RECENT_FLIGHT_STATE).select(*COLUMNS).collect()
    response = requests.put(
        KV_URL,
        params={"expiration_ttl": KV_EXPIRATION_TTL_SECONDS},
        headers={"Authorization": f"Bearer {KV_API_TOKEN}"},
        data=json.dumps({"columns": COLUMNS, "rows": [list(row) for row in rows]}),
    )
    response.raise_for_status()


# Streaming the gold table's changes runs the push after the gold table is updated, in the same pipeline update
@dp.append_flow(target="cloudflare_kv")
def last_known_flight_state_changes():
    return spark.readStream.option("readChangeFeed", "true").table(LAST_KNOWN_FLIGHT_STATE)
