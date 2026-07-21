import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { makeCanvas } from '../../shared/procedural-canvas.js';
import { systemViewLayout } from './systems.js';
import {
  ATMOSPHERE_SHELL, createPlanetSurface, createRingTexture, createStarSurface, makeAtmosphere,
} from './planet-textures.js';
import {
  createDustFields, createStarAura,
  createSystemSky, createWakeMaterial, disposeFxTextures, nebulaTexture,
  softPointTexture,
} from './system-fx.js';

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
  renderer, renderPass, scope, galaxyScene, galaxyCamera, galaxyControls,
  makeLabel, onPick, onToast, onBodiesChanged,
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03040a);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enabled = false;

  const ambient = new THREE.AmbientLight(0xaebcd8, 0.16);
  scene.add(ambient);

  // Environment (sky shells, nebulae, dust) is rebuilt per entered system so
  // the palette answers the host stars. FX-panel settings arrive via setFx.
  let env = null;                // { sky, dust }
  const fxOpts = { density: 1, nebulae: true, twinkle: true };
  let auras = [];                // star fresnel shells (ticked)
  let flares = [];               // three.js Lensflare objects, one per star

  const textures = new Map();
  let group = null;              // everything belonging to the entered system
  let layout = null;
  let system = null;
  let planetNodes = [];
  let moonNodes = [];
  let trailNodes = [];
  let starNodes = [];
  let coronas = [];
  let tween = null;
  let active = false;
  let elapsed = 0;

  // Sim-time multiplier from the transport (0 = paused); the orbits and the
  // environment tick against it.
  let simScale = 1;

  /* ---- Sim tab substrate: resident asteroids under stellar gravity --------
     Planets and moons stay on their rails; only these free bodies feel gravity.
     Passive: an asteroid that hits a planet/star is absorbed with a flash, never
     destroying the world. All gated by the Sim tab toggles. */
  const dynGroup = new THREE.Group();
  scene.add(dynGroup);
  const asteroids = [];          // { mesh, vel:Vector3, r }
  const attractors = [];         // { pos:Vector3, gm, soft } — the host stars
  const sysFx = [];              // transient absorb flashes (tick + dispose)
  let gravityMult = 1;
  let collisionsOn = false;
  let residentsOn = false;
  let eclipsesOn = false;
  let primaryLight = null;       // the star light that casts eclipse shadows
  // ponytail: one global GM tuned for pleasant on-screen orbits, not real units.
  const GM_UNIT = 6000;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8175, roughness: 1, metalness: 0, flatShading: true });
  const _acc = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _wp = new THREE.Vector3();

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

  /* Warm radial-gradient texture for the corona shells and the lens-flare
     elements — the As the Gods Will star recipe (createGlowTexture). */
  function glowTexture(inner, mid, outer) {
    const S = 256;
    const [canvas, ctx] = makeCanvas(S, S);
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.25, mid);
    grad.addColorStop(0.6, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(canvas);
  }

  /* Sky + dust for the entered system. Density comes from the FX panel's
     quality tier; nebula sprites reuse the shared texture cache so a
     re-enter doesn't regenerate canvases. */
  function buildEnv(target) {
    disposeEnv();
    const sky = createSystemSky({
      starColors: layout.stars.map(st => st.color),
      seed: hashSeed(target.id) % 997,
      density: fxOpts.density,
      getNebulaTexture: s => cached(`neb:${s}`, () => nebulaTexture(s)),
    });
    const dust = createDustFields({ edge: layout.edge, density: fxOpts.density });
    sky.setTwinkle(fxOpts.twinkle);
    sky.setNebulaeVisible(fxOpts.nebulae);
    dust.group.visible = fxOpts.nebulae;
    scene.add(sky.group, dust.group);
    env = { sky, dust };
  }

  function disposeEnv() {
    if (!env) return;
    scene.remove(env.sky.group, env.dust.group);
    env.sky.dispose();
    env.dust.dispose();
    env = null;
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
    planetNodes = []; moonNodes = []; trailNodes = []; starNodes = []; coronas = [];

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

      // Corona: two warm additive shells sized like the As the Gods Will sun, so
      // the star reads as a light source rather than a flat lit disc.
      const coronaTex = cached('corona', () =>
        glowTexture('rgba(255,220,160,1)', 'rgba(255,160,60,0.45)', 'rgba(255,100,30,0.12)'));
      for (const [factor, opacity, tint] of [[5.2, 0.7, 0xffb45e], [8.7, 0.32, 0xff7a2a]]) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: coronaTex, color: tint, transparent: true,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        sprite.material.userData.shared = true;   // map is cached, not per-sprite
        sprite.scale.setScalar(star.radius * factor);
        sprite.userData.breathe = { base: star.radius * factor, phase: i * 1.7 };
        mesh.add(sprite);
        coronas.push(sprite);
      }
      // Rim-only fresnel shell + diffraction spikes on top of the corona.
      const aura = createStarAura(star.radius, star.color);
      mesh.add(aura.group);
      auras.push(aura);
      attachLabel(mesh, i === 0 ? target.name : `${target.name} ${String.fromCharCode(66 + i)}`, star.radius + 1.4);
      group.add(mesh);
      starNodes.push(mesh);

      // decay 0: inverse-square across a 60-unit system would leave the outer
      // worlds black. Terminators come from surface normals, not falloff.
      const light = new THREE.PointLight(star.color, i === 0 ? 2.2 : 1.1, 0, 0);
      light.position.copy(mesh.position);
      group.add(light);
      if (i === 0) primaryLight = light;   // this one casts the eclipse shadows

      // Gravity source for the resident-asteroid substrate. Stars are static in
      // group space, so the position reference stays valid for the system's life.
      attractors.push({
        pos: mesh.position,
        gm: GM_UNIT * (target.stars[i]?.massSuns ?? 1),
        soft: Math.max(star.radius * star.radius, 1),
      });

      // The As the Gods Will lens flare: a classic multi-element flare on the
      // primary star's light, with three.js handling the occlusion test.
      if (i === 0) {
        const flare = new Lensflare();
        flare.addElement(new LensflareElement(
          cached('flare:0', () => glowTexture('rgba(255,240,200,1)', 'rgba(255,180,90,0.35)', 'rgba(255,120,40,0.08)')), 380, 0));
        flare.addElement(new LensflareElement(
          cached('flare:1', () => glowTexture('rgba(180,210,255,0.6)', 'rgba(140,180,255,0.2)', 'rgba(100,140,255,0.04)')), 90, 0.35));
        flare.addElement(new LensflareElement(
          cached('flare:2', () => glowTexture('rgba(255,200,150,0.5)', 'rgba(255,170,110,0.15)', 'rgba(255,140,80,0.03)')), 130, 0.62));
        flare.addElement(new LensflareElement(
          cached('flare:3', () => glowTexture('rgba(200,220,255,0.4)', 'rgba(170,200,255,0.12)', 'rgba(140,170,255,0.02)')), 60, 0.9));
        light.add(flare);
        flares.push(flare);
      }
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
      trail.userData.mate = mesh;   // wake head follows this world's angle

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

      let moonIdx = 0;
      for (const moon of planet.moonList) {
        // The label rides the mesh radius, not the fractional layout value —
        // otherwise a large moon's plate sinks into its own sphere.
        const moonR = Math.max(planet.radius * moon.radius * 0.9, planet.radius * 0.12);
        // Cratered dwarf surfaces off the shared cache; three variants per
        // system keep texture memory flat however many moons spawn.
        const moonMat = new THREE.MeshStandardMaterial({
          map: cached(`moon:${target.id}:${moonIdx % 3}`,
            () => createPlanetSurface('dwarf', hashSeed(target.id) + moonIdx % 3, { anisotropy })),
          roughness: 1, metalness: 0,
        });
        moonMat.userData.shared = true;   // map lives in the cache
        moonIdx += 1;
        const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(moonR, 20, 14), moonMat);
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
        attachLabel(moonMesh, moon.name, moonR + 0.4);
        mesh.add(moonMesh);
        moonNodes.push(moonMesh);
      }

      attachLabel(mesh, planet.name, planet.radius + 1.1);
      group.add(mesh);
      planetNodes.push(mesh);
    }

    if (layout.belt) group.add(buildBelt(layout.belt));

    scene.add(group);
    buildEnv(target);
    applyOrbitScale();
    layoutOrbits(0);
    // Re-establish Sim-tab state for the (re)built system.
    applyEclipseShadows();
    if (residentsOn) spawnResidents();
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
     what reads as a dusty orbital lane instead of a CAD circle. The wake
     shader brightens the stretch just behind the planet's current angle. */
  function orbitTrail(r) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    const ang = new Float32Array(n);
    for (let i = 0; i < n; i++) ang[i] = (i / n) * TAU;
    fillTrail(pos, r);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(ang, 1));
    const mat = createWakeMaterial();
    // Matches PointsMaterial's perspective sizing: size × bufferHeight/2.
    mat.uniforms.uScale.value = 0.09 * renderer.domElement.height * 0.5;
    const points = new THREE.Points(geo, mat);
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
    // Mapped: an unmapped PointsMaterial draws hard squares, which is the one
    // artefact that reads as "cheap particles" against everything else here.
    const mat = new THREE.PointsMaterial({
      map: softPointTexture(), color: 0x8d8574, size: 0.5,
      transparent: true, opacity: 0.75, depthWrite: false,
    });
    mat.userData.shared = true;      // map is the fx module singleton
    return new THREE.Points(geo, mat);
  }

  function clearGroup() {
    follow = null;                 // the followed node is about to be disposed
    disposeEnv();
    clearResidents();              // drop free bodies + transient flashes
    attractors.length = 0;         // stars are about to be disposed; re-seed on build
    primaryLight = null;
    for (const flare of flares) flare.dispose();
    flares = [];
    if (!group) return;
    scene.remove(group);
    disposeTree(group);            // also walks aura shells and corona sprites
    group = null;
    planetNodes = []; moonNodes = []; trailNodes = []; starNodes = []; coronas = [];
    auras = [];
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
    for (const sprite of coronas) {
      const b = sprite.userData.breathe;
      sprite.scale.setScalar(b.base * (1 + Math.sin(elapsed * 0.8 + b.phase) * 0.04));
    }
    // Wake heads track their worlds along the railed orbit angle.
    for (const trailPts of trailNodes) {
      const mate = trailPts.userData.mate;
      if (mate) trailPts.material.uniforms.uHead.value = mate.userData.orbit.angle % TAU;
    }
  }

  function applyOrbitScale() {
    for (const node of planetNodes) {
      node.userData.orbit.r = node.userData.orbit.base * view.orbitScale;
    }
    for (const trail of trailNodes) {
      const r = trail.userData.radius * view.orbitScale;
      fillTrail(trail.geometry.attributes.position.array, r);
      trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---- resident-asteroid substrate (Sim tab) ---------------------- */

  function gravityAt(pos, out) {
    out.set(0, 0, 0);
    for (const a of attractors) {
      _dir.copy(a.pos).sub(pos);
      const d2 = Math.max(_dir.lengthSq(), a.soft);
      out.addScaledVector(_dir.normalize(), gravityMult * a.gm / d2);
    }
    return out;
  }

  // Tangential velocity for a believable near-circular orbit about the barycentre.
  function seedCircular(body) {
    const star = attractors[0]?.pos ?? _wp.set(0, 0, 0);
    _dir.copy(body.mesh.position).sub(star); _dir.y = 0;
    if (_dir.lengthSq() < 1e-3) _dir.set(1, 0, 0);
    gravityAt(body.mesh.position, _acc);
    const r = Math.max(body.mesh.position.distanceTo(star), 0.5);
    const speed = Math.sqrt(Math.max(_acc.length(), 1e-4) * r) * (0.85 + Math.random() * 0.3);
    const tx = -_dir.z, tz = _dir.x, tl = Math.hypot(tx, tz) || 1;
    body.vel.set(tx / tl, 0, tz / tl).multiplyScalar(speed);
  }

  function spawnResidents() {
    clearResidents();
    if (!layout) return;
    const n = Math.min(14, 8 + Math.round((layout.edge || 40) / 20));
    const band = layout.belt || layout.edge * 0.8;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(rockGeo, rockMat);
      mesh.scale.setScalar(0.25 + Math.random() * 0.5);
      const a = Math.random() * TAU, r = band * (0.7 + Math.random() * 0.6);
      mesh.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 2, Math.sin(a) * r);
      dynGroup.add(mesh);
      const body = { mesh, vel: new THREE.Vector3(), r: mesh.scale.x };
      seedCircular(body);
      asteroids.push(body);
    }
  }

  function clearResidents() {
    for (const body of asteroids) dynGroup.remove(body.mesh);
    asteroids.length = 0;
    for (const fx of sysFx) fx.dispose();
    sysFx.length = 0;
  }

  function integrateAsteroid(body, sdt) {
    const steps = Math.min(24, 1 + Math.floor(sdt / 0.02));
    const h = sdt / steps;
    for (let s = 0; s < steps; s++) {
      gravityAt(body.mesh.position, _acc);
      body.vel.addScaledVector(_acc, h);
      body.mesh.position.addScaledVector(body.vel, h);
    }
    body.mesh.rotation.x += sdt; body.mesh.rotation.y += sdt * 0.7;
  }

  // Absorbed, never destructive: the asteroid vanishes in a small flash; the
  // planet/star is untouched. dynGroup lives at scene root so this is safe.
  function absorbAsteroid(body, at, color) {
    flashAt(at, color, body.r * 3 + 1);
    removeAsteroid(body);
  }

  function removeAsteroid(body) {
    const i = asteroids.indexOf(body);
    if (i >= 0) asteroids.splice(i, 1);
    dynGroup.remove(body.mesh);
  }

  function flashAt(at, color, size) {
    const S = 64;
    const [canvas, ctx] = makeCanvas(S, S);
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), color, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.position.copy(at);
    dynGroup.add(sprite);
    sysFx.push({
      t: 0, dur: 0.6,
      tick(dt) {
        this.t += dt;
        const u = this.t / this.dur;
        sprite.scale.setScalar(size * (0.4 + u));
        sprite.material.opacity = Math.max(0, 1 - u);
        return this.t >= this.dur;
      },
      dispose() { dynGroup.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose(); },
    });
  }

  function stepAsteroids(sdt) {
    const capped = Math.min(sdt, 0.4);
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const body = asteroids[i];
      integrateAsteroid(body, capped);
      const p = body.mesh.position;
      let hit = false;
      if (collisionsOn) {
        for (const s of starNodes) {
          const sr = s.geometry.parameters.radius + body.r;
          if (p.distanceToSquared(s.position) < sr * sr) { absorbAsteroid(body, s.position.clone(), new THREE.Color(0xffd9a0)); hit = true; break; }
        }
        if (!hit) for (const planet of planetNodes) {
          planet.getWorldPosition(_wp);
          const pr = planet.geometry.parameters.radius * planet.scale.x + body.r;
          if (p.distanceToSquared(_wp) < pr * pr) { absorbAsteroid(body, _wp.clone(), new THREE.Color(0xffcaa0)); hit = true; break; }
        }
      }
      if (hit) continue;
      if (p.lengthSq() > (layout.framing * 6) ** 2) removeAsteroid(body);
    }
  }

  function stepSysFx(dt) {
    for (let i = sysFx.length - 1; i >= 0; i--) {
      if (sysFx[i].tick(dt)) { sysFx[i].dispose(); sysFx.splice(i, 1); }
    }
  }

  /* ---- eclipses: real shadow maps, gated by the toggle ------------- */

  function applyEclipseShadows() {
    renderer.shadowMap.enabled = eclipsesOn;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (primaryLight) {
      primaryLight.castShadow = eclipsesOn;
      if (eclipsesOn && layout) {
        primaryLight.shadow.mapSize.set(1024, 1024);
        primaryLight.shadow.camera.near = layout.starRadius * 1.2;
        primaryLight.shadow.camera.far = layout.framing * 4;
        primaryLight.shadow.bias = -0.002;
      }
    }
    for (const p of planetNodes) { p.castShadow = eclipsesOn; p.receiveShadow = eclipsesOn; }
    for (const m of moonNodes) { m.castShadow = eclipsesOn; m.receiveShadow = eclipsesOn; }
  }

  function eclipseSupport() {
    if (moonNodes.length) return 'lunar';
    if (planetNodes.length) return 'transit';
    return null;
  }

  // Align a moon (lunar eclipse) or the planet itself (transit) onto the
  // star->body line so a real shadow falls, and frame it. Enables shadows if off.
  function triggerEclipse() {
    const kind = eclipseSupport();
    if (!kind) return null;
    if (!eclipsesOn) { eclipsesOn = true; applyEclipseShadows(); }
    let planet = planetNodes.find(p => moonNodes.some(m => m.parent === p)) || planetNodes[0];
    if (!planet) return null;
    planet.getWorldPosition(_wp);
    const starAngle = Math.atan2(_wp.z, _wp.x);   // star sits at origin
    if (kind === 'lunar') {
      const moon = moonNodes.find(m => m.parent === planet) || moonNodes[0];
      // Put the moon on the sunward side of its planet so it casts onto the world.
      moon.userData.moon.angle = starAngle + Math.PI;
      layoutOrbits(0);
      focusNode(planet);
      return { ok: true, label: 'lunar eclipse' };
    }
    // transit: leave the planet where it is and just frame the star line
    focusNode(planet);
    return { ok: true, label: 'transit' };
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
    // Follow needs something to follow; fall back to orbit rather than sit on a
    // dead lock, mirroring the As the Gods Will camera guard.
    if (next === 'follow' && !follow && !planetNodes.length) {
      onToast?.('Select a body to follow first');
      next = 'orbit';
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
    const radius = node.geometry.parameters.radius * (node.parent === group ? view.planetScale : 1);
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

    update(dt, opts = {}) {
      if (!active) return;
      elapsed += dt;
      simScale = opts.simScale ?? simScale;
      gravityMult = opts.gravity ?? gravityMult;
      collisionsOn = opts.collisions ?? collisionsOn;
      const sdt = dt * simScale;             // 0 when paused → orbits freeze
      layoutOrbits(sdt);
      if (residentsOn && sdt > 0) stepAsteroids(sdt);
      stepSysFx(dt);                         // absorb flashes animate on real time
      // Environment breathes on real time too — a paused sim still twinkles.
      if (env) {
        env.sky.tick(dt, elapsed, renderer.getPixelRatio());
        env.dust.tick(dt, elapsed);
      }
      for (const aura of auras) aura.tick(elapsed);
      // Camera runs on real dt so it never freezes with the sim clock.
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

    /* Sim tab: automatic events + gravity */
    setResidentAsteroids(on) {
      residentsOn = on;
      if (on) spawnResidents(); else clearResidents();
    },
    setGravity(mult) { gravityMult = mult; },
    setCollisions(on) { collisionsOn = on; },
    setEclipses(on) { eclipsesOn = on; applyEclipseShadows(); },
    triggerEclipse,
    eclipseSupport,
    get residentCount() { return asteroids.length; },

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
    /* FX-panel plumbing: density re-seeds the sky, toggles flip in place. */
    setFx({ density, nebulae, twinkle } = {}) {
      const rebuild = density !== undefined && density !== fxOpts.density;
      if (density !== undefined) fxOpts.density = density;
      if (nebulae !== undefined) fxOpts.nebulae = nebulae;
      if (twinkle !== undefined) fxOpts.twinkle = twinkle;
      if (!env) return;
      if (rebuild && system) { buildEnv(system); return; }
      env.sky.setTwinkle(fxOpts.twinkle);
      env.sky.setNebulaeVisible(fxOpts.nebulae);
      env.dust.group.visible = fxOpts.nebulae;
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
      clearGroup();                 // disposes the entered system + its env
      scene.remove(dynGroup);
      rockGeo.dispose();
      rockMat.dispose();
      controls.dispose();
      scene.remove(ambient);
      for (const tex of textures.values()) tex.dispose();
      textures.clear();
      disposeFxTextures();          // module-level soft-point / spike singletons
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
