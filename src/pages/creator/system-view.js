import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fbm, makeCanvas } from '../../shared/procedural-canvas.js';
import { systemViewLayout } from './systems.js';

const TAU = Math.PI * 2;

/* ================================================================
   DEDICATED SYSTEM SCENE

   The galaxy view draws every system as a marker plus a handful of
   unlit sprites. Entering one swaps the composer's render pass over
   to this scene instead: real point lighting, procedurally textured
   spheres, and a camera of its own. Nothing here touches the galaxy
   scene, so the two never fight over the same objects.
   ================================================================ */

export function createSystemView({ renderer, renderPass, galaxyScene, galaxyCamera, galaxyControls, onPick }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03040a);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enabled = false;

  // Starless void would read as a bug, so keep a faint backdrop shell.
  const backdrop = buildBackdrop();
  scene.add(backdrop);

  const ambient = new THREE.AmbientLight(0xaebcd8, 0.16);
  scene.add(ambient);

  const textures = new Map();
  let group = null;              // everything belonging to the entered system
  let layout = null;
  let system = null;
  let planetNodes = [];
  let cometNodes = [];
  let lights = [];
  let tween = null;
  let follow = null;
  const followOffset = new THREE.Vector3();
  const followPrev = new THREE.Vector3();
  const followNow = new THREE.Vector3();
  const followStep = new THREE.Vector3();

  /* ---- procedural surfaces -------------------------------------- */

  // One 256px fbm surface per planet class + seed. Cached because a system
  // rebuild (adding a planet) would otherwise regenerate every sibling.
  function planetTexture(key, color) {
    if (textures.has(key)) return textures.get(key);
    const S = 256;
    const [canvas, ctx] = makeCanvas(S, S);
    const base = new THREE.Color(color);
    const img = ctx.createImageData(S, S);
    const seed = hashSeed(key);
    for (let y = 0; y < S; y++) {
      // Latitude banding: gas giants get stripes, rocky worlds get blotches.
      const lat = (y / S - 0.5) * 2;
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 30, y / 30, seed, 4);
        const band = 0.5 + Math.sin(lat * 7 + n * 2.4) * 0.5;
        const shade = 0.62 + n * 0.5 + band * 0.16;
        const i = (y * S + x) * 4;
        img.data[i] = clamp255(base.r * 255 * shade);
        img.data[i + 1] = clamp255(base.g * 255 * shade);
        img.data[i + 2] = clamp255(base.b * 255 * shade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, tex);
    return tex;
  }

  function glowSprite(color, scale) {
    const S = 128;
    const [canvas, ctx] = makeCanvas(S, S);
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.scale.setScalar(scale);
    return sprite;
  }

  function buildBackdrop() {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    let s = 991;
    const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < n; i++) {
      const r = 3000 + rand() * 2000;
      const phi = Math.acos(2 * rand() - 1);
      const th = rand() * TAU;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2, sizeAttenuation: false, color: 0x9fb2d8, transparent: true, opacity: 0.55,
    }));
    points.frustumCulled = false;
    return points;
  }

  /* ---- build / teardown of the entered system -------------------- */

  function build(target) {
    clearGroup();
    system = target;
    layout = systemViewLayout(target);
    group = new THREE.Group();
    planetNodes = [];
    cometNodes = [];
    lights = [];

    layout.stars.forEach((star, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(star.radius, 32, 32),
        new THREE.MeshBasicMaterial({ color: star.color }));
      mesh.position.x = star.offset;
      mesh.userData.pick = { type: 'system', id: target.id };
      mesh.add(glowSprite(star.color, star.radius * 3));
      group.add(mesh);

      // decay 0: inverse-square across a 60-unit system would leave the outer
      // worlds black. Terminators come from surface normals, not falloff.
      const light = new THREE.PointLight(star.color, i === 0 ? 2.2 : 1.1, 0, 0);
      light.position.copy(mesh.position);
      group.add(light);
      lights.push(light);
    });

    const hz = layout.habitableZone;
    const hzMesh = new THREE.Mesh(
      new THREE.RingGeometry(hz.in, hz.out, 96),
      new THREE.MeshBasicMaterial({
        // Against an otherwise black frame even a faint fill reads as the
        // loudest element, so the zone stays a hint rather than a surface.
        color: 0x39d98a, transparent: true, opacity: 0.04,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    hzMesh.rotation.x = -Math.PI / 2;
    group.add(hzMesh);

    for (const planet of layout.planets) {
      group.add(orbitLine(planet.orbit));
      const surface = new THREE.MeshStandardMaterial({
        map: planetTexture(`${target.id}:${planet.name}`, planet.color),
        roughness: 1, metalness: 0,
      });
      surface.userData.shared = true;   // map lives in the cache, not this material
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 32, 24), surface);
      mesh.userData.pick = { type: 'planet', systemId: target.id, planetName: planet.name };
      mesh.userData.orbit = { r: planet.orbit, angle: Math.random() * TAU, period: planet.periodDays };
      mesh.rotation.z = 0.15;

      if (planet.rings) {
        const rings = new THREE.Mesh(
          new THREE.RingGeometry(planet.radius * 1.5, planet.radius * 2.4, 64),
          new THREE.MeshBasicMaterial({
            color: 0xcbb692, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide, depthWrite: false,
          }));
        rings.rotation.x = -Math.PI / 2.6;
        mesh.add(rings);
      }
      for (let m = 0; m < planet.moons; m++) {
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(planet.radius * 0.2, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0x9aa0ad, roughness: 1, metalness: 0 }));
        moon.userData.moon = {
          r: planet.radius * (2.8 + m * 0.9),
          angle: (m / planet.moons) * TAU,
          speed: 0.6 - m * 0.08,
        };
        mesh.add(moon);
      }
      group.add(mesh);
      planetNodes.push(mesh);
    }

    if (layout.belt) group.add(buildBelt(layout.belt));

    for (let c = 0; c < layout.comets; c++) {
      const comet = glowSprite(0xdcefff, layout.starRadius * 0.5);
      comet.userData.orbit = {
        r: layout.edge * (1.05 + c * 0.09),
        angle: Math.random() * TAU,
        period: 2400 + c * 900,
      };
      group.add(comet);
      cometNodes.push(comet);
    }

    scene.add(group);
    layoutOrbits(0);
  }

  function orbitLine(r) {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x5a6d92, transparent: true, opacity: 0.5 }));
  }

  function buildBelt(radius) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    let s = 4242;
    const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const rr = radius + (rand() - 0.5) * radius * 0.22;
      pos[i * 3] = Math.cos(a) * rr;
      pos[i * 3 + 1] = (rand() - 0.5) * radius * 0.03;
      pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8d8574, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false,
    }));
  }

  function clearGroup() {
    follow = null;                 // the followed node is about to be disposed
    if (!group) return;
    scene.remove(group);
    disposeTree(group);
    group = null;
    planetNodes = [];
    cometNodes = [];
    lights = [];
  }

  /* ---- motion ---------------------------------------------------- */

  function layoutOrbits(dt) {
    // Orbital rates are cosmetic: real periods span four orders of magnitude,
    // which would leave the outer worlds visually frozen.
    for (const node of planetNodes) {
      const orbit = node.userData.orbit;
      orbit.angle += dt * (TAU / orbit.period) * 90;
      node.position.set(Math.cos(orbit.angle) * orbit.r, 0, Math.sin(orbit.angle) * orbit.r);
      node.rotation.y += dt * 0.25;
      for (const child of node.children) {
        const moon = child.userData.moon;
        if (!moon) continue;
        moon.angle += dt * moon.speed;
        child.position.set(Math.cos(moon.angle) * moon.r, 0, Math.sin(moon.angle) * moon.r);
      }
    }
    for (const comet of cometNodes) {
      const orbit = comet.userData.orbit;
      orbit.angle += dt * (TAU / orbit.period) * 90;
      comet.position.set(Math.cos(orbit.angle) * orbit.r, orbit.r * 0.06, Math.sin(orbit.angle) * orbit.r);
    }
  }

  // A focused planet keeps orbiting, so the flight has to chase it and the
  // camera has to ride along once it arrives — otherwise it lands on a ghost.
  function updateFollow() {
    if (!follow) return;
    const now = follow.getWorldPosition(followNow);
    if (tween) {
      tween.toTarget.copy(now);
      tween.toPos.copy(now).add(followOffset);
    } else {
      camera.position.add(followStep.subVectors(now, followPrev));
      controls.target.copy(now);
    }
    followPrev.copy(now);
  }

  function clearFollow() {
    follow = null;
  }

  function flyTo(pos, target, dur = 1.4) {
    tween = {
      t: 0, dur,
      fromPos: camera.position.clone(), toPos: pos.clone(),
      fromTarget: controls.target.clone(), toTarget: target.clone(),
    };
    controls.enabled = false;
  }

  function updateTween(dt) {
    if (!tween) return;
    tween.t += dt;
    const u = Math.min(tween.t / tween.dur, 1);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
    if (u >= 1) {
      tween = null;
      controls.enabled = true;
    }
  }

  /* ---- picking --------------------------------------------------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    if (!group) return;
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(group.children, true)) {
      let node = hit.object;
      while (node && !node.userData.pick) node = node.parent;
      if (node?.userData.pick) {
        onPick?.(node.userData.pick, node);
        return;
      }
    }
    onPick?.(null, null);
  }

  function focusPlanet(name) {
    const node = planetNodes.find(p => p.userData.pick.planetName === name);
    if (!node) return false;
    const radius = node.geometry.parameters.radius;
    // Offset scales with the planet so a dwarf and a gas giant frame alike.
    followOffset.set(radius * 4, radius * 2.6, radius * 5.5);
    const target = node.getWorldPosition(new THREE.Vector3());
    follow = node;
    followPrev.copy(target);
    flyTo(target.clone().add(followOffset), target, 1.1);
    return true;
  }

  function frameSystem(dur = 1.4) {
    clearFollow();
    const d = layout ? layout.framing : 60;
    flyTo(new THREE.Vector3(d * 0.35, d * 0.42, d * 0.85), new THREE.Vector3(), dur);
  }

  /* ---- public surface -------------------------------------------- */

  let active = false;

  return {
    get active() { return active; },
    get scene() { return scene; },
    get camera() { return camera; },
    get system() { return system; },
    get layout() { return layout; },

    enter(target) {
      build(target);
      active = true;
      galaxyControls.enabled = false;
      renderPass.scene = scene;
      renderPass.camera = camera;
      // Seat the camera wide, then ease in — the push-in that started in the
      // galaxy view visually continues through the fade.
      const d = layout.framing;
      camera.position.set(d * 0.8, d * 1.0, d * 2.0);
      controls.target.set(0, 0, 0);
      controls.update();
      frameSystem(1.6);
    },

    exit() {
      active = false;
      tween = null;
      controls.enabled = false;
      renderPass.scene = galaxyScene;
      renderPass.camera = galaxyCamera;
      galaxyControls.enabled = true;
      clearGroup();
      system = null;
      layout = null;
    },

    rebuild(target) {
      if (!active) return;
      const pos = camera.position.clone();
      const aim = controls.target.clone();
      build(target);
      camera.position.copy(pos);
      controls.target.copy(aim);
    },

    update(dt) {
      if (!active) return;
      layoutOrbits(dt);      // move the worlds first, then chase them
      updateFollow();
      updateTween(dt);
      controls.update();
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },

    pick,
    focusPlanet,
    frameSystem,

    destroy() {
      clearGroup();
      controls.dispose();
      disposeTree(backdrop);
      scene.remove(backdrop, ambient);
      for (const tex of textures.values()) tex.dispose();
      textures.clear();
      renderPass.scene = galaxyScene;
      renderPass.camera = galaxyCamera;
    },
  };
}

/* ================================================================
   HELPERS
   ================================================================ */

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function hashSeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 9973;
}

function disposeTree(root) {
  root.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      // Planet surfaces live in the shared cache and are disposed with it.
      if (material.map && !material.userData?.shared) material.map.dispose?.();
      material.dispose();
    }
  });
  root.clear?.();
}
