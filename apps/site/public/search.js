import { formatNumber } from './common.js';

export function setupSearch({ aircraft, camera, onFilter, onPick }) {
	const search = document.getElementById('search');
	const searchCount = document.getElementById('search-count');
	let query = '';
	let matches = aircraft();
	let matchIndex = -1;

	const matchesQuery = (entry) => [entry.callsign, entry.icao24].some((text) => text?.toLowerCase().includes(query));
	const rank = (entry) => (entry.icao24.toLowerCase() === query ? 0 : Cesium.Cartesian3.distance(camera.positionWC, entry.position));

	function filter() {
		const all = aircraft();
		matches = query ? all.filter(matchesQuery) : all;
		matchIndex = -1;
		onFilter(new Set(matches));
		searchCount.textContent = query ? `${formatNumber(matches.length)} of ${formatNumber(all.length)}` : '';
	}

	search.disabled = false;
	search.addEventListener('input', () => {
		query = search.value.trim().toLowerCase();
		filter();
	});
	document.getElementById('search-form').addEventListener('submit', (event) => {
		event.preventDefault();
		if (!query || !matches.length) {
			return;
		}
		// Ordered on the first Enter, so the list stays put while cycling through it
		if (matchIndex === -1) {
			matches = matches
				.map((entry) => [entry, rank(entry)])
				.sort((a, b) => a[1] - b[1])
				.map(([entry]) => entry);
		}
		matchIndex = (matchIndex + 1) % matches.length;
		onPick(matches[matchIndex]);
	});
	search.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && search.value) {
			event.preventDefault();
			event.stopPropagation();
			search.value = '';
			search.dispatchEvent(new Event('input'));
		}
	});

	return { filter };
}
