import { backgroundColor, fetchJson } from './common.js';

async function loadBasemapStyle(labelScale) {
	const style = await fetchJson('https://tiles.openfreemap.org/styles/dark', 'Basemap style');
	const layer = (id) => style.layers.find((entry) => entry.id === id);
	const setPaint = (id, values) => Object.assign((layer(id).paint ??= {}), values);
	const setLayout = (id, values) => Object.assign((layer(id).layout ??= {}), values);
	const addLayer = (definition, beforeId) =>
		style.layers.splice(
			style.layers.findIndex(({ id }) => id === beforeId),
			0,
			definition,
		);

	// Road labels compete with city names, which matter more when tracking flights
	['highway_name_other', 'highway_name_motorway', 'road_oneway', 'road_oneway_opposite'].forEach((id) =>
		setLayout(id, { visibility: 'none' }),
	);

	// The layer references a pattern that is missing from the style's sprite, so it never draws and MapLibre logs a warning on every load
	setLayout('landcover_wood', { visibility: 'none' });

	// Lifts the stock dark palette a notch
	setPaint('background', { 'background-color': backgroundColor });
	setPaint('water', { 'fill-color': '#262628' });

	// Runways are near-black in the stock style, so they are invisible against the dark basemap
	setPaint('aeroway-runway', { 'line-color': '#a8a8a8' });
	setPaint('aeroway-area', { 'fill-color': '#a8a8a8' });
	setPaint('aeroway-runway-casing', { 'line-color': '#4a4a4a' });
	// The style starts these at zoom 11, but the tiles carry aeroway data from zoom 10
	['aeroway-runway', 'aeroway-runway-casing'].forEach((id) => Object.assign(layer(id), { minzoom: 10, maxzoom: 24 }));

	// The tiles have no runways below zoom 10; to keep major runways visible, they are drawn from runways.geojson, generated from OpenStreetMap data
	style.sources['runways-low-zoom'] = { type: 'geojson', data: new URL('/runways.geojson', location.href).href };
	addLayer(
		{
			id: 'runways-low-zoom',
			type: 'line',
			source: 'runways-low-zoom',
			minzoom: 4,
			maxzoom: 10,
			paint: { 'line-color': '#a8a8a8', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.75, 10, 2] },
		},
		'aeroway-runway',
	);

	// These layers reference an icon that is missing from the style's sprite, so MapLibre logs a console warning for each; clearing it silences that
	['place_town', 'place_city', 'place_city_large'].forEach((id) => setLayout(id, { 'icon-image': '' }));

	// Anything smaller than a city only shows once zoomed in
	const placeMinZoom = { place_state: 6, place_city: 5, place_town: 10, place_village: 12, place_other: 12, place_suburb: 12 };
	style.layers
		.filter(({ id }) => id.startsWith('place_'))
		.forEach(({ id }) => {
			setPaint(id, { 'text-color': '#8a8a8a' });
			if (id in placeMinZoom) {
				layer(id).minzoom = placeMinZoom[id];
			}
		});

	style.sources.hillshade = {
		type: 'raster-dem',
		tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
		// The tiles are 256 pixels, but declaring 512 makes MapLibre fetch one per rendered tile instead of four
		tileSize: 512,
		maxzoom: 15,
		encoding: 'terrarium',
	};
	// Inserted below the waterway, road and label layers so shading never covers them
	addLayer(
		{
			id: 'hillshade',
			type: 'hillshade',
			source: 'hillshade',
			paint: { 'hillshade-exaggeration': 0.4, 'hillshade-highlight-color': '#3d4b5c' },
		},
		'waterway',
	);

	const scaleSize = (size) => {
		if (typeof size === 'number') {
			return size * labelScale;
		}
		if (size[0] === 'interpolate') {
			return size.map((entry, index) => (index >= 4 && index % 2 === 0 ? entry * labelScale : entry));
		}
		throw new Error(`Unsupported size expression: ${JSON.stringify(size)}`);
	};
	style.layers
		.filter(({ type }) => type === 'symbol')
		.forEach((entry) => {
			if (entry.layout?.['text-size'] !== undefined) {
				entry.layout['text-size'] = scaleSize(entry.layout['text-size']);
			}
			if (entry.paint?.['text-halo-width'] !== undefined) {
				entry.paint['text-halo-width'] = scaleSize(entry.paint['text-halo-width']);
			}
		});
	return style;
}

// Cesium only takes raster tiles, so each one is rendered offscreen by MapLibre from the vector style; the pixel ratio of 2 keeps them sharp
class MapLibreImageryProvider extends Cesium.UrlTemplateImageryProvider {
	constructor(maplibregl, style, poolSize, requestRender) {
		// The URL template is required by the parent class, but requestImage never uses it
		super({
			url: '/{z}/{x}/{y}',
			tileWidth: 512,
			tileHeight: 512,
			maximumLevel: 18,
			// OpenFreeMap specifies this wording and requires the links
			credit:
				'Basemap: <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
		});
		this._requestRender = requestRender;
		this._idleMaps = Array.from({ length: poolSize }, () => {
			const container = document.createElement('div');
			container.style.cssText = 'position: fixed; left: -10000px; width: 512px; height: 512px';
			document.body.append(container);
			return new maplibregl.Map({ container, style, interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: 2 });
		});
	}

	requestImage(x, y, level) {
		const map = this._idleMaps.pop();
		// Returning nothing makes Cesium ask again later, nearest tiles first; queueing here would render tiles that have since left the view before the ones in view
		if (!map) {
			return undefined;
		}
		const tileCount = 2 ** level;
		const lng = ((x + 0.5) / tileCount) * 360 - 180;
		const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / tileCount))) * 180) / Math.PI;
		return new Promise((resolve, reject) => {
			// The canvas is copied inside the event, before the browser can clear its drawing buffer; Cesium expects bitmaps already flipped
			map.once('idle', () => createImageBitmap(map.getCanvas(), { imageOrientation: 'flipY' }).then(resolve, reject));
			map.jumpTo({ center: [lng, lat], zoom: level });
			map.triggerRepaint();
		}).finally(() => {
			this._idleMaps.push(map);
			// A finished tile does not draw a frame by itself, and it is the next frame that retries the tiles that were told to wait
			this._requestRender();
		});
	}
}

export function addBasemap(viewer) {
	// Cesium shows a tile at about 512 × maximumScreenSpaceError canvas pixels, so unscaled labels would shrink by the canvas pixel ratio over that
	const labelScale = (window.devicePixelRatio * viewer.resolutionScale) / viewer.scene.globe.maximumScreenSpaceError;
	Promise.all([import('https://cdn.jsdelivr.net/npm/maplibre-gl@6.10.0/dist/maplibre-gl.mjs'), loadBasemapStyle(labelScale)]).then(
		([maplibregl, style]) => {
			// All pooled maps share one worker pool, which MapLibre caps at 3 workers by default
			maplibregl.setWorkerCount(Math.max(Math.floor(navigator.hardwareConcurrency / 2), 1));
			// Each pooled map holds a WebGL context and tile cache next to Cesium's; Chrome loses the least recently used context past 16, and phones run short on memory well before that
			const poolSize = matchMedia('(pointer: coarse)').matches ? 3 : 12;
			viewer.imageryLayers.addImageryProvider(new MapLibreImageryProvider(maplibregl, style, poolSize, () => viewer.scene.requestRender()));
		},
	);
}
