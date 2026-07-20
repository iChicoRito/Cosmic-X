import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeCanvas } from '../../shared/procedural-canvas.js';
import { systemViewLayout } from './systems.js';
import {
  ATMOSPHERE_SHELL, createPlanetSurface, createRingTexture, createStarSurface, makeAtmosphere,
} from './planet-textures.js';
import {
  createCometTail, createDustFields, createShockwave, createStarAura,
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
  renderer, renderPass, flarePass, scope, galaxyScene, galaxyCamera, galaxyControls,
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
  let cometTails = [];           // tails for layout comets, parallel to cometNodes
  let flareStrength = 0;         // smoothed toward its per-frame target

  // Spawned bodies and transient effects live here, at scene root rather than in
  // `group`, so `group`'s disposeTree never eats the shared rock geo/material and
  // a system rebuild doesn't silently wipe an in-flight impact.
  const dynGroup = new THREE.Group();
  scene.add(dynGroup);

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

  /* ---- gameplay substrate (spawn / impact / laser / gravity) ------ */
  // Created systems get the As the Gods Will god-mode tools against this scene's
  // simpler mesh model: free bodies fall under a hand-tuned gravity field, laser
  // and impacts share one damage ladder, and transient effects live in the scene.
  const dynBodies = [];          // free bodies: asteroids, comets, converted planets
  const holes = [];              // spawned in-system black holes (extra attractors)
  const attractors = [];         // { pos:Vector3, gm, soft } — stars + holes
  const sysEffects = [];         // transient flashes / debris / beams (tick+dispose)
  let simScale = 1;              // sim-time multiplier from the transport (0 = paused)
  let gravityMult = 1;
  let collisionsOn = true;
  let laserCooldown = 0;
  // ponytail: one global GM tuned for pleasant on-screen orbits, not real units —
  // the scene's distances are already log-compressed and cosmetic. Bump if bodies
  // crawl, cut if they slingshot. Circular speed anywhere is sqrt(gm·mass/r).
  const GM_UNIT = 6000;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8175, roughness: 1, metalness: 0, flatShading: true });
  const _acc = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _wp = new THREE.Vector3();
  const _wp2 = new THREE.Vector3();

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
      // Aura: rim-only fresnel shell + diffraction spikes. Transparent across
      // the disc, so it adds presence without re-fattening the halo.
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

      // Gravity source for the spawn/impact substrate. Stars are static in group
      // space, so the position reference stays valid for the system's lifetime.
      attractors.push({
        pos: mesh.position,
        gm: GM_UNIT * (target.stars[i]?.massSuns ?? 1),
        soft: Math.max(star.radius * star.radius, 1),
      });
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
      // Tail lives beside the sprite, not inside it — the sprite's own scale
      // must not stretch the fan. aimed every frame in layoutOrbits.
      const tail = createCometTail(layout.starRadius);
      group.add(tail.group);
      cometTails.push(tail);
    }

    scene.add(group);
    buildEnv(target);
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
    resetGameplay();               // drop spawned bodies, holes, effects, attractors
    disposeEnv();
    flareStrength = 0;
    if (flarePass) flarePass.uniforms.uStrength.value = 0;
    if (!group) return;
    scene.remove(group);
    disposeTree(group);            // also walks aura shells and tail points
    group = null;
    planetNodes = []; moonNodes = []; cometNodes = []; trailNodes = []; starNodes = []; coronas = [];
    auras = []; cometTails = [];
  }

  /* ---- motion ------------------------------------------------------ */

  function layoutOrbits(dt) {
    // Orbital rates are cosmetic: real periods span four orders of magnitude,
    // which would leave the outer worlds visually frozen.
    for (const node of planetNodes) {
      if (node.userData.dyn) continue;      // gravity owns this one now
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
    for (let c = 0; c < cometNodes.length; c++) {
      const comet = cometNodes[c];
      const orbit = comet.userData.orbit;
      orbit.angle += dt * (TAU / orbit.period) * 90;
      comet.position.set(Math.cos(orbit.angle) * orbit.r, orbit.r * 0.06, Math.sin(orbit.angle) * orbit.r);
      const tail = cometTails[c];
      if (tail) {
        tail.group.position.copy(comet.position);
        tail.aim(comet.position, _wp2.set(0, 0, 0));
      }
    }
    for (const sprite of coronas) {
      const b = sprite.userData.breathe;
      sprite.scale.setScalar(b.base * (1 + Math.sin(elapsed * 0.8 + b.phase) * 0.04));
    }
    // Wake heads track their worlds; a destroyed or free-falling planet just
    // leaves its lane at the last railed angle.
    for (const trailPts of trailNodes) {
      const mate = trailPts.userData.mate;
      if (mate && !mate.userData.dead && !mate.userData.dyn) {
        trailPts.material.uniforms.uHead.value = mate.userData.orbit.angle % TAU;
      }
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

  /* ---- gameplay: gravity, spawn, impact, laser -------------------- */

  function resetGameplay() {
    for (const b of dynBodies) if (!b.isPlanet) b.dispose?.();
    for (const h of holes) h.dispose?.();
    for (const fx of sysEffects) fx.dispose?.();
    dynBodies.length = 0; holes.length = 0; sysEffects.length = 0; attractors.length = 0;
    laserCooldown = 0;
  }

  function gravityAt(pos, out) {
    out.set(0, 0, 0);
    for (const a of attractors) {
      _dir.copy(a.pos).sub(pos);
      const d2 = Math.max(_dir.lengthSq(), a.soft);
      out.addScaledVector(_dir.normalize(), gravityMult * a.gm / d2);
    }
    return out;
  }

  // Speed of a circular orbit at a point, for seeding spawns and converted
  // planets so they start on a believable arc instead of dropping straight in.
  function circularSpeed(pos) {
    gravityAt(pos, _acc);
    const r = Math.max(pos.distanceTo(attractors[0]?.pos ?? pos), 0.5);
    return Math.sqrt(Math.max(_acc.length(), 1e-4) * r);
  }

  function seedOrbitalVelocity(body, frac = 1) {
    const star = attractors[0]?.pos ?? _wp2.set(0, 0, 0);
    _dir.copy(body.mesh.position).sub(star); _dir.y = 0;
    if (_dir.lengthSq() < 1e-3) _dir.set(1, 0, 0);
    const tx = -_dir.z, tz = _dir.x, tl = Math.hypot(tx, tz) || 1;
    body.vel.set(tx / tl, 0, tz / tl).multiplyScalar(circularSpeed(body.mesh.position) * frac);
  }

  function makeBody(mesh, { mass, r, kind, isPlanet = false }) {
    return {
      mesh, vel: new THREE.Vector3(), mass, r, kind, isPlanet,
      isProjectile: false, homing: false, destructive: false, target: null,
      dispose() { dynGroup.remove(mesh); },   // shared rock geo/mat stay alive
    };
  }

  function integrate(body, sdt) {
    const steps = Math.min(48, 1 + Math.floor(sdt / 0.015));
    const h = sdt / steps;
    for (let s = 0; s < steps; s++) {
      if (body.homing && body.target && !body.target.userData.dead) {
        body.target.getWorldPosition(_wp2);
        _dir.copy(_wp2).sub(body.mesh.position).normalize().multiplyScalar(body.vel.length());
        body.vel.lerp(_dir, 0.05);            // terminal guidance toward the target
      }
      gravityAt(body.mesh.position, _acc);
      body.vel.addScaledVector(_acc, h);
      body.mesh.position.addScaledVector(body.vel, h);
    }
    body.mesh.rotation.x += sdt * 1.3;
    body.mesh.rotation.y += sdt * 0.9;
  }

  function collide(body) {
    if (!collisionsOn && !body.isProjectile) return false;
    const p = body.mesh.position;
    for (const s of starNodes) {
      const sr = s.geometry.parameters.radius * 1.04 + body.r;
      if (p.distanceToSquared(s.position) < sr * sr) { absorb(body, s.position, s.material.color); return true; }
    }
    for (const h of holes) {
      if (p.distanceToSquared(h.position) < h.userData.grab * h.userData.grab) { absorb(body, h.position, null); return true; }
    }
    for (const planet of planetNodes) {
      if (planet === body.mesh || planet.userData.dead) continue;
      const pr = planet.geometry.parameters.radius * planet.scale.x + body.r;
      planet.getWorldPosition(_wp);
      if (p.distanceToSquared(_wp) < pr * pr) { impactPlanet(body, planet, _wp); return true; }
    }
    return false;
  }

  function absorb(body, at, color) {
    flash(at, color ? new THREE.Color(color) : new THREE.Color(0xffffff), body.r * 3 + 1.5);
    removeBody(body);
  }

  function impactPlanet(body, planet, at) {
    const speed = body.vel.length();
    const energy = 0.5 * body.mass * speed * speed;
    const planetR = planet.geometry.parameters.radius;
    const threshold = 45 * planetR * planetR * planetR;   // volume proxy for "toughness"
    flash(at, new THREE.Color(0xffd9a0), planetR * 2 + 2);
    spawnDebris(at, body.vel, Math.min(26, 8 + Math.floor(energy / 40)));
    const destroyed = energy > threshold || body.destructive;
    removeBody(body);
    if (destroyed) destroyPlanetNode(planet);
    else scorch(planet);
    onBodiesChanged?.();
  }

  function scorch(planet) {
    if (planet.material?.color) planet.material.color.multiplyScalar(0.72);
  }

  function destroyPlanetNode(planet) {
    if (planet.userData.dead) return;
    planet.userData.dead = true;
    planet.getWorldPosition(_wp);
    flash(_wp.clone(), new THREE.Color(0xffb060), planet.geometry.parameters.radius * 4 + 4);
    spawnDebris(_wp, _wp2.set(0, 0, 0), 30);
    for (let i = moonNodes.length - 1; i >= 0; i--) if (moonNodes[i].parent === planet) moonNodes.splice(i, 1);
    const pi = planetNodes.indexOf(planet);
    if (pi >= 0) planetNodes.splice(pi, 1);
    const di = dynBodies.findIndex(b => b.mesh === planet);
    if (di >= 0) dynBodies.splice(di, 1);
    if (follow === planet) { follow = null; mode = 'orbit'; controls.enabled = true; }
    group.remove(planet);
    disposeTree(planet);
  }

  function removeBody(body) {
    if (body.isPlanet) { destroyPlanetNode(body.mesh); return; }
    const i = dynBodies.indexOf(body);
    if (i >= 0) dynBodies.splice(i, 1);
    body.dispose?.();
  }

  function flash(at, color, size) {
    sysEffects.push(createShockwave(at, size * 2.2, dynGroup));
    const sprite = glowSprite(color.getHex(), size * 0.4);
    sprite.material.opacity = 1;
    sprite.position.copy(at);
    dynGroup.add(sprite);
    sysEffects.push({
      t: 0, dur: 0.7,
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

  function spawnDebris(at, baseVel, count) {
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(4 + Math.random() * 6).addScaledVector(baseVel, 0.2));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffcaa0, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    dynGroup.add(points);
    sysEffects.push({
      t: 0, dur: 1.6,
      tick(dt) {
        this.t += dt;
        const arr = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          arr[i * 3] += vel[i].x * dt; arr[i * 3 + 1] += vel[i].y * dt; arr[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        points.material.opacity = Math.max(0, 1 - this.t / this.dur);
        return this.t >= this.dur;
      },
      dispose() { dynGroup.remove(points); geo.dispose(); points.material.dispose(); },
    });
  }

  function spawnAsteroid(fromCamera = true) {
    if (!layout) return null;
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.scale.setScalar(0.3 + Math.random() * 0.5);
    if (fromCamera) {
      camera.getWorldDirection(_dir);
      mesh.position.copy(camera.position).addScaledVector(_dir, layout.starRadius * 2);
    } else {
      const a = Math.random() * TAU, r = layout.edge * (0.6 + Math.random() * 0.4);
      mesh.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 2, Math.sin(a) * r);
    }
    dynGroup.add(mesh);
    const body = makeBody(mesh, { mass: 0.4, r: mesh.scale.x, kind: 'asteroid' });
    seedOrbitalVelocity(body, 0.85 + Math.random() * 0.4);
    dynBodies.push(body);
    onBodiesChanged?.();
    return body;
  }

  function spawnComet() {
    if (!layout) return null;
    const a = Math.random() * TAU, r = layout.edge * (1.0 + Math.random() * 0.3);
    const sprite = glowSprite(0xdcefff, layout.starRadius * 0.5);
    sprite.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dynGroup.add(sprite);
    const tail = createCometTail(layout.starRadius);
    dynGroup.add(tail.group);
    const body = makeBody(sprite, { mass: 0.2, r: 0.4, kind: 'comet' });
    body.tail = tail;
    body.dispose = () => {
      dynGroup.remove(sprite, tail.group);
      sprite.material.map?.dispose(); sprite.material.dispose();
      tail.dispose();
    };
    seedOrbitalVelocity(body, 0.5);       // sub-circular so it dives on an eccentric arc
    dynBodies.push(body);
    onBodiesChanged?.();
    return body;
  }

  function spawnBlackHole(massMult = 40) {
    if (!layout) return null;
    camera.getWorldDirection(_dir);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(layout.starRadius * 0.5, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0x05060a }));
    core.position.copy(camera.position).addScaledVector(_dir, layout.framing * 0.4);
    core.position.y = 0;
    const disk = glowSprite(0x7fb2ff, layout.starRadius * 2.4);
    core.add(disk);
    core.userData.grab = layout.starRadius * 0.7;
    core.dispose = () => {
      dynGroup.remove(core); core.geometry.dispose(); core.material.dispose();
      disk.material.map?.dispose(); disk.material.dispose();
    };
    dynGroup.add(core);
    holes.push(core);
    attractors.push({ pos: core.position, gm: GM_UNIT * massMult, soft: (layout.starRadius * 0.5) ** 2 });
    for (const p of [...planetNodes]) makeDynamic(p);   // the whole system goes free-fall
    onToast?.('A black hole tears open the system');
    onBodiesChanged?.();
    return core;
  }

  function makeDynamic(planet) {
    if (planet.userData.dyn || planet.userData.dead) return;
    planet.userData.dyn = true;
    const body = makeBody(planet, {
      mass: 6, r: planet.geometry.parameters.radius * planet.scale.x, kind: 'planet', isPlanet: true,
    });
    seedOrbitalVelocity(body, 1);
    dynBodies.push(body);
  }

  function launchImpactor(targetId, opts = {}) {
    const target = nodeForTarget(targetId) || planetNodes[0];
    if (!target || !layout) { onToast?.('No world to strike'); return null; }
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.scale.setScalar(opts.size ?? 0.5);
    const a = Math.random() * TAU, ring = layout.edge * 1.1;
    mesh.position.set(Math.cos(a) * ring, (Math.random() - 0.5) * 3, Math.sin(a) * ring);
    dynGroup.add(mesh);
    const body = makeBody(mesh, { mass: opts.mass ?? 1.4, r: mesh.scale.x, kind: 'impactor' });
    body.isProjectile = true;
    body.target = target;
    body.homing = opts.homing ?? true;
    target.getWorldPosition(_wp);
    _dir.copy(_wp).sub(mesh.position).normalize();
    body.vel.copy(_dir).multiplyScalar((opts.speed ?? 1) * circularSpeed(mesh.position) * 2.4);
    dynBodies.push(body);
    onBodiesChanged?.();
    return body;
  }

  function fireLaser(targetId, opts = {}) {
    if (laserCooldown > 0 || !active) return false;
    const target = nodeForTarget(targetId) || planetNodes[0] || starNodes[0];
    if (!target) { onToast?.('No target locked'); return false; }
    laserCooldown = 0.35;
    const width = opts.width ?? 0.4;
    const color = opts.color ?? 0xff4d6d;
    const dur = opts.duration ?? 1.1;
    camera.getWorldDirection(_dir);
    const start = camera.position.clone().addScaledVector(_dir, layout ? layout.starRadius : 1).add(_wp2.set(0, -0.4, 0));
    const beam = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreCyl = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.35, width * 0.35, 1, 8, 1, true), coreMat);
    const glowCyl = new THREE.Mesh(new THREE.CylinderGeometry(width, width, 1, 8, 1, true), glowMat);
    beam.add(coreCyl, glowCyl);
    dynGroup.add(beam);
    const up = new THREE.Vector3(0, 1, 0);
    const place = () => {
      target.getWorldPosition(_wp);
      const len = start.distanceTo(_wp);
      beam.position.copy(start).add(_wp).multiplyScalar(0.5);
      beam.scale.set(1, len, 1);
      beam.quaternion.setFromUnitVectors(up, _wp.clone().sub(start).normalize());
    };
    place();
    sysEffects.push({
      t: 0, dur,
      tick(dt) {
        this.t += dt;
        if (!target.userData.dead) place();
        const u = this.t / this.dur;
        coreMat.opacity = Math.max(0, 1 - u);
        glowMat.opacity = Math.max(0, 0.5 * (1 - u));
        return this.t >= this.dur;
      },
      dispose() { dynGroup.remove(beam); coreCyl.geometry.dispose(); glowCyl.geometry.dispose(); coreMat.dispose(); glowMat.dispose(); },
    });
    target.getWorldPosition(_wp);
    flash(_wp.clone(), new THREE.Color(color), (target.geometry?.parameters?.radius ?? 1) * 1.5 + 1);
    if (opts.destructive !== false && !starNodes.includes(target)) {
      const pr = target.geometry.parameters.radius;
      if ((opts.power ?? 1) * 3 > pr) destroyPlanetNode(target);
      else scorch(target);
      onBodiesChanged?.();
    }
    return true;
  }

  function clearSpawned() {
    for (const b of dynBodies) {
      if (b.isPlanet) b.mesh.userData.dyn = false;   // hand converted planets back to rails
      else b.dispose?.();
    }
    dynBodies.length = 0;
    for (const h of holes) {
      const ai = attractors.findIndex(a => a.pos === h.position);
      if (ai >= 0) attractors.splice(ai, 1);
      h.dispose?.();
    }
    holes.length = 0;
    for (const fx of sysEffects) fx.dispose?.();
    sysEffects.length = 0;
    onBodiesChanged?.();
  }

  function stepPhysics(sdt) {
    const capped = Math.min(sdt, 0.4);       // a huge speed tier must not tunnel bodies
    for (let i = dynBodies.length - 1; i >= 0; i--) {
      const body = dynBodies[i];
      integrate(body, capped);
      if (body.tail) {
        body.tail.group.position.copy(body.mesh.position);
        body.tail.aim(body.mesh.position, attractors[0]?.pos ?? _wp2.set(0, 0, 0));
      }
      if (collide(body)) continue;
      if (body.mesh.position.lengthSq() > (layout.framing * 6) ** 2) removeBody(body);
    }
  }

  function updateSysEffects(dt) {
    for (let i = sysEffects.length - 1; i >= 0; i--) {
      if (sysEffects[i].tick(dt)) { sysEffects[i].dispose(); sysEffects.splice(i, 1); }
    }
  }

  /* ---- lens flare / light scattering ------------------------------ */

  const _flareNdc = new THREE.Vector3();
  const _flareWhite = new THREE.Color(0xffffff);

  /* Screen-space uniforms for the composer's flare pass: fades at the frame
     edge, scales with the star's apparent size, and occludes behind planets
     via one raycast per frame. Smoothing hides all the binary flips. */
  function updateFlare(dt) {
    if (!flarePass) return;
    let target = 0;
    const star = starNodes[0];
    if (flarePass.enabled && star) {
      star.getWorldPosition(_wp);
      camera.getWorldDirection(_dir);
      _wp2.copy(_wp).sub(camera.position);
      const starDist = _wp2.length();
      if (_dir.dot(_wp2) > 0 && starDist > 1e-3) {
        _flareNdc.copy(_wp).project(camera);
        const edgeFade =
          (1 - THREE.MathUtils.smoothstep(Math.abs(_flareNdc.x), 0.75, 1.2)) *
          (1 - THREE.MathUtils.smoothstep(Math.abs(_flareNdc.y), 0.75, 1.2));
        if (edgeFade > 0) {
          raycaster.set(camera.position, _wp2.normalize());
          raycaster.far = starDist - star.geometry.parameters.radius;
          const blocked = raycaster.intersectObjects(planetNodes, false).length > 0;
          raycaster.far = Infinity;
          if (!blocked) {
            const apparent = THREE.MathUtils.clamp(
              star.geometry.parameters.radius * 30 / starDist, 0.25, 1);
            target = 0.42 * edgeFade * apparent;
            flarePass.uniforms.uLightPos.value.set(
              (_flareNdc.x + 1) / 2, (_flareNdc.y + 1) / 2);
            flarePass.uniforms.uColor.value
              .copy(star.material.color).lerp(_flareWhite, 0.35);
            flarePass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
          }
        }
      }
    }
    flareStrength += (target - flareStrength) * (1 - Math.exp(-dt * 8));
    flarePass.uniforms.uStrength.value = flareStrength;
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
      gravityMult = opts.gravityMult ?? gravityMult;
      collisionsOn = opts.collisions ?? collisionsOn;
      const sdt = dt * simScale;             // 0 when paused → orbits and physics freeze
      layoutOrbits(sdt);                     // move the worlds first, then chase them
      if (sdt > 0) stepPhysics(sdt);
      updateSysEffects(dt);                  // effects animate in real time
      // Environment breathes on real time too — a paused sim still twinkles.
      if (env) {
        env.sky.tick(dt, elapsed, renderer.getPixelRatio());
        env.dust.tick(dt, elapsed);
      }
      for (const aura of auras) aura.tick(elapsed);
      updateFlare(dt);
      laserCooldown = Math.max(0, laserCooldown - dt);
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

    /* Gameplay — the As the Gods Will tools, against this scene */
    spawnAsteroid,
    spawnComet,
    spawnBlackHole,
    launchImpactor,
    fireLaser,
    makeDynamic,
    clearSpawned,
    get dynCount() { return dynBodies.length; },
    get holeCount() { return holes.length; },
    get effectCount() { return sysEffects.length; },

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
      clearGroup();                 // also resets the gameplay substrate + env
      scene.remove(dynGroup);
      rockGeo.dispose();
      rockMat.dispose();
      controls.dispose();
      scene.remove(ambient);
      for (const tex of textures.values()) tex.dispose();
      textures.clear();
      disposeFxTextures();          // module-level soft-point / spike / shock singletons
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
