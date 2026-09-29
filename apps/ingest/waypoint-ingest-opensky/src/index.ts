async function assertOk(response: Response, action: string): Promise<void> {
	if (!response.ok) {
		throw new Error(`${action} failed: ${response.status} ${await response.text()}`);
	}
}

interface OpenSkyConfig {
	tokenUrl: string;
	statesUrl: string;
	clientId: string;
	clientSecret: string;
	requestTimeoutMs: number;
}

async function fetchOpenSkyAccessToken(config: OpenSkyConfig): Promise<string> {
	const response = await fetch(config.tokenUrl, {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: config.clientId,
			client_secret: config.clientSecret,
		}),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	});
	await assertOk(response, 'OpenSky token request');
	const { access_token } = await response.json<{ access_token?: unknown }>();
	if (typeof access_token !== 'string') {
		throw new Error('OpenSky token response missing access_token');
	}
	return access_token;
}

async function fetchStateVectors(config: OpenSkyConfig, accessToken: string): Promise<string> {
	const response = await fetch(config.statesUrl, {
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	});
	await assertOk(response, 'OpenSky states request');
	return response.text();
}

export default {
	async scheduled(_controller, env): Promise<void> {
		const openSkyConfig: OpenSkyConfig = {
			tokenUrl: env.OPENSKY_TOKEN_URL,
			statesUrl: env.OPENSKY_STATES_URL,
			clientId: await env.OPENSKY_CLIENT_ID.get(),
			clientSecret: await env.OPENSKY_CLIENT_SECRET.get(),
			requestTimeoutMs: env.OPENSKY_REQUEST_TIMEOUT_MS,
		};
		const accessToken = await fetchOpenSkyAccessToken(openSkyConfig);
		console.log(await fetchStateVectors(openSkyConfig, accessToken));
	},
} satisfies ExportedHandler<Env>;
