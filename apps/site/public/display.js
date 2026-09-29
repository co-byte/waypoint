const minimumMarkerPixels = 5;
// Leaves room around the aircraft for its marker and details
const inspectLengthPixels = 150;
// Beyond this distance a model is only a few pixels, so markers take over
const modelRangeMeters = 500_000;
// Evaluated by Cesium every frame, so an aircraft is never drawn as both, however stale the loading below is
const modelDisplayRange = new Cesium.DistanceDisplayCondition(0, modelRangeMeters);
// Models start loading a little before they become visible, so they are ready when the camera arrives
const modelLoadRangeMeters = modelRangeMeters * 1.1;
// Shared, so an aircraft does not change color when it switches between a marker and a model
const aircraftColor = Cesium.Color.fromCssColorString('#8a8a86');
// The chevron spans 30 of the image's 38 units of height, the rest is a transparent margin that keeps its edges clear of the image's border
const chevronWidthUnits = 32;
const chevronHeightUnits = 38;
const chevronLengthUnits = 30;
const chevronPixelsPerUnit = minimumMarkerPixels / chevronLengthUnits;
// White, so the color tint gives the exact color; the tip points up, the direction alignedAxis lines up with
// Drawn on a canvas and passed as a PNG URL so all markers share one texture; high resolution, because zooming in scales a marker up tenfold
function createChevronImage() {
	const texelsPerUnit = 4;
	const canvas = document.createElement('canvas');
	canvas.width = chevronWidthUnits * texelsPerUnit;
	canvas.height = chevronHeightUnits * texelsPerUnit;
	const context = canvas.getContext('2d');
	context.scale(texelsPerUnit, texelsPerUnit);
	context.fillStyle = 'white';
	context.beginPath();
	context.moveTo(16, 4);
	context.lineTo(28, 34);
	context.lineTo(16, 26);
	context.lineTo(4, 34);
	context.fill();
	return canvas.toDataURL();
}
const chevronImage = createChevronImage();

function focalLengthPixels(viewer) {
	return viewer.canvas.clientHeight / (2 * Math.tan(viewer.camera.frustum.fovy / 2));
}

export function inspectRange(viewer, aircraft) {
	return (aircraft.model.drawLengthMeters * focalLengthPixels(viewer)) / inspectLengthPixels;
}

function modelMatrix(aircraft) {
	// The models' nose points along -Z, which Cesium turns into -X, so the nose is opposite the frame's forward axis:
	// the heading is measured clockwise from east instead of north, and a climb needs a negative pitch
	const orientation = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(aircraft.heading) + Cesium.Math.PI_OVER_TWO, -aircraft.pitch, 0);
	return Cesium.Transforms.headingPitchRollToFixedFrame(aircraft.position, orientation);
}

