// Scene-aware background music + minimal top-center player.
// Shell-level singleton: created once in main.js, survives route changes so it
// can fade between scenes. All audio logic lives here; pages only bind controls.

import { buildSolarCycle, clamp01, effectiveVolume } from './audio-helpers.js';

const FADE_MS = 600;
const GAP_MS = { lobby: 5000, solar: 10000, 'big-bang': 0 };
const STORE_KEY = 'cosmicx.audio.v1';

// ---- catalog from bundled assets -------------------------------------------

const FILES = import.meta.glob('../assets/music/**/*.mp3', {
  eager: true, query: '?url', import: 'default',
});

function buildCatalog() {
  const scenes = { lobby: [], solar: [], 'big-bang': [] };
  for (const [path, url] of Object.entries(FILES)) {
    const scene = path.includes('/lobby/') ? 'lobby'
      : path.includes('/solar-system/') ? 'solar'
        : path.includes('/big-bang/') ? 'big-bang' : null;
    if (!scene) continue;
    const title = path.split('/').pop().replace(/\.mp3$/i, '');
    scenes[scene].push({ title, url });
  }
  for (const list of Object.values(scenes)) list.sort((a, b) => a.title.localeCompare(b.title));
  return scenes;
}

// ---- SVG glyphs -------------------------------------------------------------

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  prev: svg('M15 6h2v12h-2zM5 6l9 6-9 6z'),
  next: svg('M7 6h2v12H7zM19 6l-9 6 9 6z'),
  play: svg('M7 5v14l12-7z'),
  pause: svg('M7 5h4v14H7zM13 5h4v14h-4z'),
};

function paintFill(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const ratio = (Number(el.value) - min) / ((max - min) || 1);
  el.style.setProperty('--fill', `calc(7px + (100% - 14px) * ${ratio})`);
}

// ---- manager ----------------------------------------------------------------

