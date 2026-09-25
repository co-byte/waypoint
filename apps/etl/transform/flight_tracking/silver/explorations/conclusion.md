%md
# Findings in raw opensky data

## Field-level constraints
- $$ icao24 != null \land len(icao24) = 6 $$
- $$ callsign != null \land len(callsign) = 0 \lor len(callsign) = 8 $$
- $$ origin\\_country $$

- $$ true\\_track != null \land true\\_track \in [0, 360] $$
- $$ squawk \in [0000, 7777] $$

## Functional dependencies
- $$ icao24 \mapsto origin\\_country $$
- $$ icao24 \mapsto category $$
- $$ baro\\_altitude \mapsto on\\_ground $$