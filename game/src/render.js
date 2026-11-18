// One job: turn world data into pictures. Builds the static city once, keeps
// pools of meshes for moving actors, follows the player with a camera, and
// composites the HUD overlay. It never changes simulation state.

import { CITY, PALETTE, VEHICLE_BY_ID } from './config.js';
import { HudPainter } from './hud.js';

const T = () => window.THREE; // the vendored UMD build defines window.THREE

function textureRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A facades texture: pale wall, dark glass, a few lit rooms. Seeded for shots.
function makeWindowTexture(cols, rows, seed) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const rnd = textureRng(seed);
  g.fillStyle = '#f3efe6'; g.fillRect(0, 0, 256, 256);
  const cw = 256 / cols, ch = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rnd();
      g.fillStyle = lit > 0.86 ? '#ffd98a' : lit > 0.7 ? '#cfd8d6' : '#3d5162';
      g.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.16, cw * 0.64, ch * 0.62);
      g.fillStyle = 'rgba(20,24,30,0.35)';
      g.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.66, cw * 0.64, ch * 0.1);
    }
  }
  const THREE = T();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#17212b'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
  g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.font = 'bold 58px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68, 470);
  return new (T().CanvasTexture)(c);
}

export class GameRenderer {
  constructor(canvas, world, shotMode) {
    const THREE = T();
    this.THREE = THREE;
    this.canvas = canvas;
    this.shotMode = shotMode;
    canvas.width = shotMode ? 1280 : Math.max(640, window.innerWidth);
    canvas.height = shotMode ? 720 : Math.max(400, window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: !shotMode, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 280, 900);
    this.camera = new THREE.PerspectiveCamera(62, canvas.width / canvas.height, 0.4, 1800);
    this.camera.position.set(44, 8, 80);

    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x8a7a5c, 0.92));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.05);
    sun.position.set(220, 340, 160);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    this.buildStaticCity(world.city);
    this.buildVehiclePool(38);
    this.buildPedPool(42);
    this.buildPlayerMesh();
    this.buildEffectPools();
    this.buildMarker();
    this.buildOverlay();

    this.camYaw = 0;
    this.cameraTarget = new THREE.Vector3(44, 1.4, 62);
  }

  // ---------- static world ----------

  buildStaticCity(city) {
    const THREE = this.THREE;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1800),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 700),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.94 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.09, CITY.waterStart + 350);
    this.scene.add(sea);

    // A strip of foam where the water meets the boardwalk.
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8f0f2, transparent: true, opacity: 0.55 }),
    );
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.12, CITY.waterStart + 1);
    this.scene.add(foam);

    const asphalt = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
    for (const line of city.streets) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(850, 0.08, CITY.roadWidth), asphalt);
      h.position.set(0, 0.05, line); this.scene.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(CITY.roadWidth, 0.08, 850), asphalt);
      v.position.set(line, 0.05, 0); this.scene.add(v);
    }

    // Lane dashes, batched into one instanced mesh.
    const dashGeo = new THREE.BoxGeometry(2.6, 0.02, 0.24);
    const dashCount = city.streets.length * 82 * 2;
    const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xd9d4c2 }), dashCount);
    const m = new THREE.Matrix4();
    let di = 0;
    for (const line of city.streets) {
      for (let k = -40; k <= 40; k++) {
        const at = k * 10.5;
        if (di < dashCount) {
          m.makeTranslation(at, 0.1, line);
          dashes.setMatrixAt(di++, m);
          m.makeRotationY(Math.PI / 2); m.setPosition(line, 0.1, at);
          dashes.setMatrixAt(di++, m);
          m.identity();
        }
      }
    }
    dashes.count = di;
    this.scene.add(dashes);

    // Pavement slabs and park lawns.
    const slabGeo = new THREE.BoxGeometry(1, 0.3, 1);
    const slabMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const slabs = new THREE.InstancedMesh(slabGeo, slabMat, city.blocks.length);
    const lawns = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.34, 1), new THREE.MeshLambertMaterial({ color: PALETTE.grass }), city.blocks.length);
    let si = 0, gi = 0;
    for (const b of city.blocks) {
      m.makeScale(b.half * 2, 1, b.half * 2); m.setPosition(b.cx, 0.18, b.cz);
      slabs.setMatrixAt(si++, m);
      if (b.park) {
        m.makeScale(b.half * 2 - 2, 1, b.half * 2 - 2); m.setPosition(b.cx, 0.36, b.cz);
        lawns.setMatrixAt(gi++, m);
      }
    }
    slabs.count = si; lawns.count = gi;
    this.scene.add(slabs, lawns);

    // Buildings: one instanced mesh per window density tier.
    const tiers = [[2, 3], [3, 5], [4, 7], [6, 9]];
    this.buildingMeshes = [];
    for (let tier = 0; tier < 4; tier++) {
      const [cols, rows] = tiers[tier];
      const group = city.buildings.filter(b => b.tier === tier);
      if (!group.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshLambertMaterial({ map: makeWindowTexture(cols, rows, 991 + tier * 37) });
      const inst = new THREE.InstancedMesh(geo, mat, group.length);
      group.forEach((b, i) => {
        m.makeScale(b.w, b.h, b.d); m.setPosition(b.x, 0.32, b.z);
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, new THREE.Color(b.color));
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      this.buildingMeshes.push(inst);
      this.scene.add(inst);
    }

    // Trees: instanced trunks and canopies.
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x74563c }), city.trees.length);
    const canopies = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.8, 4.4, 7),
      new THREE.MeshLambertMaterial({ color: 0xffffff }), city.trees.length);
    city.trees.forEach((t, i) => {
      m.makeScale(t.scale, t.scale, t.scale); m.setPosition(t.x, 0.3 + 1.3 * t.scale, t.z);
      trunks.setMatrixAt(i, m);
      m.makeScale(t.scale, t.scale, t.scale); m.setPosition(t.x, 0.3 + 4.2 * t.scale, t.z);
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, new THREE.Color(t.color));
    });
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    this.scene.add(trunks, canopies);

    // Waterfront props: boardwalk, pier, crates and lamp posts.
    const propMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const propMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), propMat, city.props.length);
    city.props.forEach((p, i) => {
      m.makeScale(p.w, p.h, p.d); m.setPosition(p.x, p.h / 2, p.z);
      propMesh.setMatrixAt(i, m);
      propMesh.setColorAt(i, new THREE.Color(p.color));
    });
    if (propMesh.instanceColor) propMesh.instanceColor.needsUpdate = true;
    this.scene.add(propMesh);

    // Illuminated shop signs, each with its own little canvas texture.
    for (const s of city.signs) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(s.w, s.h),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(s.text, s.color) }),
      );
      plane.position.set(s.x, s.y, s.z);
      plane.rotation.y = s.yaw;
      this.scene.add(plane);
    }
  }

  // ---------- actor pools ----------

  buildVehiclePool(count) {
    const THREE = this.THREE;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    this.vehiclePool = [];
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const body = new THREE.Mesh(box, bodyMat);
      const cabin = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x243442 }));
      const under = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x20242a }));
      group.add(body, cabin, under);
      const wheels = [];
      for (let w = 0; w < 4; w++) {
        const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshLambertMaterial({ color: 0x191c20 }));
        group.add(wheel); wheels.push(wheel);
      }
      const lamps = [];
      for (let w = 0; w < 2; w++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.42),
          new THREE.MeshBasicMaterial({ color: w ? 0xff2a1f : 0x3d8bff }));
        group.add(lamp); lamps.push(lamp);
      }
      const heads = [];
      for (let w = 0; w < 2; w++) {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1),
          new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
        group.add(head); heads.push(head);
      }
      group.visible = false;
      this.scene.add(group);
      this.vehiclePool.push({ group, body, cabin, under, wheels, lamps, heads });
    }
  }

  buildPedPool(count) {
    const THREE = this.THREE;
    this.pedPool = [];
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.0, 7),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      head.position.y = 1.72;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.34),
        new THREE.MeshLambertMaterial({ color: 0x2b3a4a }));
      legs.position.y = 0.36;
      group.add(body, head, legs);
      group.visible = false;
      this.scene.add(group);
      this.pedPool.push({ group, body, head, legs });
    }
  }

  buildPlayerMesh() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.38, 1.0, 8),
      new THREE.MeshLambertMaterial({ color: 0x1f6f8b }));
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 9, 7),
      new THREE.MeshLambertMaterial({ color: 0xc98d61 }));
    head.position.y = 1.78;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.66, 0.36),
      new THREE.MeshLambertMaterial({ color: 0x263243 }));
    legs.position.y = 0.36;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xc4673a }));
    pack.position.set(0, 1.1, -0.34);
    group.add(torso, head, legs, pack);
    group.scale.setScalar(1.2);
    this.scene.add(group);
    this.playerMesh = group;
  }

  buildEffectPools() {
    const THREE = this.THREE;
    this.bulletPool = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xffd873 }));
      m.visible = false; this.scene.add(m); this.bulletPool.push(m);
    }
    this.effectPool = [];
    for (let i = 0; i < 300; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.visible = false; this.scene.add(m); this.effectPool.push(m);
    }
  }

  buildMarker() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 9, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 4.5;
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    diamond.position.y = 4.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25;
    group.add(beam, diamond, ring);
    group.visible = false;
    this.scene.add(group);
    this.marker = { group, diamond, ring };
  }

  buildOverlay() {
    const THREE = this.THREE;
    this.hud = new HudPainter();
    this.overlayTexture = new THREE.CanvasTexture(this.hud.canvas);
    this.overlayTexture.minFilter = THREE.LinearFilter;
    this.overlayTexture.magFilter = THREE.LinearFilter;
    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.overlayCamera.position.z = 1;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.overlayTexture, depthTest: false, depthWrite: false, transparent: true }));
    this.overlayScene.add(quad);
  }

  // ---------- per-frame synchronisation ----------

  sync(world, view, dt) {
    const THREE = this.THREE;
    const active = world.allVehicles.filter(v => !v.dead);
    this.vehiclePool.forEach((pool, i) => {
      const v = active[i];
      pool.group.visible = !!v;
      if (!v) return;
      const s = v.spec;
      pool.group.position.set(v.x, 0, v.z);
      pool.group.rotation.y = v.yaw;
      pool.group.scale.setScalar(v.role === 'police' ? 1.12 : (v === world.player.car ? 1.15 : 1));
      pool.body.scale.set(s.w, s.h, s.l);
      pool.body.position.y = 0.46 + s.h / 2;
      pool.body.material.color.setHex(v.role === 'police' ? 0xf1f2ee : v.color);
      pool.under.material.color.setHex(v.role === 'police' ? 0x1c3f6e : 0x20242a);
      pool.cabin.scale.set(s.w * 0.84, s.cab, s.l * 0.54);
      pool.cabin.position.set(0, 0.46 + s.h + s.cab / 2 - 0.08, -s.l * 0.04);
      pool.under.scale.set(s.w + 0.12, 0.42, s.l * 0.86);
      pool.under.position.y = 0.34;
      const wx = s.w / 2 + 0.06, wz = s.l * 0.32;
      const positions = [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]];
      pool.wheels.forEach((wheel, wi) => {
        wheel.position.set(positions[wi][0], 0.42, positions[wi][1]);
        wheel.rotation.x += v.speed * dt * 1.6;
      });
      pool.heads.forEach((head, hi) => head.position.set((hi ? 1 : -1) * s.w * 0.32, 0.46 + s.h * 0.7, s.l / 2 + 0.02));
      const police = v.role === 'police';
      pool.lamps.forEach((lamp, li) => {
        lamp.visible = police;
        lamp.position.set((li ? 1 : -1) * 0.5, 0.46 + s.h + s.cab + 0.12, 0);
        lamp.material.color.setHex((v.flash === li) ? (li ? 0xff2a1f : 0x3d8bff) : 0x20242a);
      });
    });

    const people = world.pedestrians;
    this.pedPool.forEach((pool, i) => {
      const p = people[i];
      pool.group.visible = !!p;
      if (!p) return;
      pool.group.position.set(p.x, p.dead ? 0.2 : 0, p.z);
      pool.group.rotation.set(0, p.yaw, p.dead ? Math.PI / 2 : 0);
      pool.body.material.color.setHex(p.shirt);
      pool.head.material.color.setHex(p.skin);
      pool.legs.position.y = p.dead ? 0.2 : 0.36 + Math.sin(p.bob) * 0.05;
    });

    this.playerMesh.visible = !world.player.car && !world.player.dead;
    this.playerMesh.position.set(world.player.x, world.player.y, world.player.z);
    this.playerMesh.rotation.y = world.player.yaw;

    this.bulletPool.forEach((m, i) => {
      const b = world.bullets[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x, b.y, b.z);
      m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    });
    this.effectPool.forEach((m, i) => {
      const e = world.effects[i];
      m.visible = !!e;
      if (!e) return;
      m.position.set(e.x, e.y, e.z);
      const k = Math.max(0.05, e.life / e.maxLife) * e.size * (e.kind === 'smoke' ? 3 : 1.6);
      m.scale.set(k, k, k);
      m.material.color.setHex(e.color);
      m.material.opacity = Math.min(0.95, e.life * 1.6);
    });

    const marker = world.story.marker;
    this.marker.group.visible = !!marker;
    if (marker) {
      this.marker.group.position.set(marker.x, 0, marker.z);
      this.marker.diamond.rotation.y += dt * 1.8;
      this.marker.ring.rotation.z += dt * 0.6;
    }

    this.updateCamera(world, view, dt);
    this.hud.paint(world, view);
    this.overlayTexture.needsUpdate = true;
  }

  updateCamera(world, view, dt) {
    const p = world.player;
    if (view.fixedCamera) {
      this.camera.position.set(...view.fixedCamera.pos);
      this.camera.lookAt(...view.fixedCamera.target);
      return;
    }
    const car = p.car;
    const desiredYaw = car ? car.yaw : this.camYaw;
    if (car) this.camYaw = desiredYaw;
    const dist = car ? 12 + Math.abs(car.speed) * 0.12 : 8.4;
    const high = car ? 5.6 : 3.5;
    const tx = p.x, ty = p.y + (car ? 1.5 : 1.4), tz = p.z;
    const want = new this.THREE.Vector3(
      tx - Math.sin(this.camYaw) * dist, ty + high, tz - Math.cos(this.camYaw) * dist);
    if (this.shotMode) this.camera.position.copy(want);
    else this.camera.position.lerp(want, Math.min(1, dt * 6));
    this.cameraTarget.lerp(new this.THREE.Vector3(tx, ty, tz), Math.min(1, dt * 9));
    this.camera.lookAt(this.cameraTarget);
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
  }

  resize(width, height) {
    this.canvas.width = width; this.canvas.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; // from the canvas, never the headless viewport
    this.camera.updateProjectionMatrix();
  }
}
