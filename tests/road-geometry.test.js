const assert = require('node:assert/strict');
const roadGeometry = require('../road-geometry.js');
const THREE = require('../vendor/three.min.js');

function orientation(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function crosses(a, b, c, d) {
  const x = orientation(a, b, c);
  const y = orientation(a, b, d);
  const z = orientation(c, d, a);
  const w = orientation(c, d, b);
  return x * y < -1e-8 && z * w < -1e-8;
}

for (const count of [2, 3, 4]) {
  const {outline} = roadGeometry.createRoad(count);
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    for (let j = i + 1; j < outline.length; j++) {
      const after = (j + 1) % outline.length;
      if (i === j || next === j || after === i) continue;
      assert.ok(!crosses(outline[i], outline[next], outline[j], outline[after]), `${count} exits: boundary crosses itself at ${i}/${j}`);
    }
  }
  // Check that the renderer's triangulation covers the entire boundary exactly once.
  const shape = new THREE.Shape();
  shape.moveTo(outline[0].x, outline[0].z);
  for (const p of outline.slice(1)) shape.lineTo(p.x, p.z);
  shape.closePath();
  const mesh = new THREE.ShapeGeometry(shape);
  const positions = mesh.getAttribute('position');
  const indices = mesh.getIndex();
  let trianglesArea = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    trianglesArea += Math.abs((positions.getX(b) - positions.getX(a)) * (positions.getY(c) - positions.getY(a)) - (positions.getY(b) - positions.getY(a)) * (positions.getX(c) - positions.getX(a))) / 2;
  }
  let polygonArea = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    polygonArea += a.x * b.z - b.x * a.z;
  }
  polygonArea = Math.abs(polygonArea / 2);
  assert.ok(Math.abs(trianglesArea - polygonArea) < polygonArea * 1e-5, `${count} exits: road triangles leave a gap or overlap`);
  mesh.dispose();
  for (const start of [-60, -35, -12]) {
    for (let index = 0; index < count; index++) {
      const route = roadGeometry.createRoute(count, index, start);
      if (count === 2) {
        const end = roadGeometry.routePoint(route, 1);
        assert.equal(end.x > 0, index === 0, `${count} exits: choice ${index + 1} must end on the matching screen-side branch`);
      }
      for (let sample = 0; sample <= 100; sample++) {
        const t = sample / 100;
        const p = roadGeometry.routePoint(route, t);
        const dir = roadGeometry.routeDirection(route, t);
        for (const offset of [-1.4, 0, 1.4]) {
          for (const along of [-2.5, 0, 2.5]) {
            const carEdge = {x: p.x + dir.z * offset + dir.x * along, z: p.z - dir.x * offset + dir.z * along};
            assert.ok(roadGeometry.containsPoint(outline, carEdge), `${count} exits, choice ${index + 1}, start ${start}, t=${t}, offset=${offset}/${along}: car left pavement at ${JSON.stringify(carEdge)}`);
          }
        }
      }
      const table = roadGeometry.sampleRouteByDistance(route);
      assert.ok(table.length > 0 && table.distances.every((n, i, values) => i === 0 || n > values[i - 1]), 'arc length is strictly increasing');
      const end = roadGeometry.pointAtDistance(table, table.length);
      const expected = roadGeometry.routePoint(route, 1);
      assert.ok(Math.hypot(end.x - expected.x, end.z - expected.z) < 1e-8, 'distance sampling reaches the selected exit');
    }
  }
}
console.log('Roads triangulate without gaps; their outlines do not cross and all car paths stay on the road.');
