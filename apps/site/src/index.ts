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
	FLIGHT_CACHE: KVNamespace;
	AI: Ai;
}

// Written by the flight tracking pipeline after each run
async function handleLatestFlightState(_req: Request, env: Env): Promise<Response> {
	const flightState = await env.FLIGHT_CACHE.get('latest-flight-state');
	if (!flightState) {
		return Response.json({ error: 'Flight state unavailable' }, { status: 503 });
	}
	return new Response(flightState, { headers: { 'Content-Type': 'application/json' } });
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
	'GET /api/latest-flight-state': handleLatestFlightState,
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
