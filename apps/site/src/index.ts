/**
 * Welcome to Cloudflare Workers!
 *
 *
 * - Run `npm run dev` to start a development server
 * - Run `npm run deploy` to publish the Worker
 *
 * Bind resources to the Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Secrets Store bindings (see `secrets_store_secrets` in wrangler.jsonc)
	DATABRICKS_ACCOUNT_ID: SecretsStoreSecret; // part of the OAuth token endpoint URL
	DATABRICKS_DEPLOYMENT_NAME: SecretsStoreSecret; // subdomain of the workspace URL: <deployment name>.cloud.databricks.com
	DATABRICKS_WAREHOUSE_ID: SecretsStoreSecret;
	DATABRICKS_CLIENT_ID: SecretsStoreSecret;
	DATABRICKS_CLIENT_SECRET: SecretsStoreSecret;
	FLIGHT_CACHE: KVNamespace;
	AI: Ai;
	FLIGHT_CACHE_TTL_SECONDS: number;
}

interface DatabricksAuthConfig {
	tokenEndpointUrl: string;
	clientId: string;
	clientSecret: string;
}

interface DatabricksSqlConfig {
	serverHostname: string;
	warehouseId: string;
}

interface DatabricksQueryResult {
	statement_id: string;
	status: { state: string };
	manifest?: {
		schema?: {
			columns?: { name: string; type_name?: string }[];
		};
	};
	result?: {
		data_array?: unknown[][];
		[key: string]: unknown;
	};
}

async function loadConfig(env: Env): Promise<{
	auth: DatabricksAuthConfig;
	sql: DatabricksSqlConfig;
}> {
	const required = (value: string | undefined, name: string): string => {
		if (!value) {
			throw new Error(`Missing required environment variable: ${name}`);
		}
		return value;
	};

	const accountId = required(await env.DATABRICKS_ACCOUNT_ID.get(), 'DATABRICKS_ACCOUNT_ID');
	const deploymentName = required(await env.DATABRICKS_DEPLOYMENT_NAME.get(), 'DATABRICKS_DEPLOYMENT_NAME');

	return {
		auth: {
			tokenEndpointUrl: `https://accounts.cloud.databricks.com/oidc/accounts/${accountId}/v1/token`,
			clientId: required(await env.DATABRICKS_CLIENT_ID.get(), 'DATABRICKS_CLIENT_ID'),
			clientSecret: required(await env.DATABRICKS_CLIENT_SECRET.get(), 'DATABRICKS_CLIENT_SECRET'),
		},
		sql: {
			serverHostname: `${deploymentName}.cloud.databricks.com`,
			warehouseId: required(await env.DATABRICKS_WAREHOUSE_ID.get(), 'DATABRICKS_WAREHOUSE_ID'),
		},
	};
}

async function getAccessToken(auth: DatabricksAuthConfig): Promise<string> {
	const response = await fetch(auth.tokenEndpointUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: 'Basic ' + btoa(`${auth.clientId}:${auth.clientSecret}`),
		},
		body: 'grant_type=client_credentials&scope=sql',
	});

	if (!response.ok) {
		throw new Error(`Access token request failed: ${response.status} ${await response.text()}`);
	}

	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

async function runQuery(sql: DatabricksSqlConfig, accessToken: string, sqlText: string): Promise<DatabricksQueryResult> {
	const response = await fetch(`https://${sql.serverHostname}/api/2.0/sql/statements`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			warehouse_id: sql.warehouseId,
			statement: sqlText,
			wait_timeout: '30s',
		}),
	});

	if (!response.ok) {
		throw new Error(`Query run request failed: ${response.status} ${await response.text()}`);
	}

	return (await response.json()) as DatabricksQueryResult;
}

async function fetchLatestFlightState(env: Env): Promise<DatabricksQueryResult> {
	const { auth, sql } = await loadConfig(env);
	const accessToken = await getAccessToken(auth);
	return runQuery(
		sql,
		accessToken,
		'SELECT longitude, latitude, geo_altitude, category, true_track, vertical_rate, velocity, icao24, callsign FROM waypoint_catalog.gold.recent_flight_state',
	);
}

async function getLatestFlightStateJson(env: Env, ctx: ExecutionContext): Promise<string> {
	const key = 'latest-flight-state';
	const cached = await env.FLIGHT_CACHE.get(key);
	if (cached) {
		return cached;
	}

	const json = JSON.stringify(await fetchLatestFlightState(env));
	ctx.waitUntil(env.FLIGHT_CACHE.put(key, json, { expirationTtl: env.FLIGHT_CACHE_TTL_SECONDS }));
	return json;
}

const AIRCRAFT_SUMMARY_TTL_SECONDS = 7 * 24 * 60 * 60;

// Temporary dynamic call; this information will be included in the data warehouse later on
async function fetchAircraftRecord(icao24: string): Promise<string | null> {
	const response = await fetch(`https://hexdb.io/api/v1/aircraft/${icao24}`);
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Aircraft record request failed: ${response.status} ${await response.text()}`);
	}
	return response.text();
}

async function generateSummary(record: string, env: Env): Promise<string> {
	const { response } = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
		messages: [
			{
				role: 'system',
				content: `You write a short description of an aircraft for the details panel of a flight tracker, from a hexdb.io aircraft record.
- At most two sentences of plain English, saying what the aircraft is: the type and manufacturer, and what it is typically used for.
- Use the common name of the type, not the record's variant suffixes.
- Mention the operator only if it tells the reader something, such as an airline, an air force or a company; say nothing about a private owner.
- Do not repeat the registration or any code; the reader already sees them or cannot use them.
- Only state what you are sure of about the aircraft type. Give no numbers such as seats, range or speed. If you do not recognize the type, say only what the record states.`,
			},
			{ role: 'user', content: record },
		],
		max_tokens: 80,
	})) as { response: string };
	return response;
}

async function handleAircraftSummary(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const icao24 = new URL(req.url).searchParams.get('icao24')!;
	const key = `aircraft-summary:${icao24}`;
	let summary = await env.FLIGHT_CACHE.get(key);
	if (!summary) {
		const record = await fetchAircraftRecord(icao24);
		if (!record) {
			return Response.json({ error: 'Unknown aircraft' }, { status: 404 });
		}
		summary = await generateSummary(record, env);
		ctx.waitUntil(env.FLIGHT_CACHE.put(key, summary, { expirationTtl: AIRCRAFT_SUMMARY_TTL_SECONDS }));
	}
	return Response.json({ summary });
}

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const routes: Record<string, Handler> = {
	'GET /api/latest-flight-state': async (_req, env, ctx) =>
		new Response(await getLatestFlightStateJson(env, ctx), { headers: { 'Content-Type': 'application/json' } }),
	'GET /api/aircraft-summary': handleAircraftSummary,
};

export default {
	async fetch(req, env, ctx): Promise<Response> {
		const handler = routes[`${req.method} ${new URL(req.url).pathname}`];
		if (!handler) {
			return Response.json({ error: 'Not found' }, { status: 404 });
		}

		return handler(req, env, ctx);
	},
} satisfies ExportedHandler<Env>;
