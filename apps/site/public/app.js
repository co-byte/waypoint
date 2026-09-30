import { fetchAircraft, mergeAircraft } from './aircraft.js';
import { addBasemap } from './basemap.js';
import { setupControls } from './controls.js';
import { createDetails } from './details.js';
import { createDisplay } from './display.js';
import { createFlight } from './flight.js';
import { createSelection } from './selection.js';
import { setupSearch } from './search.js';
import { createViewer } from './viewer.js';

const viewer = createViewer();
addBasemap(viewer);
const flight = createFlight(viewer);
const selection = createSelection({ viewer, flight, details: createDetails() });
setupControls({ viewer, flight, selection });

// The pipeline pushes new data every few minutes at no fixed time, so polling every minute shows it soon after it lands
const refreshIntervalMs = 60_000;

// A hidden tab needs no updates, so it catches up once it is shown again
function keepRefreshing(onAircraft) {
	let fetchedAt = Date.now();
	const refresh = () => {
		fetchedAt = Date.now();
		fetchAircraft().then(onAircraft, console.error);
	};
	setInterval(() => {
		if (!document.hidden) {
			refresh();
		}
	}, refreshIntervalMs);
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && Date.now() - fetchedAt >= refreshIntervalMs) {
			refresh();
		}
	});
}

const loading = document.getElementById('loading');
fetchAircraft().then(
	(aircraft) => {
		const display = createDisplay({ viewer, aircraft });
		display.ready.then(() => {
			loading.hidden = true;
		});
		const search = setupSearch({
			aircraft: display.aircraft,
			camera: viewer.camera,
			onFilter: (matched) => {
				display.show(matched);
				if (selection.current() && !matched.has(selection.current())) {
					selection.release();
				}
			},
			onPick: selection.select,
		});
		keepRefreshing((fresh) => {
			display.update(mergeAircraft(display.aircraft(), fresh));
			search.filter();
			selection.refresh();
		});
	},
	(error) => {
		// Only the fetch is handled here: a failure while setting up the scene must not claim the data is unavailable
		// A spinner that never ends would claim the aircraft are still on their way
		loading.hidden = true;
		document.getElementById('feed-error').hidden = false;
		throw error;
	},
);
