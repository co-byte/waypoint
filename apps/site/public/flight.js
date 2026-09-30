export function createFlight(viewer) {
	const { scene, camera } = viewer;

	// Cesium's collision detection does not reliably keep a camera locked to an aircraft above the map, so orbiting a low aircraft could end up below the ground
	const minimumCameraHeightMeters = 5;
	scene.postUpdate.addEventListener(() => {
		// A free camera is kept above the ground by Cesium; only a locked one needs this
		if (
			Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY) ||
			camera.positionCartographic.height >= minimumCameraHeightMeters
		) {
			return;
		}
		const target = Cesium.Matrix4.getTranslation(camera.transform, new Cesium.Cartesian3());
		const range = Cesium.Cartesian3.magnitude(camera.position);
		const targetHeight = Cesium.Cartographic.fromCartesian(target).height;
		// Adjusting the pitch instead of the position keeps the distance to the aircraft, and an aircraft high above the ground can still be viewed from below
		const pitch = -Math.asin(Math.min((minimumCameraHeightMeters - targetHeight) / range, 1));
		camera.lookAt(target, new Cesium.HeadingPitchRange(camera.heading, pitch, range));
		scene.requestRender();
	});

	// Cesium's own default duration (2 to 3 seconds, growing with the distance) made 50% shorter
	function flightDuration(destination) {
		return 0.5 * Math.min(Math.ceil(Cesium.Cartesian3.distance(camera.positionWC, destination) / 1_000_000) + 2, 3);
	}

	function flyAround(aircraft, offset) {
		camera.flyToBoundingSphere(new Cesium.BoundingSphere(aircraft.position), {
			offset,
			// The camera ends up a range away from the aircraft, which is small next to the distance flown
			duration: flightDuration(aircraft.position),
			// Locking the camera to the aircraft makes dragging orbit around it
			complete: () => camera.lookAt(aircraft.position, offset),
		});
	}

	// A camera still flying picks up the new position when it locks on arrival
	function follow(aircraft) {
		if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) {
			const range = Cesium.Cartesian3.magnitude(camera.position);
			camera.lookAt(aircraft.position, new Cesium.HeadingPitchRange(camera.heading, camera.pitch, range));
		}
	}

	function unlock() {
		// A fly-to still in progress would otherwise lock the camera to the aircraft when it lands
		camera.cancelFlight();
		camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
	}

	return { flightDuration, flyAround, follow, unlock };
}
