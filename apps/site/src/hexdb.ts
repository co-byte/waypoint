// Temporary dynamic calls; this information will be included in the data warehouse later on

async function fetchHexdb(url: string, name: string): Promise<Response | null> {
	const response = await fetch(url);
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`${name} request failed: ${response.status} ${await response.text()}`);
	}
	return response;
}

export async function fetchAircraftRecord(icao24: string): Promise<string | null> {
	const response = await fetchHexdb(`https://hexdb.io/api/v1/aircraft/${icao24}`, 'Aircraft record');
	return response && response.text();
}
