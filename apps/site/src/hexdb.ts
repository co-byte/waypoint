// Temporary dynamic calls; this information will be included in the data warehouse later on

import type { Env } from './index';

export class HexdbBusyError extends Error {}

async function fetchHexdb(url: string, name: string, env: Env): Promise<Response | null> {
	const { success } = await env.HEXDB_LIMITER.limit({ key: 'hexdb' });
	if (!success) {
		throw new HexdbBusyError('Too many hexdb.io requests');
	}
	const response = await fetch(url);
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`${name} request failed: ${response.status} ${await response.text()}`);
	}
	return response;
}

export async function fetchAircraftRecord(icao24: string, env: Env): Promise<string | null> {
	const response = await fetchHexdb(`https://hexdb.io/api/v1/aircraft/${icao24}`, 'Aircraft record', env);
	return response && response.text();
}

export async function fetchThumbnail(icao24: string, env: Env): Promise<ReadableStream<Uint8Array> | null> {
	const urlResponse = await fetchHexdb(`https://hexdb.io/hex-image?hex=${icao24}`, 'Aircraft photo URL', env);
	if (!urlResponse) {
		return null;
	}
	const imageResponse = await fetchHexdb(await urlResponse.text(), 'Aircraft photo', env);
	return imageResponse && imageResponse.body;
}
