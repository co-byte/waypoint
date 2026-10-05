import { fetchAircraftRecord, fetchThumbnail } from './hexdb';

export interface Env {
	FLIGHT_CACHE: KVNamespace;
	AI: Ai;
	IMAGES: ImagesBinding;
}

// Written by the flight tracking pipeline after each run
async function handleLatestFlightState(_req: Request, env: Env): Promise<Response> {
	const flightState = await env.FLIGHT_CACHE.get('latest-flight-state');
	if (!flightState) {
		return Response.json({ error: 'Flight state unavailable' }, { status: 503 });
	}
	return new Response(flightState, {
		// The data only changes every few minutes, so a reload within a minute skips the Worker and KV
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
	});
}

const AIRCRAFT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

type KvValue = { text: string; arrayBuffer: ArrayBuffer };

// Nothing is cached when produce returns null, so a missing aircraft is looked up again next time
async function cachedInKv<Type extends keyof KvValue>(
	key: string,
	type: Type,
	produce: () => Promise<KvValue[Type] | null>,
	env: Env,
	ctx: ExecutionContext,
): Promise<KvValue[Type] | null> {
	const cached = (type === 'text' ? await env.FLIGHT_CACHE.get(key, 'text') : await env.FLIGHT_CACHE.get(key, 'arrayBuffer')) as
		KvValue[Type] | null;
	if (cached) {
		return cached;
	}
	const value = await produce();
	if (value) {
		ctx.waitUntil(env.FLIGHT_CACHE.put(key, value, { expirationTtl: AIRCRAFT_CACHE_TTL_SECONDS }));
	}
	return value;
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
	const summary = await cachedInKv(
		`aircraft-summary:${icao24}`,
		'text',
		async () => {
			const record = await fetchAircraftRecord(icao24);
			return record && generateSummary(record, env);
		},
		env,
		ctx,
	);
	if (!summary) {
		return Response.json({ error: 'Unknown aircraft' }, { status: 404 });
	}
	return Response.json({ summary });
}

async function removeBackground(image: ReadableStream<Uint8Array>, env: Env): Promise<ArrayBuffer> {
	const result = await env.IMAGES.input(image)
		.transform({ segment: 'foreground', width: 960, fit: 'scale-down' })
		.transform({ trim: 'border' })
		.output({ format: 'image/webp' }); // Keep transparancy
	return result.response().arrayBuffer();
}

async function handleAircraftThumbnail(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const icao24 = new URL(req.url).searchParams.get('icao24')!;
	const thumbnail = await cachedInKv(
		`aircraft-cutout:${icao24}`,
		'arrayBuffer',
		async () => {
			const image = await fetchThumbnail(icao24);
			return image && removeBackground(image, env);
		},
		env,
		ctx,
	);
	if (!thumbnail) {
		return Response.json({ error: 'No thumbnail' }, { status: 404 });
	}
	return new Response(thumbnail, { headers: { 'Content-Type': 'image/webp' } });
}

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const routes: Record<string, Handler> = {
	'GET /api/latest-flight-state': handleLatestFlightState,
	'GET /api/aircraft-summary': handleAircraftSummary,
	'GET /api/aircraft-thumbnail': handleAircraftThumbnail,
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