function create() {
  const catalog = buildCatalog();
  const prefs = loadPrefs();

  const audio = new Audio();
  audio.preload = 'auto';

  let currentScene = null;
  let cycle = [];
  let index = 0;
  let currentTrack = null;
  let intentPlaying = true;   // user intent; music is on by default
  let fadeRaf = 0;
  let gapTimer = 0;
  let unlockArmed = false;

  let player = null;
  const settingsEls = {};

  function loadPrefs() {
    const out = { master: 0.5, bgm: 0.5, random: true, loop: true };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved === 'object') {
        if (Number.isFinite(saved.master)) out.master = clamp01(saved.master);
        if (Number.isFinite(saved.bgm)) out.bgm = clamp01(saved.bgm);
        if (typeof saved.random === 'boolean') out.random = saved.random;
        if (typeof saved.loop === 'boolean') out.loop = saved.loop;
      }
    } catch { /* storage blocked or malformed — defaults stand */ }
    return out;
  }

  function savePrefs() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }

  let duck = 1; // external volume multiplier (e.g. Big Bang timeline fade)
  const target = () => effectiveVolume(prefs.master, prefs.bgm) * duck;

  // Scene-driven fades (Big Bang "Future Universe") set this every frame,
  // so the volume follows the timeline instead of a fixed-length ramp.
  function setDuck(factor) {
    duck = clamp01(factor);
    if (audio.src && !audio.paused) audio.volume = target();
  }

  function ramp(to, done) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / FADE_MS);
      audio.volume = clamp01(from + (to - from) * t);
      if (t < 1) fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    };
    fadeRaf = requestAnimationFrame(step);
  }

  function clearGap() {
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = 0; }
  }

  function playTrack(track, { fade = true } = {}) {
    if (!track) return;
    clearGap();
    currentTrack = track;
    audio.src = track.url;
    audio.loop = false; // looping/gaps are handled here, not by the element
    audio.volume = fade ? 0 : target();
    const p = audio.play();
    if (fade && p) p.then(() => ramp(target())).catch(armUnlock);
    else if (p) p.catch(armUnlock);
    updatePlayer();
    refreshTrackSelect();
  }

  function buildCycleFor(scene) {
    const list = catalog[scene] || [];
    if (scene === 'solar' && prefs.random) return buildSolarCycle(list);
    return [...list];
  }

  function startScene(scene) {
    cycle = buildCycleFor(scene);
    index = 0;
    if (intentPlaying && cycle.length) playTrack(cycle[0]);
    else { currentTrack = cycle[0] || null; updatePlayer(); refreshTrackSelect(); }
  }

  function advance(step, { fade = true } = {}) {
    if (!cycle.length) return;
    index += step;
    if (index >= cycle.length) {
      if (!prefs.loop) { intentPlaying = false; updateIcon(); return; }
      cycle = buildCycleFor(currentScene);
      index = 0;
    } else if (index < 0) {
      index = cycle.length - 1;
    }
    playTrack(cycle[index], { fade });
  }

  // Big Bang music plays once: fade out over the closing seconds, then stop.
  const END_FADE_S = 2.5;
  audio.addEventListener('timeupdate', () => {
    if (currentScene !== 'big-bang' || audio.paused) return;
    const remain = audio.duration - audio.currentTime;
    if (Number.isFinite(remain) && remain < END_FADE_S) {
      cancelAnimationFrame(fadeRaf);
      audio.volume = clamp01(target() * (remain / END_FADE_S));
    }
  });

  audio.addEventListener('ended', () => {
    if (!intentPlaying) return;
    if (currentScene === 'big-bang') { intentPlaying = false; updateIcon(); return; }
    clearGap();
    const gap = GAP_MS[currentScene] ?? 0;
    gapTimer = setTimeout(() => { gapTimer = 0; advance(1); }, gap);
  });
  audio.addEventListener('playing', () => setSpin(true));
  audio.addEventListener('pause', () => setSpin(false));

  // Autoplay is usually blocked until a gesture; start on the first one.
  function armUnlock() {
    if (unlockArmed) return;
    unlockArmed = true;
    const go = () => {
      document.removeEventListener('pointerdown', go);
      document.removeEventListener('keydown', go);
      unlockArmed = false;
      if (intentPlaying) {
        if (audio.src) { const p = audio.play(); if (p) p.then(() => ramp(target())).catch(() => {}); }
        else if (currentScene) startScene(currentScene);
      }
    };
    document.addEventListener('pointerdown', go);
    document.addEventListener('keydown', go);
  }

  function fadeOutThen(done) {
    clearGap();
    if (audio.src && !audio.paused && audio.volume > 0.001) {
      ramp(0, () => { audio.pause(); done(); });
    } else {
      if (audio.src && !audio.paused) audio.pause();
      done();
    }
  }

  // ---- public actions -------------------------------------------------------

  function setScene(scene) {
    if (scene === currentScene) return;
    currentScene = scene;
    duck = 1;
    syncPlayerVisibility();
    refreshTrackSelect();
    fadeOutThen(() => startScene(scene));
  }

  function play() {
    intentPlaying = true;
    updateIcon();
    if (audio.src) {
      const p = audio.play();
      if (p) p.then(() => ramp(target())).catch(armUnlock);
    } else if (currentScene) {
      startScene(currentScene);
    }
  }

  function pause() {
    intentPlaying = false;
    updateIcon();
    fadeOutThen(() => {});
  }

  function toggle() { intentPlaying ? pause() : play(); }
  function next() { intentPlaying = true; updateIcon(); advance(1, { fade: true }); }
  function prev() { intentPlaying = true; updateIcon(); advance(-1, { fade: true }); }

  function selectTrack(i) {
    const list = catalog[currentScene] || [];
    const track = list[i];
    if (!track) return;
    intentPlaying = true;
    updateIcon();
    const inCycle = cycle.indexOf(track);
    if (inCycle >= 0) index = inCycle;
    playTrack(track);
  }

  // ---- player UI ------------------------------------------------------------

  function mountPlayer() {
    if (player || document.getElementById('musicPlayer')) return;
    player = document.createElement('div');
    player.id = 'musicPlayer';
    player.dataset.playing = 'false';
    player.setAttribute('aria-label', 'Now playing');
    player.innerHTML = `
      <span class="mp-disk" aria-hidden="true"><span class="mp-hole"></span></span>
      <span class="mp-title">—</span>
      <div class="mp-controls">
        <button class="mp-btn" type="button" data-mp="prev" aria-label="Previous track">${ICON.prev}</button>
        <button class="mp-btn" type="button" data-mp="playpause" aria-label="Pause">${ICON.pause}</button>
        <button class="mp-btn" type="button" data-mp="next" aria-label="Next track">${ICON.next}</button>
      </div>`;
    player.querySelector('[data-mp="prev"]').addEventListener('click', prev);
    player.querySelector('[data-mp="next"]').addEventListener('click', next);
    player.querySelector('[data-mp="playpause"]').addEventListener('click', toggle);
    document.body.appendChild(player);
    syncPlayerVisibility();
    updatePlayer();
  }

  // The player is only shown inside the Solar System sandbox; music itself
  // keeps playing in every scene.
  function syncPlayerVisibility() {
    if (player) player.hidden = currentScene !== 'solar';
  }

  function setSpin(on) {
    if (player) player.dataset.playing = String(on);
  }

  function updateIcon() {
    const btn = player?.querySelector('[data-mp="playpause"]');
    if (!btn) return;
    btn.innerHTML = intentPlaying ? ICON.pause : ICON.play;
    btn.setAttribute('aria-label', intentPlaying ? 'Pause' : 'Play');
  }

  function updatePlayer() {
    if (!player) return;
    player.querySelector('.mp-title').textContent = currentTrack ? currentTrack.title : '—';
    updateIcon();
  }

  // ---- settings binding (called by Solar setupSettings on each mount) --------

  function bindSettingsPanel(root) {
    const q = id => root.querySelector('#' + id);
    settingsEls.master = q('settingsMasterVol');
    settingsEls.masterVal = q('settingsMasterVolVal');
    settingsEls.bgm = q('settingsBgmVol');
    settingsEls.bgmVal = q('settingsBgmVolVal');
    settingsEls.random = q('settingsRandom');
    settingsEls.loop = q('settingsLoop');
    settingsEls.track = q('settingsTrack');

    const vol = (el, valEl, key) => {
      if (!el) return;
      el.value = String(Math.round(prefs[key] * 100));
      if (valEl) valEl.textContent = el.value + '%';
      paintFill(el);
      el.addEventListener('input', () => {
        prefs[key] = clamp01(Number(el.value) / 100);
        if (valEl) valEl.textContent = Math.round(prefs[key] * 100) + '%';
        paintFill(el);
        if (audio.src && !audio.paused) audio.volume = target();
        savePrefs();
      });
    };
    vol(settingsEls.master, settingsEls.masterVal, 'master');
    vol(settingsEls.bgm, settingsEls.bgmVal, 'bgm');

    if (settingsEls.random) {
      settingsEls.random.checked = prefs.random;
      settingsEls.random.addEventListener('change', () => {
        prefs.random = settingsEls.random.checked; savePrefs();
      });
    }
    if (settingsEls.loop) {
      settingsEls.loop.checked = prefs.loop;
      settingsEls.loop.addEventListener('change', () => {
        prefs.loop = settingsEls.loop.checked; savePrefs();
      });
    }
    if (settingsEls.track) {
      settingsEls.track.addEventListener('change', () => selectTrack(Number(settingsEls.track.value)));
    }
    refreshTrackSelect();
  }

  function refreshTrackSelect() {
    const sel = settingsEls.track;
    if (!sel || !currentScene) return;
    const list = catalog[currentScene] || [];
    sel.innerHTML = list.map((t, i) => `<option value="${i}">${t.title}</option>`).join('');
    const at = currentTrack ? list.indexOf(currentTrack) : -1;
    if (at >= 0) sel.value = String(at);
  }

  return { setScene, play, pause, toggle, next, prev, setDuck, mountPlayer, bindSettingsPanel,
    get scene() { return currentScene; }, get track() { return currentTrack; },
    _audio: audio };
}

// ---- singleton --------------------------------------------------------------

const NOOP = {
  setScene() {}, play() {}, pause() {}, toggle() {}, next() {}, prev() {}, setDuck() {},
  mountPlayer() {}, bindSettingsPanel() {}, scene: null, track: null,
};

let instance = null;

export function startMusic({ preview = false } = {}) {
  if (instance) return instance;
  instance = preview ? NOOP : create();
  return instance;
}

export function getMusic() {
  return instance || NOOP;
}
