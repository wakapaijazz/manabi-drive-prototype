/* The road, car and camera share the same 3D world coordinates. */
(function (root) {
  'use strict';

  const THREE = root.THREE;
  const G = root.RoadGeometry;
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
  const damp = (speed, dt) => 1 - Math.exp(-speed * dt);
  const APPROACH_START = -84;
  const APPROACH_LIMIT = -14;
  const BASE_FOV = 53;
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
      this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, .1, 400);
      this.camera.up.set(0, 1, 0);
      this.lookTarget = new THREE.Vector3();
      this.forward = new THREE.Vector3(0, 0, 1);
      this.followPosition = new THREE.Vector3();
      this.followTarget = new THREE.Vector3();
      this.reducedMotion = root.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.stage = 1;
      this.travelSpeed = 0;
      this.boost = 0;
      this.debugTopDown = false;
      this.stageScenery = null;
      this.stageMaterials = [];
      this.stageDeckMaterial = null;
      this.stageRoadZones = [];
      this.vehicle = {...DEFAULT_VEHICLE};
      this.materials = {
        road: new THREE.MeshStandardMaterial({color: 0x465155, map: makeAsphaltTexture(), roughness: .98, side: THREE.DoubleSide}),
        edge: new THREE.MeshBasicMaterial({color: 0xe8d6a3, side: THREE.DoubleSide}),
        marking: new THREE.MeshBasicMaterial({color: 0xe8ede3, side: THREE.DoubleSide}),
        blue: new THREE.MeshStandardMaterial({color: 0x1477d4, metalness: .35, roughness: .32}),
        trim: new THREE.MeshStandardMaterial({color: 0x122840, metalness: .22, roughness: .48}),
        glass: new THREE.MeshStandardMaterial({color: 0x60c9e6, metalness: .32, roughness: .23}),
        windshield: new THREE.MeshPhysicalMaterial({color: 0x12283f, metalness: .48, roughness: .2, clearcoat: .85, clearcoatRoughness: .25}),
        rubber: new THREE.MeshStandardMaterial({color: 0x181d23, roughness: .95}),
        wheel: new THREE.MeshStandardMaterial({color: 0x95a7b0, metalness: .65, roughness: .3}),
        light: new THREE.MeshBasicMaterial({color: 0xff4b65}),
        lightCore: new THREE.MeshBasicMaterial({color: 0xffb8a5})
      };
      this.setupEnvironment();
      this.setStage(1);
      this.applyVehiclePalette(this.vehicle);
      this.createCar(this.vehicle);
      this.roadGroup = null;
      this.resize();
      this.reset(2);
    }

    setupEnvironment() {
      this.ambient = new THREE.HemisphereLight(0xe6f6ff, 0x50653d, 1.65);
      this.sun = new THREE.DirectionalLight(0xfff5dd, 2.2);
      this.sun.position.set(-30, 42, -32);
      this.scene.add(this.ambient, this.sun);
      this.createSky();

      this.grassMaterial = new THREE.MeshStandardMaterial({color: 0x60a95f, roughness: 1});
      const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(700, 700),
        this.grassMaterial
      );
      grass.rotation.x = -Math.PI / 2;
      grass.position.y = -.04;
      this.ground = grass;
      this.scene.add(grass);

      // Fixed scenery remains in world space while the camera moves through it.
      this.scenery = new THREE.Group();
      this.scene.add(this.scenery);
      const trunkMaterial = new THREE.MeshStandardMaterial({color: 0x7e6246, roughness: 1});
      const leafMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1});
      const treeGeometry = new THREE.ConeGeometry(2.1, 5.2, 8);
      const trunkGeometry = new THREE.CylinderGeometry(.35, .5, 2.2, 6);
      this.treeTrunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 62);
      this.treeLeaves = new THREE.InstancedMesh(treeGeometry, leafMaterial, 62);
      this.treeTops = new THREE.InstancedMesh(treeGeometry, leafMaterial, 62);
      this.treeTrunks.frustumCulled = false;
      this.treeLeaves.frustumCulled = false;
      this.treeTops.frustumCulled = false;
      this.treeTrunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.treeLeaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.trees = [];
      for (let i = 0; i < 62; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -145 + Math.floor(i / 2) * 9.4;
        const x = side * (20 + ((i * 47) % 27));
        this.trees.push({x, z});
        this.treeLeaves.setColorAt(i, new THREE.Color([0x306a50, 0x477a49, 0x526e44][i % 3]));
        this.treeTops.setColorAt(i, new THREE.Color([0x41835d, 0x507c4d, 0x648551][i % 3]));
      }
      this.scenery.add(this.treeTrunks, this.treeLeaves, this.treeTops);
      const hillMat = new THREE.MeshStandardMaterial({color: 0x76b884, roughness: 1});
      this.hillMaterial = hillMat;
      this.hills = [];
      for (let i = 0; i < 7; i++) {
        const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), hillMat);
        hill.scale.set(26 + i % 3 * 8, 8 + i % 2 * 5, 20);
        hill.position.set((i - 3) * 45, -2, 222 + i % 2 * 15);
        this.scene.add(hill);
        this.hills.push(hill);
      }
    }

    createSky() {
      const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          zenith: {value:new THREE.Color()}, horizon: {value:new THREE.Color()},
          glow: {value:new THREE.Color()}, orb: {value:new THREE.Vector3()},
          night: {value:0}, disc: {value:.025}
        },
        vertexShader: `
          varying vec3 direction;
          void main() {
            direction = position;
            vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = clip.xyww;
          }
        `,
        fragmentShader: `
          uniform vec3 zenith, horizon, glow, orb;
          uniform float night, disc;
          varying vec3 direction;
          float hash(vec2 p) {
            vec3 q = fract(vec3(p.xyx) * .1031);
            q += dot(q, q.yzx + 33.33);
            return fract((q.x + q.y) * q.z);
          }
          float noise(vec2 p) {
            vec2 a = floor(p), f = fract(p);
            f *= f * (3.0 - 2.0 * f);
            return mix(mix(hash(a), hash(a + vec2(1, 0)), f.x),
                       mix(hash(a + vec2(0, 1)), hash(a + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec3 ray = normalize(direction);
            float elevation = max(0.0, ray.y);
            vec3 color = mix(horizon, zenith, pow(clamp(elevation * 1.60, 0.0, 1.0), .56));
            float d = distance(ray, orb);
            color += glow * (.23 * exp(-d * d * 10.0) + .68 * exp(-d * d * 90.0));
            color = mix(color, glow * 1.32, 1.0 - smoothstep(disc - .002, disc + .002, d));
            if (night > .5) {
              vec2 grid = vec2(atan(ray.x, ray.z), ray.y) * 172.0;
              vec2 cell = floor(grid);
              float seed = hash(cell);
              float speck = 1.0 - smoothstep(.02, .16, length(fract(grid) - vec2(.35, .55)));
              color += vec3(.52, .67, .93) * speck * step(.94, seed) * smoothstep(.01, .23, elevation);
            } else {
              vec2 grid = ray.xz / max(.075, elevation + .13) * vec2(4.0, 8.0);
              float cloud = noise(grid) * .66 + noise(grid * 2.07) * .22 + noise(grid * 4.11) * .12;
              float mist = smoothstep(.51, .72, cloud) * smoothstep(.02, .15, elevation);
              color = mix(color, mix(vec3(.82), glow, .26), mist * .57);
            }
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `
      });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(260, 36, 20), material);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -100;
      this.scene.add(this.sky);
    }

    setStage(stage = 1) {
      const palettes = {
        1: {sky:0x3588c5, fog:0xc2e2ee, light:0xffefbb, sun:[-.46,.22,1], grass:0x548244, hill:0x6d9978, edge:0xf1dda5},
        2: {sky:0x5f6d9c, fog:0xf0ad85, light:0xffbc80, sun:[.31,.12,1], grass:0x5b6958, hill:0x876d74, edge:0xf0d28b},
        3: {sky:0x090e28, fog:0x35466a, light:0xb2d6ff, sun:[-.34,.22,1], grass:0x20374a, hill:0x3d526a, edge:0xc6d9ee}
      };
      const palette = palettes[stage] || palettes[1];
      const nextStage = Number(stage) || 1;
      const needsScenery = this.stage !== nextStage || !this.stageScenery;
      this.stage = nextStage;
      const sky = this.sky.material.uniforms;
      sky.zenith.value.setHex(palette.sky);
      sky.horizon.value.setHex(palette.fog);
      sky.glow.value.setHex(palette.light);
      sky.orb.value.set(...palette.sun).normalize();
      sky.night.value = this.stage === 3 ? 1 : 0;
      sky.disc.value = this.stage === 2 ? .038 : .026;
      this.sun.color.setHex(palette.light);
      this.sun.intensity = this.stage === 3 ? 1.18 : 2.4;
      this.ambient.color.setHex(this.stage === 3 ? 0x95baff : 0xe1efff);
      this.scene.fog.color.setHex(palette.fog);
      this.grassMaterial?.color.setHex(palette.grass);
      this.hillMaterial?.color.setHex(palette.hill);
      this.materials.edge.color.setHex(palette.edge);
      this.ground.position.y = this.stage === 3 ? -22 : -.04;
      this.treeTrunks.visible = this.stage !== 3;
      this.treeLeaves.visible = this.stage !== 3;
      this.treeTops.visible = this.stage !== 3;
      for (const hill of this.hills) hill.visible = this.stage !== 2 && this.stage !== 3;
      if (needsScenery) this.createStageScenery();
    }

    clearStageScenery() {
      if (this.stageScenery) {
        this.scene.remove(this.stageScenery);
        this.stageScenery.traverse(object => { if (object.geometry) object.geometry.dispose(); });
      }
      for (const material of this.stageMaterials) material.dispose();
      this.stageScenery = null;
      this.stageMaterials = [];
      this.stageDeckMaterial = null;
      this.stageRoadZones = [];
    }

    createStageScenery() {
      this.clearStageScenery();
      const group = new THREE.Group();
      group.name = `stage-${this.stage}-scenery`;
      this.stageScenery = group;
      this.scene.add(group);
      const material = (color, options = {}) => {
        const value = new THREE.MeshStandardMaterial({color, roughness:.82, ...options});
        this.stageMaterials.push(value);
        return value;
      };
      const basic = (color) => {
        const value = new THREE.MeshBasicMaterial({color});
        this.stageMaterials.push(value);
        return value;
      };
      const addBox = (width, height, depth, x, y, z, mat) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
      };
      const boxInstances = (items, mat) => {
        if (!items.length) return;
        const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, items.length);
        const pose = new THREE.Object3D();
        for (const [i, [x, y, z, w, h, d, yaw = 0]] of items.entries()) {
          pose.position.set(x, y, z);
          pose.scale.set(w, h, d);
          pose.rotation.y = yaw;
          pose.updateMatrix();
          batch.setMatrixAt(i, pose.matrix);
        }
        group.add(batch);
      };
      const addBoxTo = (parent, width, height, depth, x, y, z, mat) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
      };
      const addCylinder = (radius, height, x, y, z, mat, radialSegments = 8, parent = group) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radialSegments), mat);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
      };
      const addMountain = (x, y, z, width, height, mat) => {
        const mountain = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), mat);
        mountain.scale.set(width, height, width * .7);
        mountain.position.set(x, y, z);
        group.add(mountain);
      };
      const protectFromRoad = (object, x, z, radius) => {
        this.stageRoadZones.push({object, x, z, radius});
      };
      const postBases = [], reflectors = [];
      // All foreground props terminate before the existing junction boundary starts to curve.
      for (let z = -151; z <= -19; z += 6.6) {
        for (const side of [-1, 1]) {
          const x = side * (this.stage === 3 ? 6.2 : 8.1);
          postBases.push([x, .33, z, .15, .68, .18]);
          reflectors.push([x - side * .025, .59, z - .106, .12, .15, .045]);
        }
      }
      boxInstances(postBases, material(this.stage === 3 ? 0x546e87 : 0xc9d8d0));
      boxInstances(reflectors, basic(this.stage === 3 ? 0x8edcff : 0xffc879));

      if (this.stage === 1) {
        const mountain = material(0x5d8e9a);
        const snow = material(0xd9edf0);
        addMountain(-105, 18, 234, 42, 38, mountain);
        addMountain(-35, 13, 244, 34, 28, mountain);
        addMountain(42, 17, 230, 39, 36, mountain);
        addMountain(108, 12, 241, 34, 27, mountain);
        addMountain(-105, 35, 223, 11, 12, snow);
        addMountain(42, 34, 218, 10, 12, snow);
        const rocks = [], meadow = [];
        for (let i = 0; i < 140; i++) {
          const side = i % 2 ? 1 : -1;
          const z = -152 + (i * 47) % 134;
          const x = side * (10 + (i * 29) % 44 * .64);
          if (i % 9 === 0) rocks.push([x, .21, z, 1.1 + i % 5 * .26, .4, .8, i * .38]);
          else meadow.push([x, -.01, z, 1.7 + i % 7 * .6, .038, 1.5 + i % 3, i * .3]);
        }
        boxInstances(meadow, material(0x617e42));
        boxInstances(rocks, material(0x758c78));
        return;
      }

      if (this.stage === 2) {
        const buildingMats = [material(0xc9b5a9), material(0x9fb4c8), material(0xd4a26e), material(0x9a9bbd)];
        const glassWindows = [], litWindows = [];
        const pole = material(0x37485a, {metalness:.35, roughness:.55});
        const lamp = basic(0xfff0b0);
        for (let i = 0; i < 24; i++) {
          const side = i % 2 ? 1 : -1;
          const depth = Math.floor(i / 2);
          const z = -142 + depth * 20;
          // Close buildings are entirely on the straight approach. Beyond it,
          // even the widest branch stays well inside the far skyline.
          const x = side * (z < -34 ? 22 + depth % 3 * 7 : 91 + depth % 3 * 8);
          const width = 9 + (depth % 2) * 5;
          const height = 10 + (i * 7) % 24;
          const building = buildingMats[i % buildingMats.length];
          addBox(width, height, 11, x, height / 2, z, building);
          addBox(width * .59, 1.8, 6.7, x, height + .9, z, pole);
          for (let row = 0; row < Math.floor((height - 1.8) / 2.6); row++) {
            const y = 1.8 + row * 2.6;
            for (let column = -1; column <= 1; column++) {
              const batch = (i + row * 3 + column * 7) % 5 === 0 ? litWindows : glassWindows;
              batch.push([x + column * width * .28, y, z - 5.52, 1.3, 1.01, .06]);
              batch.push([x - side * (width / 2 + .02), y, z + column * 3.2, .06, 1.01, 1.5]);
            }
          }
        }
        boxInstances(glassWindows, basic(0x3e536e));
        boxInstances(litWindows, basic(0xffcf9c));
        // 街灯は分岐前の直線区間だけに置き、曲がった先の走行ラインには入れない。
        for (let i = 0; i < 6; i++) {
          const z = -142 + i * 22;
          for (const x of [-9.2, 9.2]) {
            const fixture = new THREE.Group();
            fixture.position.set(x, 0, z);
            group.add(fixture);
            addCylinder(.11, 6.2, 0, 3.1, 0, pole, 7, fixture);
            const arm = addBoxTo(fixture, 1.4, .12, .12, x < 0 ? .55 : -.55, 6.05, 0, pole);
            arm.rotation.z = x < 0 ? -.08 : .08;
            const glow = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 8), lamp);
            glow.position.set(x < 0 ? 1.1 : -1.1, 5.9, 0);
            fixture.add(glow);
            protectFromRoad(fixture, x, z, 1.8);
          }
        }
        const tower = material(0x6f8096);
        addBox(5, 28, 5, -74, 14, 220, tower);
        addBox(5, 36, 5, 78, 18, 230, tower);
        return;
      }

      // Stage 3: a raised expressway with barriers, support columns and a lit skyline.
      const concrete = material(0x67758b);
      const concreteDark = material(0x3b485e);
      this.stageDeckMaterial = concreteDark;
      const rail = material(0x9aa8b8, {metalness:.3, roughness:.55});
      const nightBuilding = material(0x263653);
      const cityLight = basic(0xffd879);
      const mountain = material(0x202d4b);
      addBox(.38, .88, 136, -6.2, .42, -85, rail);
      addBox(.38, .88, 136, 6.2, .42, -85, rail);
      const railLights = [];
      for (let z = -140; z <= -24; z += 14) {
        addBox(.38, 1.12, .38, -6.2, .57, z, concrete);
        addBox(.38, 1.12, .38, 6.2, .57, z, concrete);
        railLights.push([-6.2, .98, z - .21, .28, .13, .045], [6.2, .98, z - .21, .28, .13, .045]);
      }
      boxInstances(railLights, basic(0xabdeff));
      for (let z = -142; z <= 24; z += 42) {
        addCylinder(.62, 20, -5.8, -11, z, concreteDark, 10);
        addCylinder(.62, 20, 5.8, -11, z, concreteDark, 10);
        addBox(14, .7, 1.1, 0, -1.7, z, concrete);
      }
      const nightBlocks = [], nightWindows = [];
      for (let i = 0; i < 38; i++) {
        const z = -87 + (i * 17) % 230;
        const x = (i % 2 ? 1 : -1) * (17 + (i * 23) % 80);
        const height = 6 + (i * 7) % 13;
        nightBlocks.push([x, height / 2 - 22, z, 8, height, 9]);
        for (let y = 1.6; y < height - .6; y += 2.4) {
          for (let j = -1; j <= 1; j++) {
            if (Math.round(y + i + j * 7) % 4 !== 0) nightWindows.push([x + j * 2.3, y - 22, z - 4.52, .72, .72, .06]);
          }
        }
      }
      boxInstances(nightBlocks, nightBuilding);
      boxInstances(nightWindows, cityLight);
      addMountain(-115, -1, 234, 48, 35, mountain);
      addMountain(115, -1, 242, 55, 42, mountain);
    }

    refreshStageSceneryForRoad(outline) {
      for (const zone of this.stageRoadZones) {
        let blocked = G.containsPoint(outline, {x:zone.x, z:zone.z});
        for (let i = 0; !blocked && i < 8; i++) {
          const angle = i * Math.PI / 4;
          blocked = G.containsPoint(outline, {
            x: zone.x + Math.cos(angle) * zone.radius,
            z: zone.z + Math.sin(angle) * zone.radius
          });
        }
        zone.object.visible = !blocked;
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
      for (const material of car.userData.materials) material.dispose();
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
      if (this.pausedAt != null) this.render();
    }

    createCar(vehicle = this.vehicle || DEFAULT_VEHICLE) {
      const car = new THREE.Group();
      car.userData.materials = [];
      const chassis = new THREE.Group();
      car.add(chassis);
      this.car = car;
      this.chassis = chassis;
      this.wheels = [];
      this.frontPivots = [];
      const materials = this.materials;
      const meshAt = (parent, geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
      };
      const box = (w, h, d, x, y, z, material) =>
        meshAt(chassis, new THREE.BoxGeometry(w, h, d), material, x, y, z);

      const addWheel = (x, z, radius, front = z > 0) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, radius, z);
        const wheel = new THREE.Group();
        wheel.userData.radius = radius;
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .47, 24), materials.rubber);
        tire.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .62, radius * .62, .48, 20), materials.trim);
        hub.rotation.z = Math.PI / 2;
        wheel.add(tire, hub);
        const outerX = x === 0 ? 0 : Math.sign(x) * .25;
        const rim = meshAt(wheel, new THREE.TorusGeometry(radius * .53, .025, 5, 20), materials.wheel, outerX, 0, 0);
        rim.rotation.y = Math.PI / 2;
        for (let spoke = 0; spoke < 3; spoke++) {
          const bar = meshAt(wheel, new THREE.BoxGeometry(.035, .044, radius * 1.02), materials.wheel, outerX, 0, 0);
          bar.rotation.x = spoke * Math.PI / 3;
        }
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
        const windshield = new THREE.Mesh(new THREE.SphereGeometry(.45, 16, 10), materials.windshield);
        windshield.scale.set(.52, .58, .8);
        windshield.position.set(0, 1.18, .72);
        chassis.add(windshield);
        const handlebar = new THREE.Mesh(new THREE.BoxGeometry(1.15, .08, .08), this.materials.trim);
        handlebar.position.set(0, 1.24, 1.12);
        chassis.add(handlebar);
        addWheel(0, -1.3, .58, false);
        addWheel(0, 1.3, .58, true);
        const headlight = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), materials.lightCore);
        headlight.position.set(0, 1.28, 1.48);
        chassis.add(headlight);
        box(.32, .105, .08, 0, .91, -1.19, materials.light);
        box(.29, .18, .55, 0, .94, -.58, materials.trim);
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
        box(2.26, .87, .08, 0, 1.3, -2.15, materials.trim);
        box(2.16, .12, .09, 0, 1.65, -2.2, materials.wheel);
        for (const y of [1.02, 1.18, 1.34, 1.50]) box(1.88, .026, .06, 0, y, -2.21, materials.wheel);
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
        shape.moveTo(-1.13, -1.97);
        shape.quadraticCurveTo(-1.39, -1.7, -1.32, -1.23);
        shape.quadraticCurveTo(-1.18, .35, -.96, 1.57);
        shape.quadraticCurveTo(-.77, 2.18, -.45, 2.36);
        shape.lineTo(.45, 2.36);
        shape.quadraticCurveTo(.77, 2.18, .96, 1.57);
        shape.quadraticCurveTo(1.18, .35, 1.32, -1.23);
        shape.quadraticCurveTo(1.39, -1.7, 1.13, -1.97);
        shape.closePath();
        const body = meshAt(chassis, new THREE.ExtrudeGeometry(shape, {
          depth: .46, bevelEnabled: true, bevelSize: .10, bevelThickness: .12, bevelSegments: 3
        }), materials.blue, 0, .77, 0);
        body.rotation.x = Math.PI / 2;
        const canopy = meshAt(chassis, new THREE.SphereGeometry(1, 26, 14), materials.windshield, 0, .84, .02);
        canopy.scale.set(.71, .63, 1.18);
        box(.94, .05, .72, 0, .91, -1.43, materials.trim);
        box(2.42, .27, .20, 0, .62, -1.99, materials.trim);
        box(2.42, .10, .4, 0, .34, -1.99, materials.trim);
        box(2.97, .115, .44, 0, 1.32, -1.8, materials.trim).rotation.x = -.09;
        box(2.88, .050, .075, 0, 1.32, -2.03, materials.glass);
        box(2.65, .10, .38, 0, .29, 2.03, materials.trim);
        box(.20, .028, 1.08, 0, .9, 1.65, materials.marking);
        for (const x of [-.52, -.26, 0, .26, .52]) box(.052, .17, .31, x, .32, -2.07, materials.trim);
        for (const side of [-1, 1]) {
          const shoulder = meshAt(chassis, new THREE.SphereGeometry(1, 20, 12), materials.blue, side * .99, .62, -1.18);
          shoulder.scale.set(.44, .36, .88);
          box(.08, .11, 2.01, side * 1.24, .33, .06, materials.wheel);
          box(.08, .27, .48, side * 1.43, 1.36, -1.80, materials.blue);
          box(.085, .51, .20, side * .62, 1.06, -1.79, materials.trim).rotation.x = .24;
          box(.65, .132, .05, side * .84, .75, -2.108, materials.light);
          box(.52, .026, .023, side * .87, .772, -2.138, materials.lightCore);
          const outlet = meshAt(chassis, new THREE.CylinderGeometry(.13, .14, .16, 14), materials.wheel, side * .45, .48, -2.15);
          outlet.rotation.x = Math.PI / 2;
          const aperture = meshAt(chassis, new THREE.CircleGeometry(.093, 14), materials.rubber, side * .45, .48, -2.232);
          aperture.rotation.y = Math.PI;
          addWheel(side * 1.16, -1.38, .48, false);
          addWheel(side * 1.16, 1.32, .46, true);
        }
      }
      this.exhausts = [];
      const flameMaterial = new THREE.MeshBasicMaterial({color: 0x78eaff, transparent: true, opacity: .85, depthWrite: false});
      car.userData.materials.push(flameMaterial);
      const exhaustPositions = vehicle.style === 'bike' ? [0] : [-.45, .45];
      for (const x of exhaustPositions) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(.2, 1.4, 9), flameMaterial);
        flame.rotation.x = -Math.PI / 2;
        flame.userData.nozzle = vehicle.style === 'bike' ? -1.72 : -2.24;
        flame.position.set(x, vehicle.style === 'truck' ? .54 : .48, flame.userData.nozzle);
        flame.visible = false;
        chassis.add(flame);
        this.exhausts.push(flame);
      }
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({color: 0x0e2024, transparent: true, opacity: .27, depthWrite: false}));
      car.userData.materials.push(shadow.material);
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
      if (this.pausedAt != null) this.render();
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
      this.refreshStageSceneryForRoad(this.road.outline);
      const group = new THREE.Group();
      const outline = this.road.outline;
      const shape = new THREE.Shape();
      shape.moveTo(outline[0].x, outline[0].z);
      for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i].x, outline[i].z);
      shape.closePath();
      if (this.stage === 3 && this.stageDeckMaterial) {
        const deckGeometry = new THREE.ExtrudeGeometry(shape, {depth:.9, bevelEnabled:false, steps:1});
        const deck = new THREE.Mesh(deckGeometry, this.stageDeckMaterial);
        deck.rotation.x = Math.PI / 2;
        deck.position.y = -.02;
        deck.name = 'elevated-highway-deck';
        group.add(deck);
      }
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
        const scale = clear ? .75 + (i % 5) * .13 : 0;
        treeTransform.scale.setScalar(scale);
        treeTransform.position.set(tree.x, 1.1, tree.z);
        treeTransform.updateMatrix();
        this.treeTrunks.setMatrixAt(i, treeTransform.matrix);
        treeTransform.position.y = 4.1;
        treeTransform.updateMatrix();
        this.treeLeaves.setMatrixAt(i, treeTransform.matrix);
        treeTransform.scale.setScalar(scale * .67);
        treeTransform.position.y += 1.78 * scale;
        treeTransform.updateMatrix();
        this.treeTops.setMatrixAt(i, treeTransform.matrix);
      }
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeLeaves.instanceMatrix.needsUpdate = true;
      this.treeTops.instanceMatrix.needsUpdate = true;
    }

    reset(count, {approachSeconds = 10, parked = false} = {}) {
      this.count = count;
      if (this.road?.count !== count || this.roadStage !== this.stage) {
        this.createRoad(count);
        this.roadStage = this.stage;
      }
      this.car.position.set(0, 0, APPROACH_START);
      this.car.rotation.set(0, 0, 0);
      this.chassis.rotation.set(0, 0, 0);
      for (const pivot of this.frontPivots) pivot.rotation.y = 0;
      for (const flame of this.exhausts) flame.visible = false;
      this.phase = parked ? 'parked' : 'approach';
      this.phaseStartedAt = performance.now();
      this.pausedAt = parked ? this.phaseStartedAt : null;
      this.approachSpeed = (APPROACH_LIMIT - APPROACH_START) / approachSeconds;
      this.travelSpeed = parked ? 0 : this.approachSpeed;
      this.boost = 0;
      this.forward.set(0, 0, 1);
      this.camera.fov = BASE_FOV;
      this.camera.updateProjectionMatrix();
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, this.stage === 3 ? 7.2 : 5.8, APPROACH_START - 11.5);
      this.lookTarget.set(0, 1.25, APPROACH_START + 14);
      this.camera.lookAt(this.lookTarget);
      this.render();
    }

    updateApproach(now) {
      const elapsed = Math.max(0, (now - this.phaseStartedAt) / 1000);
      const z = APPROACH_START + elapsed * this.approachSpeed;
      this.car.position.z = Math.min(APPROACH_LIMIT, z);
      this.travelSpeed = z < APPROACH_LIMIT ? this.approachSpeed : 0;
    }

    startTurn(index, correct) {
      this.setPaused(false);
      const now = performance.now();
      if (this.phase === 'approach') this.updateApproach(now);
      const route = G.createRoute(this.count, index, this.car.position.z);
      const samples = 320;
      this.route = G.sampleRouteByDistance(route, samples);
      this.phaseStartedAt = now;
      this.turnDuration = 3.8;
      this.turnCorrect = correct;
      this.phase = 'turn';
      this.boost = 0;
      this.boostDistance = this.route.distances[Math.round(samples * (route.straightPortion + (1 - route.straightPortion) * .64))];
      this.turnLength = this.route.length * (correct ? 1 : .85);
      this.initialSpeedRatio = Math.min(.65, this.travelSpeed * this.turnDuration / Math.max(1, this.turnLength));
    }

    stop() {
      this.setPaused(false);
      this.stopStartZ = this.car.position.z;
      this.stopSpeed = Math.min(this.approachSpeed, this.travelSpeed);
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
      this.resize();
      if (this.pausedAt !== null) return;
      const reducedMotion = this.reducedMotion?.matches;
      let steering = 0;
      if (this.phase === 'approach') {
        this.updateApproach(performance.now());
      } else if (this.phase === 'stopping') {
        const t = clamp((performance.now() - this.phaseStartedAt) / 850, 0, 1);
        this.travelSpeed = this.stopSpeed * (1 - t);
        this.car.position.z = Math.min(APPROACH_LIMIT, this.stopStartZ + this.stopSpeed * .85 * (t - .5 * t * t));
        this.boost = 0;
      } else if (this.phase === 'turn') {
        const elapsed = Math.max(0, (performance.now() - this.phaseStartedAt) / 1000);
        const t = clamp(elapsed / this.turnDuration, 0, 1);
        const m = this.initialSpeedRatio;
        // Match the approach speed, then build speed through the corner.
        // Correct routes have a steeper acceleration curve towards the exit.
        const surge = this.turnCorrect ? .26 : 0;
        const ease = (1 - surge) * t * t + surge * t ** 4;
        const fraction = m * t + (1 - m) * ease;
        const distance = this.turnLength * fraction;
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
        steering = clamp((heading - previousHeading) / Math.max(dt, .001), -1, 1);
        this.chassis.rotation.z += (-steering * (this.vehicle.style === 'bike' ? .33 : .17) - this.chassis.rotation.z) * damp(6, dt);
        for (const pivot of this.frontPivots) pivot.rotation.y += (clamp(steering, -.42, .42) - pivot.rotation.y) * damp(8, dt);
        const velocity = m + (1 - m) * (2 * (1 - surge) * t + 4 * surge * t ** 3);
        this.travelSpeed = this.turnLength / this.turnDuration * velocity;
        const onExit = t > .68 && distance >= this.boostDistance;
        this.boost += ((this.turnCorrect && onExit ? 1 : 0) - this.boost) * damp(9, dt);
      }
      for (const wheel of this.wheels) wheel.rotation.x += this.travelSpeed * dt / wheel.userData.radius;
      for (const flame of this.exhausts) {
        flame.visible = this.boost > .05;
        const length = .45 + this.boost * (1.15 + Math.sin(time * 37) * .13);
        flame.scale.y = length;
        flame.position.z = flame.userData.nozzle - length * .7;
      }

      if (!this.debugTopDown) {
        const intensity = clamp(this.travelSpeed / 49, 0, 1);
        const cameraEffect = reducedMotion ? 0 : intensity;
        const wantedFov = BASE_FOV + cameraEffect * 7 + (reducedMotion ? 0 : this.boost * 5);
        this.camera.fov += (wantedFov - this.camera.fov) * damp(5, dt);
        this.camera.updateProjectionMatrix();
        this.camera.up.set(reducedMotion ? 0 : steering * .048, 1, 0);
        const speedBob = Math.sin(time * 22) * cameraEffect * .055;
        const desired = this.followPosition.copy(this.car.position).addScaledVector(this.forward, -11.5 - cameraEffect * 1.2);
        desired.y = (this.stage === 3 ? 7.2 : 5.8) + speedBob - cameraEffect * .55;
        this.camera.position.lerp(desired, damp(7, dt));
        const target = this.followTarget.copy(this.car.position).addScaledVector(this.forward, 14 + intensity * 4);
        target.y = 1.25;
        this.lookTarget.lerp(target, damp(4.5, dt));
        this.camera.lookAt(this.lookTarget);
      } else {
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, 135, -2);
        this.camera.lookAt(0, 0, -2);
      }
      this.render();
    }

    render() {
      this.sky.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
    }
  }

  root.DriveScene = DriveScene;
})(window);
