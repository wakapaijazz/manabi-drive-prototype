/* The road, car and camera share the same 3D world coordinates. */
(function (root) {
  'use strict';

  const THREE = root.THREE;
  const G = root.RoadGeometry;
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
  const damp = (speed, dt) => 1 - Math.exp(-speed * dt);
  const DEFAULT_VEHICLE = {id:'blue-racer', style:'racer', body:0x1477d4, trim:0x122840, glass:0x60c9e6};

  function makeAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(128, 128);
    let seed = 2171;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 222 + (seed % 25) - 12;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(.12, .12);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  class DriveScene {
    constructor(canvas) {
      if (!THREE || !G) throw new Error('3D renderer dependencies could not be loaded');
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.7));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x91caef);
      this.scene.fog = new THREE.Fog(0xafd9ec, 105, 230);
      this.camera = new THREE.PerspectiveCamera(52, 1, .1, 400);
      this.camera.up.set(0, 1, 0);
      this.lookTarget = new THREE.Vector3();
      this.forward = new THREE.Vector3(0, 0, 1);
      this.time = 0;
      this.travelSpeed = 0;
      this.boost = 0;
      this.debugTopDown = false;
      this.vehicle = {...DEFAULT_VEHICLE};
      this.materials = {
        road: new THREE.MeshStandardMaterial({color: 0x465155, map: makeAsphaltTexture(), roughness: .98, side: THREE.DoubleSide}),
        edge: new THREE.MeshBasicMaterial({color: 0xe8d6a3, side: THREE.DoubleSide}),
        marking: new THREE.MeshBasicMaterial({color: 0xe8ede3, side: THREE.DoubleSide}),
        blue: new THREE.MeshStandardMaterial({color: 0x1477d4, metalness: .35, roughness: .32}),
        trim: new THREE.MeshStandardMaterial({color: 0x122840, metalness: .22, roughness: .48}),
        glass: new THREE.MeshStandardMaterial({color: 0x60c9e6, metalness: .35, roughness: .2}),
        rubber: new THREE.MeshStandardMaterial({color: 0x181d23, roughness: .95}),
        wheel: new THREE.MeshStandardMaterial({color: 0x95a7b0, metalness: .65, roughness: .3}),
        light: new THREE.MeshBasicMaterial({color: 0xff6061})
      };
      this.setupEnvironment();
      this.applyVehiclePalette(this.vehicle);
      this.createCar(this.vehicle);
      this.roadGroup = null;
      this.resize();
      this.reset(2);
    }

    setupEnvironment() {
      this.scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x50653d, 2.1));
      const sun = new THREE.DirectionalLight(0xfff5dd, 2.1);
      sun.position.set(-35, 80, -20);
      this.scene.add(sun);

      const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(700, 700),
        new THREE.MeshStandardMaterial({color: 0x60a95f, roughness: 1})
      );
      grass.rotation.x = -Math.PI / 2;
      grass.position.y = -.04;
      this.scene.add(grass);

      // Fixed scenery remains in world space while the camera moves through it.
      this.scenery = new THREE.Group();
      this.scene.add(this.scenery);
      const trunkMaterial = new THREE.MeshStandardMaterial({color: 0x7e6246, roughness: 1});
      const leafMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1});
      const treeGeometry = new THREE.ConeGeometry(2.1, 5.2, 7);
      const trunkGeometry = new THREE.CylinderGeometry(.35, .5, 2.2, 6);
      this.treeTrunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 62);
      this.treeLeaves = new THREE.InstancedMesh(treeGeometry, leafMaterial, 62);
      this.treeTrunks.frustumCulled = false;
      this.treeLeaves.frustumCulled = false;
      this.treeTrunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.treeLeaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.trees = [];
      for (let i = 0; i < 62; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -145 + Math.floor(i / 2) * 9.4;
        const x = side * (20 + ((i * 47) % 27));
        this.trees.push({x, z});
        this.treeLeaves.setColorAt(i, new THREE.Color([0x38815d, 0x478c57, 0x5c9d58][i % 3]));
      }
      this.scenery.add(this.treeTrunks, this.treeLeaves);
      const hillMat = new THREE.MeshStandardMaterial({color: 0x76b884, roughness: 1});
      for (let i = 0; i < 7; i++) {
        const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), hillMat);
        hill.scale.set(26 + i % 3 * 8, 8 + i % 2 * 5, 20);
        hill.position.set((i - 3) * 45, -2, 190 + i % 2 * 15);
        this.scene.add(hill);
      }
    }

    applyVehiclePalette(vehicle) {
      this.materials.blue.color.setHex(vehicle.body ?? DEFAULT_VEHICLE.body);
      this.materials.trim.color.setHex(vehicle.trim ?? DEFAULT_VEHICLE.trim);
      this.materials.glass.color.setHex(vehicle.glass ?? DEFAULT_VEHICLE.glass);
    }

    disposeCar(car) {
      if (!car) return;
      car.traverse(object => {
        if (object.geometry) object.geometry.dispose();
      });
    }

    setVehicle(vehicle = DEFAULT_VEHICLE) {
      const next = {...DEFAULT_VEHICLE, ...vehicle};
      if (this.car && this.vehicle.id === next.id) return;
      const position = this.car ? this.car.position.clone() : null;
      const rotation = this.car ? this.car.rotation.clone() : null;
      const chassisRotation = this.chassis ? this.chassis.rotation.clone() : null;
      if (this.car) {
        this.scene.remove(this.car);
        this.disposeCar(this.car);
      }
      this.vehicle = next;
      this.applyVehiclePalette(next);
      this.createCar(next);
      if (position) this.car.position.copy(position);
      if (rotation) this.car.rotation.copy(rotation);
      if (chassisRotation) this.chassis.rotation.copy(chassisRotation);
    }

    createCar(vehicle = this.vehicle || DEFAULT_VEHICLE) {
      const car = new THREE.Group();
      const chassis = new THREE.Group();
      car.add(chassis);
      this.car = car;
      this.chassis = chassis;
      this.wheels = [];
      this.frontPivots = [];

      const addWheel = (x, z, radius, front = z > 0) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, radius, z);
        const wheel = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .42, 18), this.materials.rubber);
        tire.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .46, radius * .46, .45, 16), this.materials.wheel);
        hub.rotation.z = Math.PI / 2;
        wheel.add(tire, hub);
        pivot.add(wheel);
        chassis.add(pivot);
        this.wheels.push(wheel);
        if (front) this.frontPivots.push(pivot);
      };

      if (vehicle.style === 'bike') {
        const body = new THREE.Mesh(new THREE.SphereGeometry(.76, 18, 12), this.materials.blue);
        body.scale.set(.57, .42, 1.55);
        body.position.y = .86;
        chassis.add(body);
        const tank = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 10), this.materials.blue);
        tank.scale.set(.62, .42, 1.05);
        tank.position.set(0, 1.02, .35);
        chassis.add(tank);
        const windshield = new THREE.Mesh(new THREE.SphereGeometry(.45, 16, 10), this.materials.glass);
        windshield.scale.set(.52, .58, .8);
        windshield.position.set(0, 1.18, .72);
        chassis.add(windshield);
        const handlebar = new THREE.Mesh(new THREE.BoxGeometry(1.15, .08, .08), this.materials.trim);
        handlebar.position.set(0, 1.24, 1.12);
        chassis.add(handlebar);
        addWheel(0, -1.3, .58, false);
        addWheel(0, 1.3, .58, true);
        const headlight = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), this.materials.light);
        headlight.position.set(0, 1.28, 1.48);
        chassis.add(headlight);
      } else if (vehicle.style === 'truck') {
        const lower = new THREE.Mesh(new THREE.BoxGeometry(2.35, .58, 4.25), this.materials.blue);
        lower.position.set(0, .63, -.15);
        chassis.add(lower);
        const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.38, 2.18), this.materials.blue);
        cargo.position.set(0, 1.35, -1.05);
        chassis.add(cargo);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.08, 1.2, 1.55), this.materials.blue);
        cab.position.set(0, 1.24, .82);
        chassis.add(cab);
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, .44, .06), this.materials.glass);
        windshield.position.set(0, 1.42, 1.61);
        chassis.add(windshield);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.24, .12, 1.72), this.materials.trim);
        roof.position.set(0, 1.91, .72);
        chassis.add(roof);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, .12, .08), this.materials.marking);
        stripe.position.set(0, 1.48, -.2);
        chassis.add(stripe);
        for (const side of [-1, 1]) {
          addWheel(side * 1.17, -1.32, .55, false);
          addWheel(side * 1.17, .92, .55, true);
        }
        for (const x of [-.62, .62]) {
          const tailLight = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, .08), this.materials.light);
          tailLight.position.set(x, .84, -2.31);
          chassis.add(tailLight);
        }
      } else {
        const shape = new THREE.Shape();
        shape.moveTo(-.82, -2.05);
        shape.lineTo(-1.22, -1.25);
        shape.lineTo(-1.03, .55);
        shape.quadraticCurveTo(-.65, 2.1, 0, 2.65);
        shape.quadraticCurveTo(.65, 2.1, 1.03, .55);
        shape.lineTo(1.22, -1.25);
        shape.lineTo(.82, -2.05);
        shape.closePath();
        const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth: .5, bevelEnabled: true, bevelSize: .12, bevelThickness: .1, bevelSegments: 2}), this.materials.blue);
        body.rotation.x = Math.PI / 2;
        body.position.y = .82;
        chassis.add(body);
        const noseStripe = new THREE.Mesh(new THREE.BoxGeometry(.18, .03, 1.8), this.materials.marking);
        noseStripe.position.set(0, .91, 1.35);
        chassis.add(noseStripe);
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.76, 20, 12), this.materials.glass);
        cockpit.scale.set(.8, .58, 1.4);
        cockpit.position.set(0, 1, -.17);
        chassis.add(cockpit);
        const cockpitRim = new THREE.Mesh(new THREE.BoxGeometry(1.3, .18, 1.8), this.materials.trim);
        cockpitRim.position.set(0, .66, -.15);
        chassis.add(cockpitRim);
        const rearWing = new THREE.Mesh(new THREE.BoxGeometry(3.35, .13, .5), this.materials.trim);
        rearWing.position.set(0, 1.12, -1.85);
        chassis.add(rearWing);
        const wingTrim = new THREE.Mesh(new THREE.BoxGeometry(3.2, .03, .08), this.materials.glass);
        wingTrim.position.set(0, 1.2, -2.07);
        chassis.add(wingTrim);
        const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.75, .12, .38), this.materials.trim);
        frontWing.position.set(0, .37, 2.05);
        chassis.add(frontWing);
        for (const side of [-1, 1]) {
          const sidePod = new THREE.Mesh(new THREE.BoxGeometry(.43, .32, 1.65), this.materials.blue);
          sidePod.position.set(side * 1.03, .47, -.1);
          chassis.add(sidePod);
          const wingSupport = new THREE.Mesh(new THREE.BoxGeometry(.12, .45, .18), this.materials.trim);
          wingSupport.position.set(side * .65, .9, -1.85);
          chassis.add(wingSupport);
          addWheel(side * 1.12, -1.45, .49, false);
          addWheel(side * 1.12, 1.35, .49, true);
        }
        for (const x of [-.56, .56]) {
          const tailLight = new THREE.Mesh(new THREE.BoxGeometry(.38, .12, .08), this.materials.light);
          tailLight.position.set(x, .68, -2.12);
          chassis.add(tailLight);
        }
      }
      this.exhausts = [];
      const flameMaterial = new THREE.MeshBasicMaterial({color: 0x78eaff, transparent: true, opacity: .85, depthWrite: false});
      const exhaustPositions = vehicle.style === 'bike' ? [0] : [-.48, .48];
      for (const x of exhaustPositions) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(.2, 1.4, 9), flameMaterial);
        flame.rotation.x = -Math.PI / 2;
        flame.position.set(x, vehicle.style === 'truck' ? .54 : .52, vehicle.style === 'bike' ? -2.05 : -2.75);
        flame.visible = false;
        chassis.add(flame);
        this.exhausts.push(flame);
      }
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({color: 0x0e2024, transparent: true, opacity: .27, depthWrite: false}));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(vehicle.style === 'bike' ? 1.1 : vehicle.style === 'truck' ? 1.75 : 1.8, vehicle.style === 'bike' ? 2.6 : 3, 1);
      shadow.position.y = .018;
      car.add(shadow);
      this.scene.add(car);
    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      if (this.width === width && this.height === height) return;
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    addStrips(parent, paths, width, material, y = .025) {
      const vertices = [];
      const indices = [];
      for (const points of paths) {
        if (points.length < 2) continue;
        const offset = vertices.length / 3;
        for (let i = 0; i < points.length; i++) {
          const before = points[Math.max(0, i - 1)];
          const after = points[Math.min(points.length - 1, i + 1)];
          const dx = after.x - before.x;
          const dz = after.z - before.z;
          const length = Math.hypot(dx, dz) || 1;
          const nx = -dz / length * width / 2;
          const nz = dx / length * width / 2;
          vertices.push(points[i].x + nx, y, points[i].z + nz, points[i].x - nx, y, points[i].z - nz);
          if (i) {
            const a = offset + (i - 1) * 2;
            const b = offset + i * 2;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
      if (!indices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      parent.add(new THREE.Mesh(geometry, material));
    }

    createRoad(count) {
      if (this.roadGroup) {
        this.scene.remove(this.roadGroup);
        this.roadGroup.traverse(object => { if (object.geometry) object.geometry.dispose(); });
      }
      this.road = G.createRoad(count);
      const group = new THREE.Group();
      const outline = this.road.outline;
      const shape = new THREE.Shape();
      shape.moveTo(outline[0].x, outline[0].z);
      for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i].x, outline[i].z);
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.materials.road);
      mesh.rotation.x = Math.PI / 2;
      mesh.name = 'continuous-road-surface';
      group.add(mesh);

      // The painted shoulder follows the actual polygon boundary, never an independently drawn road edge.
      const edgePaths = [];
      let edge = [outline[0]];
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const exitCap = a.z > 180 && b.z > 180 && Math.hypot(a.x - b.x, a.z - b.z) < 13;
        const entryCap = a.z < -150 && b.z < -150;
        if (exitCap || entryCap) {
          if (edge.length > 1) edgePaths.push(edge);
          edge = [b];
        } else edge.push(b);
      }
      if (edge.length > 1) edgePaths.push(edge);
      this.addStrips(group, edgePaths, .13, this.materials.edge);
      // Markings end at the intersection and continue along each branch, not across it.
      const markings = [];
      for (let z = -155; z < -13; z += 7) markings.push([{x: 0, z}, {x: 0, z: z + 3.4}]);
      for (let index = 0; index < count; index++) {
        const route = G.createRoute(count, index, -10);
        const table = G.sampleRouteByDistance(route, 240);
        for (let distance = 17; distance < table.length - 2; distance += 7) {
          const points = [];
          for (let step = 0; step <= 5; step++) points.push(G.pointAtDistance(table, Math.min(table.length, distance + step * .55)));
          if (points.every(p => G.containsPoint(outline, p))) markings.push(points);
        }
        // Continue the centre line well beyond the camera's view along the selected exit.
        const exitX = this.road.exits[this.road.exits.length - 1 - index];
        const branchSign = exitX < 0 ? -1 : 1;
        for (let z = count === 2 ? 45 : 67; z < 175; z += 7) {
          const branchPoint = value => count === 2
            ? {x: branchSign * (value - 1.24), z: value}
            : {x: exitX, z: value};
          const a = branchPoint(z);
          const b = branchPoint(z + 3.3);
          if (G.containsPoint(outline, a) && G.containsPoint(outline, b)) markings.push([a, b]);
        }
      }
      this.addStrips(group, markings, .14, this.materials.marking, .035);
      this.scene.add(group);
      this.roadGroup = group;
      const treeTransform = new THREE.Object3D();
      for (let i = 0; i < this.trees.length; i++) {
        const tree = this.trees[i];
        const clear = ![-5, 0, 5].some(dx => [-5, 0, 5].some(dz => G.containsPoint(outline, {x: tree.x + dx, z: tree.z + dz})));
        treeTransform.scale.setScalar(clear ? 1 : 0);
        treeTransform.position.set(tree.x, 1.1, tree.z);
        treeTransform.updateMatrix();
        this.treeTrunks.setMatrixAt(i, treeTransform.matrix);
        treeTransform.position.y = 4.1;
        treeTransform.updateMatrix();
        this.treeLeaves.setMatrixAt(i, treeTransform.matrix);
      }
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeLeaves.instanceMatrix.needsUpdate = true;
    }

    reset(count) {
      this.count = count;
      this.createRoad(count);
      this.car.position.set(0, 0, -55);
      this.car.rotation.set(0, 0, 0);
      this.chassis.rotation.set(0, 0, 0);
      this.phase = 'approach';
      this.phaseStartedAt = performance.now();
      this.pausedAt = null;
      this.travelSpeed = 4;
      this.boost = 0;
      this.forward.set(0, 0, 1);
      this.camera.position.set(0, 7.8, -70);
      this.lookTarget.set(0, 1, -35);
      this.camera.lookAt(this.lookTarget);
      this.render();
    }

    startTurn(index, correct) {
      this.setPaused(false);
      if (this.phase === 'approach') {
        this.car.position.z = Math.min(-14, -55 + 4 * Math.max(0, (performance.now() - this.phaseStartedAt) / 1000));
      }
      const route = G.createRoute(this.count, index, this.car.position.z);
      this.route = G.sampleRouteByDistance(route, 320);
      this.phaseStartedAt = performance.now();
      this.turnDuration = 3.8;
      this.turnCorrect = correct;
      this.phase = 'turn';
      this.boost = 0;
      this.initialSpeedRatio = Math.min(.65, this.travelSpeed * this.turnDuration / Math.max(1, this.route.length));
    }

    stop() {
      this.setPaused(false);
      if (this.phase === 'approach') {
        this.car.position.z = Math.min(-14, -55 + 4 * Math.max(0, (performance.now() - this.phaseStartedAt) / 1000));
      }
      this.stopStartZ = this.car.position.z;
      this.phaseStartedAt = performance.now();
      this.phase = 'stopping';
    }

    setPaused(paused) {
      const now = performance.now();
      if (paused && this.pausedAt === null) this.pausedAt = now;
      if (!paused && this.pausedAt !== null) {
        this.phaseStartedAt += now - this.pausedAt;
        this.pausedAt = null;
      }
    }

    update(dt, time) {
      this.time = time;
      this.resize();
      if (this.pausedAt !== null) return;
      if (this.phase === 'approach') {
        this.travelSpeed = 4;
        this.car.position.z = Math.min(-14, -55 + 4 * Math.max(0, (performance.now() - this.phaseStartedAt) / 1000));
      } else if (this.phase === 'stopping') {
        const t = clamp((performance.now() - this.phaseStartedAt) / 850, 0, 1);
        this.travelSpeed = 4 * (1 - t);
        this.car.position.z = this.stopStartZ + 4 * .85 * (t - .5 * t * t);
        this.boost = 0;
      } else if (this.phase === 'turn') {
        const elapsed = Math.max(0, (performance.now() - this.phaseStartedAt) / 1000);
        const t = clamp(elapsed / this.turnDuration, 0, 1);
        const m = this.initialSpeedRatio;
        const fraction = m * t + (1 - m) * t * t;
        const distance = this.route.length * fraction;
        const p = G.pointAtDistance(this.route, distance);
        const a = G.pointAtDistance(this.route, Math.max(0, distance - .3));
        const b = G.pointAtDistance(this.route, Math.min(this.route.length, distance + .3));
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const heading = Math.atan2(dx, dz);
        const previousHeading = this.car.rotation.y;
        this.car.position.set(p.x, 0, p.z);
        this.car.rotation.y = heading;
        this.forward.set(Math.sin(heading), 0, Math.cos(heading));
        const angularSpeed = clamp((heading - previousHeading) / Math.max(dt, .001), -1, 1);
        this.chassis.rotation.z += (clamp(-angularSpeed * .25, -.17, .17) - this.chassis.rotation.z) * damp(6, dt);
        for (const pivot of this.frontPivots) pivot.rotation.y += (clamp(angularSpeed * 1.3, -.42, .42) - pivot.rotation.y) * damp(8, dt);
        this.travelSpeed = this.route.length / this.turnDuration * (m + 2 * (1 - m) * t);
        this.boost += ((this.turnCorrect && t > .68 ? 1 : 0) - this.boost) * damp(4, dt);
      }
      for (const wheel of this.wheels) wheel.rotation.x += this.travelSpeed * dt / .49;
      for (const flame of this.exhausts) {
        flame.visible = this.boost > .05;
        flame.scale.y = .6 + this.boost * (.8 + Math.sin(time * 34) * .12);
      }

      if (!this.debugTopDown) {
        this.camera.up.set(0, 1, 0);
        const speedBob = Math.sin(time * 18) * Math.min(.06, this.travelSpeed * .0015);
        const desired = this.car.position.clone().addScaledVector(this.forward, -14);
        desired.y = 7.8 + speedBob;
        this.camera.position.lerp(desired, damp(5, dt));
        const target = this.car.position.clone().addScaledVector(this.forward, 15);
        target.y = 1.2;
        this.lookTarget.lerp(target, damp(4.5, dt));
        this.camera.lookAt(this.lookTarget);
      } else {
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, 135, -2);
        this.camera.lookAt(0, 0, -2);
      }
      this.render();
    }

    render() { this.renderer.render(this.scene, this.camera); }
  }

  root.DriveScene = DriveScene;
})(window);
