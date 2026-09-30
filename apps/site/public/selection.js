import { accentColor } from './common.js';
import { inspectRange } from './display.js';

// Keeps the box visible when the aircraft is only a marker
const minimumBoxPixels = 24;
const boxPaddingPixels = 6;

export function createSelection({ viewer, flight, details }) {
	const { scene, camera } = viewer;
	const selectionBox = document.getElementById('selection-box');
	let selected = null;

	// Points straight down from the selected aircraft, showing what it is flying over
	const groundLine = scene.primitives.add(new Cesium.PolylineCollection()).add({
		show: false,
		width: 2,
		material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString(accentColor) }),
	});

	// A square around the aircraft's position, which is the center of its model; Cesium's bounding sphere of a model is off-center and too small
	function projectBox(aircraft) {
		const radius = aircraft.model.drawLengthMeters / 2;
		const edgePosition = Cesium.Cartesian3.add(
			aircraft.position,
			Cesium.Cartesian3.multiplyByScalar(camera.rightWC, radius, new Cesium.Cartesian3()),
			new Cesium.Cartesian3(),
		);
		const center = Cesium.SceneTransforms.worldToWindowCoordinates(scene, aircraft.position);
		const edge = Cesium.SceneTransforms.worldToWindowCoordinates(scene, edgePosition);
		// Undefined when the point is behind the camera, where no box can be drawn
		if (!center || !edge) {
			return null;
		}
		const side = Math.max(2 * Math.hypot(edge.x - center.x, edge.y - center.y) + 2 * boxPaddingPixels, minimumBoxPixels);
		return { x: center.x - side / 2, y: center.y - side / 2, width: side, height: side };
	}

	scene.postRender.addEventListener(() => {
		const box = selected && projectBox(selected);
		selectionBox.hidden = !box;
		details.place(box);
		if (!box) {
			return;
		}
		selectionBox.style.transform = `translate(${box.x}px, ${box.y}px)`;
		selectionBox.style.width = `${box.width}px`;
		selectionBox.style.height = `${box.height}px`;
	});

	// Also unlocks the camera, so dragging pans again instead of orbiting the aircraft
	function release() {
		selected = null;
		groundLine.show = false;
		scene.requestRender();
		flight.unlock();
	}

	function select(aircraft) {
		const { drawLengthMeters } = aircraft.model;
		const range = inspectRange(viewer, aircraft);
		// A camera locked to another aircraft would fly relative to that frame
		release();
		selected = aircraft;
		// Starting below the center keeps the line from cutting through the model's underside; the drop never goes below the ground
		const drop = Math.min(drawLengthMeters * 0.05, Math.max(aircraft.altitude, 0));
		const { longitude, latitude } = aircraft;
		groundLine.positions = Cesium.Cartesian3.fromDegreesArrayHeights([
			longitude,
			latitude,
			aircraft.altitude - drop,
			longitude,
			latitude,
			0,
		]);
		groundLine.show = true;
		details.show(aircraft, { isCurrent: () => selected === aircraft, onSummary: () => scene.requestRender() });
		// Keeping the current heading and pitch approaches the aircraft along the line of sight instead of snapping to a top view
		flight.flyAround(aircraft, new Cesium.HeadingPitchRange(camera.heading, camera.pitch, range));
	}

	new Cesium.ScreenSpaceEventHandler(viewer.canvas).setInputAction(({ position }) => {
		// Only aircraft carry an id
		const picked = scene.pick(position)?.id;
		if (picked) {
			select(picked);
		} else if (selected) {
			release();
		}
	}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && selected) {
			release();
		}
	});

	return { current: () => selected, select, release };
}