export function createDisplay({ viewer, aircraft }) {
	const { scene, camera } = viewer;
	const markers = scene.primitives.add(new Cesium.BillboardCollection());
	const models = new Map();
	const modelFailures = new Set();
	const markerOf = new Map();
	// Null shows every aircraft
	let visible = null;

	const isVisible = (entry) => !visible || visible.has(entry);

	const markerLengthMeters = (entry) => (entry.model.drawLengthMeters * 2) / 3;

	// Like the models, a marker follows perspective at 2/3 of its model, never below the minimum: where the marker in meters shrinks below it,
	// the one in pixels takes over; Cesium evaluates the ranges on the GPU every frame
	function placeMarkerRanges(entry, focalLength) {
		const start = entry.model.file === null || modelFailures.has(entry) ? 0 : modelRangeMeters;
		const minimumSizeDistance = Math.max(start, (markerLengthMeters(entry) * focalLength) / minimumMarkerPixels);
		const { inMeters, inPixels } = markerOf.get(entry);
		inMeters.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(start, minimumSizeDistance);
		inPixels.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(minimumSizeDistance, Number.MAX_VALUE);
	}

	// The switch distances depend on the canvas size, so they only change on a resize
	let rangedFocalLength = null;
	function updateMarkerRanges() {
		const focalLength = focalLengthPixels(viewer);
		if (focalLength === rangedFocalLength) {
			return;
		}
		rangedFocalLength = focalLength;
		aircraft.forEach((entry) => placeMarkerRanges(entry, focalLength));
	}

	function showModel(entry) {
		const { file, drawLengthMeters } = entry.model;
		const model = Cesium.Model.fromGltfAsync({
			id: entry,
			url: `/models/${file}.glb`,
			modelMatrix: modelMatrix(entry),
			scale: drawLengthMeters,
			distanceDisplayCondition: modelDisplayRange,
			minimumPixelSize: 2,
			color: aircraftColor,
			// The default mode multiplies the tint with each model's own tones, so only their lightest parts would get the exact color
			colorBlendMode: Cesium.ColorBlendMode.REPLACE,
			// Thin surfaces such as wings are single-sided and vanish from above otherwise
			backFaceCulling: false,
		}).then(
			(loaded) => {
				loaded.show = isVisible(entry);
				scene.primitives.add(loaded);
				scene.requestRender();
				return loaded;
			},
			(error) => {
				console.error(`Model ${file}.glb failed to load for aircraft ${entry.icao24}`, error);
				modelFailures.add(entry);
				placeMarkerRanges(entry, focalLengthPixels(viewer));
				scene.requestRender();
				return null;
			},
		);
		models.set(entry, model);
	}

	function hideModel(entry) {
		models.get(entry).then((model) => {
			if (model) {
				scene.primitives.remove(model);
			}
		});
		models.delete(entry);
	}

	// Aircraft without a model are always markers, at any distance
	aircraft.forEach((entry) => {
		const heading = Cesium.Math.toRadians(entry.heading);
		// A direction in world space, so the marker keeps pointing along the true heading and climb however the camera turns
		const direction = Cesium.Matrix4.multiplyByPointAsVector(
			Cesium.Transforms.eastNorthUpToFixedFrame(entry.position),
			new Cesium.Cartesian3(Math.sin(heading) * Math.cos(entry.pitch), Math.cos(heading) * Math.cos(entry.pitch), Math.sin(entry.pitch)),
			new Cesium.Cartesian3(),
		);
		const marker = { id: entry, position: entry.position, image: chevronImage, alignedAxis: direction, color: aircraftColor };
		const unitsInMeters = markerLengthMeters(entry) / chevronLengthUnits;
		markerOf.set(entry, {
			inMeters: markers.add({
				...marker,
				sizeInMeters: true,
				height: chevronHeightUnits * unitsInMeters,
				width: chevronWidthUnits * unitsInMeters,
			}),
			inPixels: markers.add({
				...marker,
				height: chevronHeightUnits * chevronPixelsPerUnit,
				width: chevronWidthUnits * chevronPixelsPerUnit,
			}),
		});
	});

	scene.preRender.addEventListener(updateMarkerRanges);

	// Nothing requests a frame when the image finishes loading, so the markers would stay invisible until the camera moves
	const ready = new Promise((resolve) => {
		const removeReadyCheck = scene.preUpdate.addEventListener(() => {
			if (!markers.length || markers.get(0).ready) {
				removeReadyCheck();
				scene.requestRender();
				resolve();
			}
		});
	});
	scene.requestRender();

	const modeled = aircraft.filter((entry) => entry.model.file !== null);
	const updateModels = () => {
		for (const entry of modeled) {
			if (modelFailures.has(entry)) {
				continue;
			}
			const near = Cesium.Cartesian3.distance(camera.positionWC, entry.position) < modelLoadRangeMeters;
			if (near && !models.has(entry)) {
				showModel(entry);
			} else if (!near && models.has(entry)) {
				hideModel(entry);
			}
		}
	};
	camera.percentageChanged = 0.1;
	camera.changed.addEventListener(updateModels);
	camera.moveEnd.addEventListener(updateModels);
	updateModels();

	function show(matched) {
		visible = matched;
		for (const entry of aircraft) {
			const { inMeters, inPixels } = markerOf.get(entry);
			inMeters.show = inPixels.show = isVisible(entry);
			models.get(entry)?.then((model) => {
				if (model) {
					model.show = isVisible(entry);
				}
			});
		}
		scene.requestRender();
	}

	return { ready, show };
}
