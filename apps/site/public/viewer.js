import { backgroundColor } from './common.js';

// Straight down with north up, high enough that the whole globe fits with room around it on a landscape screen
export const homeView = { destination: Cesium.Cartesian3.fromDegrees(18.1, 37.5, 25_000_000) };

export function createViewer() {
	const viewer = new Cesium.Viewer('viewer', {
		// The default base layer and terrain need a Cesium ion token; the base layer is added separately
		baseLayer: false,
		animation: false,
		baseLayerPicker: false,
		fullscreenButton: false,
		geocoder: false,
		infoBox: false,
		navigationHelpButton: false,
		sceneModePicker: false,
		selectionIndicator: false,
		timeline: false,
		// Cesium otherwise ignores the display's pixel ratio, so the globe renders at half resolution on high-DPI screens
		useBrowserRecommendedResolution: false,
		// A transparent canvas lets the gradient sky behind it show through
		contextOptions: { webgl: { alpha: true } },
	});
	const { scene, camera } = viewer;
	// The models are CC BY 3.0, which requires crediting the authors
	viewer.creditDisplay.addStaticCredit(
		new Cesium.Credit(
			'Aircraft models: Poly by Google, Silly Fear, Yogoshimo 2.0, Miha Lunar, jeremy, Vojtěch Balák, Eik Røgeberg via Poly Pizza, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank">CC BY 3.0</a>, modified (<a href="/models/CREDITS.md" target="_blank">details</a>)',
		),
	);
	viewer.creditDisplay.addStaticCredit(
		new Cesium.Credit('Flight data: <a href="https://opensky-network.org/" target="_blank">OpenSky Network</a>'),
	);
	viewer.creditDisplay.addStaticCredit(
		new Cesium.Credit('Globe: <a href="https://cesium.com/platform/cesiumjs/" target="_blank">CesiumJS</a>'),
	);
	// The link leads to the full list of elevation datasets the tiles require crediting
	viewer.creditDisplay.addStaticCredit(
		new Cesium.Credit(
			'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Mapzen, AWS Terrain Tiles</a>',
		),
	);
	// The default of 2 picks coarser imagery levels, which then show up magnified and blurry
	scene.globe.maximumScreenSpaceError = 1;
	scene.globe.baseColor = Cesium.Color.fromCssColorString(backgroundColor);
	// Performance: the scene is static most of the time, so frames are only drawn when the camera moves or a tile loads; changes made from code need scene.requestRender()
	scene.requestRenderMode = true;
	scene.globe.showGroundAtmosphere = false;
	scene.skyAtmosphere.show = false;
	scene.skyBox.show = false;
	scene.sun.show = false;
	scene.moon.show = false;
	scene.backgroundColor = Cesium.Color.TRANSPARENT;

	// Right-drag zooms by default; here it tilts and rotates like the map's right-drag did
	Object.assign(scene.screenSpaceCameraController, {
		zoomEventTypes: [
			Cesium.CameraEventType.WHEEL,
			Cesium.CameraEventType.PINCH,
			// Touchpad pinch reaches the page as a wheel event with Ctrl held
			{ eventType: Cesium.CameraEventType.WHEEL, modifier: Cesium.KeyboardEventModifier.CTRL },
		],
		tiltEventTypes: [
			Cesium.CameraEventType.RIGHT_DRAG,
			Cesium.CameraEventType.MIDDLE_DRAG,
			Cesium.CameraEventType.PINCH,
			{ eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
		],
	});

	// Testing showed touchpads require higher sensitivity than mouse scrolls
	viewer.canvas.addEventListener('wheel', (event) => {
		const mouseWheel = !event.ctrlKey && (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(event.deltaY) >= 100);
		scene.screenSpaceCameraController.zoomFactor = mouseWheel ? 5 : 12.5;
	});

	camera.setView(homeView);
	return viewer;
}
