const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');
const RoadGeometry = require('../road-geometry.js');

// Use the same scene and meshes as the game, with only the graphics output stubbed.
const window = {
  RoadGeometry,
  THREE: {...THREE, WebGLRenderer: class {
    setPixelRatio() {}
    setSize() {}
    render() {}
  }}
};
const document = {createElement: () => ({
  getContext: () => ({
    createImageData: (width, height) => ({data:new Uint8ClampedArray(width * height * 4)}),
    putImageData() {}
  })
})};
const file = path.join(__dirname, '..', 'drive-3d.js');
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {window, document, performance});
const drive = new window.DriveScene({getBoundingClientRect: () => ({width:800, height:400})});

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function insideRectangle(p, bounds) {
  return p.x > bounds.min.x && p.x < bounds.max.x && p.z > bounds.min.z && p.z < bounds.max.z;
}

function overlapsRoad(bounds, outline) {
  const corners = [
    {x:bounds.min.x, z:bounds.min.z}, {x:bounds.max.x, z:bounds.min.z},
    {x:bounds.max.x, z:bounds.max.z}, {x:bounds.min.x, z:bounds.max.z}
  ];
  if (corners.some(point => RoadGeometry.containsPoint(outline, point))) return true;
  if (outline.some(point => insideRectangle(point, bounds))) return true;
  return outline.some((a, i) => {
    const b = outline[(i + 1) % outline.length];
    return corners.some((c, j) => {
      const d = corners[(j + 1) % corners.length];
      return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
    });
  });
}

function checkMesh(mesh, outline, stage, count) {
  mesh.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
    matrix.copy(mesh.matrixWorld);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(i, instance);
      matrix.multiply(instance);
    }
    bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
    if (bounds.max.y <= 0) continue; // Under the deck or ground.
    assert.ok(!overlapsRoad(bounds, outline),
      `Stage ${stage}, ${count} exits: ${mesh.geometry.type} at ${bounds.getCenter(new THREE.Vector3()).toArray()} overlaps the road`);
  }
}

for (const stage of [1, 2, 3]) {
  drive.setStage(stage);
  for (const count of [2, 3, 4]) {
    drive.reset(count, {parked:true});
    drive.stageScenery.updateMatrixWorld(true);
    drive.stageScenery.traverseVisible(mesh => {
      if (mesh.isMesh) checkMesh(mesh, drive.road.outline, stage, count);
    });
  }
}
console.log('Above-road scenery stays clear of the 2-, 3- and 4-way road outlines in every stage.');
