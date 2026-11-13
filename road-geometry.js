/* Ground-plane road boundaries and the paths driven through them, in world units. */
(function (root, factory) {
  const geometry = factory();
  if (typeof module === 'object' && module.exports) module.exports = geometry;
  else root.RoadGeometry = geometry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HALF_ROAD = 6;
  const FAR_Z = 74;
  const BRANCH_X = { 2: [-57, 57], 3: [-66, 0, 66], 4: [-72, -24, 24, 72] };
  const point = (x, z) => ({x, z});
  const lerp = (a, b, t) => a + (b - a) * t;

  function cubic(a, b, c, d, t) {
    const u = 1 - t;
    return point(
      u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z
    );
  }

  function appendCurve(points, a, b, c, d, steps = 24) {
    for (let i = 1; i <= steps; i++) points.push(cubic(a, b, c, d, i / steps));
  }

  function twoWayOutline() {
    // A single boundary, followed from the incoming road around both exits.
    // Each rounded transition shares its endpoints with the adjacent road edge.
    const points = [point(-HALF_ROAD, -160), point(-HALF_ROAD, -10)];
    appendCurve(points, point(-6, -10), point(-6, -2), point(-10, 3), point(-15, 8));
    points.push(point(-195, 188), point(-186.515, 196.485), point(-6.515, 16.485));
    appendCurve(points, point(-6.515, 16.485), point(-3, 13), point(-2.8, 9), point(0, 9));
    appendCurve(points, point(0, 9), point(2.8, 9), point(3, 13), point(6.515, 16.485));
    points.push(point(186.515, 196.485), point(195, 188), point(15, 8));
    appendCurve(points, point(15, 8), point(10, 3), point(6, -2), point(6, -10));
    points.push(point(HALF_ROAD, -160));
    return points;
  }

  function multiWayOutline(count) {
    const exits = BRANCH_X[count];
    const left = exits[0];
    const right = exits[exits.length - 1];
    const points = [point(-6, -160), point(-6, -10)];
    appendCurve(points, point(-6, -10), point(-6, 9), point(left - 6, 46), point(left - 6, FAR_Z), 40);
    for (let i = 0; i < exits.length; i++) {
      points.push(point(exits[i] - 6, 190), point(exits[i] + 6, 190));
      points.push(point(exits[i] + 6, FAR_Z));
      if (i === exits.length - 1) break;
      const next = exits[i + 1];
      const valleyX = (exits[i] + next) * .25;
      const start = point(exits[i] + 6, FAR_Z);
      const bottom = point(valleyX, 35);
      const end = point(next - 6, FAR_Z);
      appendCurve(points, start, point(start.x, 54), point(valleyX - 5, 35), bottom, 28);
      appendCurve(points, bottom, point(valleyX + 5, 35), point(end.x, 54), end, 28);
    }
    appendCurve(points, point(right + 6, FAR_Z), point(right + 6, 46), point(6, 9), point(6, -10), 40);
    points.push(point(6, -160));
    return points;
  }

  function createRoad(count) {
    if (!BRANCH_X[count]) throw new RangeError('choice count must be 2, 3 or 4');
    return {count, outline: count === 2 ? twoWayOutline() : multiWayOutline(count), exits: BRANCH_X[count].slice()};
  }

  function createRoute(count, index, startZ) {
    const exits = BRANCH_X[count];
    if (!exits || !Number.isInteger(index) || index < 0 || index >= exits.length) throw new RangeError('invalid branch');
    // Three.js' forward-facing camera presents +X on the screen's left.
    // Keep choice index order semantic: choice 0 is always the left-hand exit.
    const worldExit = exits[exits.length - 1 - index];
    const finish = count === 2 ? point(worldExit * .67, 41) : point(worldExit * .94, 61);
    const start = point(0, Math.min(-10, startZ));
    const bendStart = point(0, -10);
    const controls = [bendStart, point(0, 1), point(finish.x * (count === 2 ? .55 : .8), finish.z - 19), finish];
    const straightPortion = Math.max(0, (bendStart.z - start.z) / ((bendStart.z - start.z) + finish.z + 24));
    return {count, index, start, controls, straightPortion};
  }

  function routePoint(route, t) {
    const progress = Math.max(0, Math.min(1, t));
    if (progress < route.straightPortion) return point(0, lerp(route.start.z, -10, progress / route.straightPortion));
    return cubic(...route.controls, (progress - route.straightPortion) / (1 - route.straightPortion));
  }

  function routeDirection(route, t) {
    const a = routePoint(route, Math.max(0, t - .002));
    const b = routePoint(route, Math.min(1, t + .002));
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return point((b.x - a.x) / length, (b.z - a.z) / length);
  }

  function containsPoint(outline, target) {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i];
      const b = outline[j];
      if ((a.z > target.z) !== (b.z > target.z) && target.x < (b.x - a.x) * (target.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  function sampleRouteByDistance(route, samples = 180) {
    const points = [routePoint(route, 0)];
    const distances = [0];
    for (let i = 1; i <= samples; i++) {
      const next = routePoint(route, i / samples);
      const previous = points[i - 1];
      points.push(next);
      distances.push(distances[i - 1] + Math.hypot(next.x - previous.x, next.z - previous.z));
    }
    return {points, distances, length: distances[distances.length - 1]};
  }

  function pointAtDistance(table, distance) {
    const target = Math.max(0, Math.min(table.length, distance));
    let low = 0;
    let high = table.distances.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (table.distances[middle] < target) low = middle;
      else high = middle;
    }
    const fraction = (target - table.distances[low]) / (table.distances[high] - table.distances[low] || 1);
    return point(lerp(table.points[low].x, table.points[high].x, fraction), lerp(table.points[low].z, table.points[high].z, fraction));
  }

  return {createRoad, createRoute, routePoint, routeDirection, containsPoint, sampleRouteByDistance, pointAtDistance};
});
