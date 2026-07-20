import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeCanvas } from '../../shared/procedural-canvas.js';
import { systemViewLayout } from './systems.js';
import {
  ATMOSPHERE_SHELL, createPlanetSurface, createRingTexture, createStarSurface, makeAtmosphere,
} from './planet-textures.js';

const TAU = Math.PI * 2;

/* ================================================================
   DEDICATED SYSTEM SCENE

   The galaxy view draws every system as a marker plus a handful of
   unlit sprites. Entering one swaps the composer's render pass over
   to this scene instead: real point lighting, procedurally textured
   spheres, and a camera of its own. Nothing here touches the galaxy
   scene, so the two never fight over the same objects.
   ================================================================ */

export const CAMERA_MODES = [
  { id: 'orbit', label: 'Orbit', hint: 'Drag to rotate, scroll to zoom around the focused body.' },
  { id: 'free', label: 'Free', hint: 'WASD to fly, Space/Ctrl for up and down, drag to look. Shift boosts.' },
  { id: 'follow', label: 'Follow', hint: 'Locks to the selected body and rides its orbit.' },
  { id: 'cinematic', label: 'Cinematic', hint: 'Hands-off tour that drifts between the worlds.' },
];

export function createSystemView({
  renderer, renderPass, scope, galaxyScene, galaxyCamera, galaxyControls, makeLabel, onPick, onToast,
}) {
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
  let moonNodes = [];
  let cometNodes = [];
  let trailNodes = [];
  let starNodes = [];
  let coronas = [];
  let tween = null;
  let active = false;
  let elapsed = 0;

  let follow = null;
  const followOffset = new THREE.Vector3();
  const followPrev = new THREE.Vector3();
  const followNow = new THREE.Vector3();
  const followStep = new THREE.Vector3();

  // View settings mirrored by the View tab.
  const view = { labels: true, trails: true, planetScale: 1, orbitScale: 1 };

  /* ---- cached textures ------------------------------------------- */

  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  function cached(key, make) {
    if (!textures.has(key)) textures.set(key, make());
    return textures.get(key);
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

  /* ---- build ------------------------------------------------------ */

  function attachLabel(parent, text, offsetY) {
    if (!makeLabel) return null;
    const label = makeLabel(text, offsetY);
    label.visible = view.labels;
    parent.add(label);
    return label;
  }

  function build(target) {
    clearGroup();
    system = target;
    layout = systemViewLayout(target);
    group = new THREE.Group();
    planetNodes = []; moonNodes = []; cometNodes = []; trailNodes = []; starNodes = []; coronas = [];

    layout.stars.forEach((star, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(star.radius, 40, 32),
        new THREE.MeshBasicMaterial({
          map: cached(`star:${target.id}:${i}`, () => createStarSurface(star.color, 900 + i, { anisotropy })),
        }));
      mesh.position.x = star.offset;
      mesh.userData.pick = { type: 'system', id: target.id };
      mesh.userData.targetId = `star:${i}`;
      mesh.userData.spin = 0.02;

      // Corona: two breathing shells. Kept dim on purpose — the task-15 glow
      // budget exists because fat halos are what buried the planets.
      for (const [factor, opacity] of [[2.6, 0.32], [4.2, 0.14]]) {
        const sprite = glowSprite(star.color, star.radius * factor);
        sprite.material.opacity = opacity;
        sprite.userData.breathe = { base: star.radius * factor, phase: i * 1.7 };
        mesh.add(sprite);
        coronas.push(sprite);
      }
      attachLabel(mesh, i === 0 ? target.name : `${target.name} ${String.fromCharCode(66 + i)}`, star.radius + 1.4);
      group.add(mesh);
      starNodes.push(mesh);

      // decay 0: inverse-square across a 60-unit system would leave the outer
      // worlds black. Terminators come from surface normals, not falloff.
      const light = new THREE.PointLight(star.color, i === 0 ? 2.2 : 1.1, 0, 0);
      light.position.copy(mesh.position);
      group.add(light);
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
      const trail = orbitTrail(planet.orbit);
      trail.visible = view.trails;
      group.add(trail);
      trailNodes.push(trail);

      const surface = new THREE.MeshStandardMaterial({
        map: cached(`surface:${target.id}:${planet.name}`,
          () => createPlanetSurface(planet.class, hashSeed(target.id + planet.name), { anisotropy })),
        roughness: 1, metalness: 0,
      });
      surface.userData.shared = true;   // map lives in the cache, not this material
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 40, 28), surface);
      mesh.userData.pick = { type: 'planet', systemId: target.id, planetName: planet.name };
      mesh.userData.targetId = `planet:${planet.name}`;
      mesh.userData.orbit = { base: planet.orbit, r: planet.orbit, angle: Math.random() * TAU, period: planet.periodDays };
      mesh.userData.spin = 0.25;
      mesh.rotation.z = 0.15;
      mesh.scale.setScalar(view.planetScale);

      const shell = ATMOSPHERE_SHELL[planet.atmosphere];
      if (shell) mesh.add(makeAtmosphere(planet.radius, shell.color, shell.intensity));

      if (planet.rings) {
        const inner = planet.radius * 1.5, outer = planet.radius * 2.4;
        const geo = new THREE.RingGeometry(inner, outer, 128, 1);
        radialiseRingUVs(geo, inner, outer);
        const rings = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: cached('ring', () => createRingTexture()),
          transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05,
        }));
        rings.material.userData.shared = true;
        rings.rotation.x = -Math.PI / 2.6;
        mesh.add(rings);
      }

      for (const moon of planet.moonList) {
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(planet.radius * moon.radius * 0.9, planet.radius * 0.12), 20, 14),
          new THREE.MeshStandardMaterial({ color: 0x9aa0ad, roughness: 1, metalness: 0 }));
        // The mesh sits inside a pivot and is never counter-rotated, which
        // gives tidal locking for free.
        moonMesh.userData.moon = {
          r: planet.radius * moon.distance,
          angle: moon.phase,
          speed: TAU / Math.max(moon.periodDays, 0.5) * 0.35,
        };
        moonMesh.userData.pick = {
          type: 'moon', systemId: target.id, planetName: planet.name, moonName: moon.name,
        };
        moonMesh.userData.targetId = `moon:${moon.name}`;
        attachLabel(moonMesh, moon.name, moon.radius + 0.4);
        mesh.add(moonMesh);
        moonNodes.push(moonMesh);
      }

      attachLabel(mesh, planet.name, planet.radius + 1.1);
      group.add(mesh);
      planetNodes.push(mesh);
    }

    if (layout.belt) group.add(buildBelt(layout.belt));

    for (let c = 0; c < layout.comets; c++) {
      const comet = glowSprite(0xdcefff, layout.starRadius * 0.5);
      comet.userData.orbit = {
        base: layout.edge * (1.05 + c * 0.09),
        r: layout.edge * (1.05 + c * 0.09),
        angle: Math.random() * TAU,
        period: 2400 + c * 900,
      };
      group.add(comet);
      cometNodes.push(comet);
    }

    scene.add(group);
    applyOrbitScale();
    layoutOrbits(0);
  }

  // The ring strip is a 512x32 texture sampled across the ring's WIDTH, so the
  // default annular UVs have to be rewritten radially or it smears round it.
  function radialiseRingUVs(geo, inner, outer) {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 1);
    }
    uv.needsUpdate = true;
  }

  /* Orbits are drawn as jittered Points rather than a line — the scatter is
     what reads as a dusty orbital lane instead of a CAD circle. */
  function orbitTrail(r) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    fillTrail(pos, r);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8a9ec4, size: 0.09, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    points.userData.radius = r;
    return points;
  }

  function fillTrail(arr, r) {
    const n = arr.length / 3;
    const jitter = Math.max(r * 0.006, 0.03);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      arr[i * 3] = Math.cos(a) * r + (Math.random() - 0.5) * jitter * 2;
      arr[i * 3 + 1] = (Math.random() - 0.5) * jitter * 1.6;
      arr[i * 3 + 2] = Math.sin(a) * r + (Math.random() - 0.5) * jitter * 2;
    }
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
    planetNodes = []; moonNodes = []; cometNodes = []; trailNodes = []; starNodes = []; coronas = [];
  }

  /* ---- motion ------------------------------------------------------ */

  function layoutOrbits(dt) {
    // Orbital rates are cosmetic: real periods span four orders of magnitude,
    // which would leave the outer worlds visually frozen.
    for (const node of planetNodes) {
      const orbit = node.userData.orbit;
      orbit.angle += dt * (TAU / orbit.period) * 90;
      node.position.set(Math.cos(orbit.angle) * orbit.r, 0, Math.sin(orbit.angle) * orbit.r);
      node.rotation.y += dt * node.userData.spin;
    }
    for (const moon of moonNodes) {
      const m = moon.userData.moon;
      m.angle += dt * m.speed;
      moon.position.set(Math.cos(m.angle) * m.r, 0, Math.sin(m.angle) * m.r);
    }
    for (const star of starNodes) star.rotation.y += dt * star.userData.spin;
    for (const comet of cometNodes) {
      const orbit = comet.userData.orbit;
      orbit.angle += dt * (TAU / orbit.period) * 90;
      comet.position.set(Math.cos(orbit.angle) * orbit.r, orbit.r * 0.06, Math.sin(orbit.angle) * orbit.r);
    }
    for (const sprite of coronas) {
      const b = sprite.userData.breathe;
      sprite.scale.setScalar(b.base * (1 + Math.sin(elapsed * 0.8 + b.phase) * 0.04));
    }
  }

  function applyOrbitScale() {
    for (const node of planetNodes) {
      node.userData.orbit.r = node.userData.orbit.base * view.orbitScale;
    }
    for (const comet of cometNodes) {
      comet.userData.orbit.r = comet.userData.orbit.base * view.orbitScale;
    }
    for (const trail of trailNodes) {
      const r = trail.userData.radius * view.orbitScale;
      fillTrail(trail.geometry.attributes.position.array, r);
      trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---- camera ------------------------------------------------------ */

  let mode = 'orbit';
  const keys = new Set();
  let looking = false;
  let lookPrev = null;
  let cineTimer = 0;
  let cineIndex = 0;
  const cineTarget = new THREE.Vector3();
  const cineLook = new THREE.Vector3();

  if (scope) {
    scope.listen(window, 'keydown', event => {
      if (!active || mode !== 'free') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      keys.add(event.code);
    });
    scope.listen(window, 'keyup', event => keys.delete(event.code));
    scope.listen(window, 'blur', () => { keys.clear(); looking = false; });
    scope.listen(renderer.domElement, 'pointerdown', event => {
      if (active && mode === 'free') { looking = true; lookPrev = { x: event.clientX, y: event.clientY }; }
    });
    scope.listen(window, 'pointerup', () => { looking = false; lookPrev = null; });
    scope.listen(renderer.domElement, 'pointermove', event => {
      if (!active || mode !== 'free' || !looking || !lookPrev) return;
      const dx = (event.clientX - lookPrev.x) * 0.0035;
      const dy = (event.clientY - lookPrev.y) * 0.0035;
      lookPrev = { x: event.clientX, y: event.clientY };
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      euler.y -= dx;
      euler.x = THREE.MathUtils.clamp(euler.x - dy, -1.45, 1.45);
      camera.quaternion.setFromEuler(euler);
    });
  }

  function setCameraMode(next) {
    if (!CAMERA_MODES.some(m => m.id === next)) return mode;
    // Follow needs something to follow; refuse rather than sit on a dead lock.
    if (next === 'follow' && !follow && !planetNodes.length) {
      onToast?.('Select a body to follow first');
      return mode;
    }
    mode = next;
    tween = null;
    if (next === 'follow' && !follow && planetNodes.length) beginFollow(planetNodes[0]);
    if (next === 'cinematic') { cineTimer = 0; cineIndex = 0; follow = null; }
    controls.enabled = next === 'orbit' || next === 'follow';
    if (next === 'free') keys.clear();
    return mode;
  }

  function beginFollow(node) {
    follow = node;
    node.getWorldPosition(followPrev);
    const radius = node.geometry.parameters.radius * (node.parent === group ? view.planetScale : 1);
    followOffset.set(radius * 4, radius * 2.6, radius * 5.5);
  }

  function updateFree(dt) {
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1;
    const speed = Math.max(layout ? layout.framing * 0.25 : 20, 6) * boost * dt;
    const dir = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    if (keys.has('KeyW')) dir.add(fwd);
    if (keys.has('KeyS')) dir.sub(fwd);
    if (keys.has('KeyD')) dir.add(right);
    if (keys.has('KeyA')) dir.sub(right);
    if (keys.has('Space')) dir.y += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight')) dir.y -= 1;
    if (dir.lengthSq()) camera.position.addScaledVector(dir.normalize(), speed);
  }

  function updateCinematic(dt) {
    const stops = [...planetNodes, ...starNodes];
    if (!stops.length) return;
    cineTimer -= dt;
    if (cineTimer <= 0) { cineTimer = 8; cineIndex = (cineIndex + 1) % stops.length; }
    const node = stops[cineIndex];
    node.getWorldPosition(cineLook);
    const radius = node.geometry.parameters.radius;
    const sweep = Math.max(radius * 6, 9);
    cineTarget.set(
      cineLook.x + Math.cos(elapsed * 0.22) * sweep,
      cineLook.y + sweep * 0.45,
      cineLook.z + Math.sin(elapsed * 0.22) * sweep);
    // Damped lerp so a target swap glides over ~2s instead of cutting.
    const k = 1 - Math.exp(-dt * 1.6);
    camera.position.lerp(cineTarget, k);
    controls.target.lerp(cineLook, k);
    camera.lookAt(controls.target);
  }

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
      controls.enabled = mode === 'orbit' || mode === 'follow';
    }
  }

  /* ---- picking + targets ------------------------------------------ */

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

  function allTargets() {
    return [...starNodes, ...planetNodes, ...moonNodes];
  }

  function nodeForTarget(id) {
    return allTargets().find(n => n.userData.targetId === id) || null;
  }

  function focusNode(node) {
    if (!node) return false;
    beginFollow(node);
    const target = node.getWorldPosition(new THREE.Vector3());
    flyTo(target.clone().add(followOffset), target, 1.1);
    return true;
  }

  function focusPlanet(name) {
    return focusNode(planetNodes.find(p => p.userData.pick.planetName === name));
  }

  function frameSystem(dur = 1.4) {
    follow = null;
    const d = layout ? layout.framing : 60;
    flyTo(new THREE.Vector3(d * 0.35, d * 0.42, d * 0.85), new THREE.Vector3(), dur);
  }

  /* ---- public surface ---------------------------------------------- */

  return {
    get active() { return active; },
    get scene() { return scene; },
    get camera() { return camera; },
    get system() { return system; },
    get layout() { return layout; },
    get cameraMode() { return mode; },
    get view() { return { ...view }; },

    enter(target) {
      build(target);
      active = true;
      mode = 'orbit';
      galaxyControls.enabled = false;
      renderPass.scene = scene;
      renderPass.camera = camera;
      // Seat the camera wide, then ease in — the push-in that started in the
      // galaxy view visually continues through the fade.
      const d = layout.framing;
      camera.position.set(d * 0.8, d * 1.0, d * 2.0);
      camera.quaternion.identity();
      controls.target.set(0, 0, 0);
      controls.update();
      frameSystem(1.6);
    },

    exit() {
      active = false;
      tween = null;
      follow = null;
      mode = 'orbit';
      keys.clear();
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
      elapsed += dt;
      layoutOrbits(dt);          // move the worlds first, then chase them
      if (mode === 'free') updateFree(dt);
      else if (mode === 'cinematic') updateCinematic(dt);
      else updateFollow();
      updateTween(dt);
      if (mode !== 'free' && mode !== 'cinematic') controls.update();
    },

    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },

    setCameraMode,
    pick,
    focusPlanet,
    focusTarget(id) { return focusNode(nodeForTarget(id)); },
    frameSystem,

    /* Bodies / View tab plumbing */
    listTargets() {
      return allTargets().map(n => ({
        id: n.userData.targetId,
        name: n.userData.pick.moonName || n.userData.pick.planetName || system?.name || 'Star',
        kind: n.userData.targetId.split(':')[0],
        visible: n.visible,
      }));
    },
    setBodyVisible(id, visible) {
      const node = nodeForTarget(id);
      if (node) node.visible = visible;
    },
    setLabelsVisible(visible) {
      view.labels = visible;
      scene.traverse(node => { if (node.isCSS2DObject) node.visible = visible; });
    },
    setTrailsVisible(visible) {
      view.trails = visible;
      for (const trail of trailNodes) trail.visible = visible;
    },
    setPlanetScale(k) {
      view.planetScale = k;
      for (const node of planetNodes) node.scale.setScalar(k);
    },
    setOrbitScale(k) {
      view.orbitScale = k;
      applyOrbitScale();
      layoutOrbits(0);
    },

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
    // CSS2D labels are DOM; leaving them behind strands divs on screen.
    if (node.isCSS2DObject) node.element?.remove();
    if (node.geometry) node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      // Surfaces live in the shared cache and are disposed with it.
      if (material.map && !material.userData?.shared) material.map.dispose?.();
      material.dispose();
    }
  });
  root.clear?.();
}
