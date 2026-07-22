export function solarTemplate() {
  return String.raw`
<dialog id="fullscreenNotice" aria-labelledby="fullscreenNoticeTitle">
  <div class="fullscreen-notice-body">
    <h2 id="fullscreenNoticeTitle">Fullscreen recommended</h2>
    <p>For the best experience, use fullscreen mode. CosmicX will enter fullscreen when you press Got it.</p>
    <button id="fullscreenNoticeDismiss" class="menu-btn" type="button">Got it</button>
  </div>
</dialog>

<dialog id="settingsDialog" aria-labelledby="settingsTitle">
  <header class="settings-header">
    <h2 id="settingsTitle">Settings</h2>
    <button id="settingsClose" class="icon-btn" type="button" aria-label="Close settings">&times;</button>
  </header>
  <div class="settings-tabs" role="tablist" aria-label="Settings categories">
    <button id="settingsTabDisplay" class="settings-tab" type="button" role="tab"
      aria-selected="true" aria-controls="settingsPanelDisplay">Display</button>
    <button id="settingsTabGraphics" class="settings-tab" type="button" role="tab"
      aria-selected="false" aria-controls="settingsPanelGraphics" tabindex="-1">Graphics</button>
    <button id="settingsTabCamera" class="settings-tab" type="button" role="tab"
      aria-selected="false" aria-controls="settingsPanelCamera" tabindex="-1">Camera</button>
    <button id="settingsTabInterface" class="settings-tab" type="button" role="tab"
      aria-selected="false" aria-controls="settingsPanelInterface" tabindex="-1">Interface</button>
    <button id="settingsTabAudio" class="settings-tab" type="button" role="tab"
      aria-selected="false" aria-controls="settingsPanelAudio" tabindex="-1">Audio</button>
  </div>
  <div class="settings-panels">
    <section id="settingsPanelDisplay" class="settings-panel" role="tabpanel"
      aria-labelledby="settingsTabDisplay">
      <label class="settings-wide" for="settingsDisplay">Display mode
        <select id="settingsDisplay">
          <option value="windowed">Windowed</option>
          <option value="fullscreen">Fullscreen</option>
        </select>
      </label>
      <p class="settings-help settings-wide">Fullscreen changes require a direct user action and can always be exited with Escape.</p>
    </section>

    <section id="settingsPanelGraphics" class="settings-panel" role="tabpanel"
      aria-labelledby="settingsTabGraphics" hidden>
      <label for="settingsQuality">Overall preset
        <select id="settingsQuality">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <div class="row"><span>FXAA anti-aliasing</span>
        <label class="switch"><input id="settingsAntialiasing" type="checkbox" aria-label="FXAA anti-aliasing"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsBloom">Bloom intensity</label><output class="value" id="settingsBloomVal"></output></div>
        <input id="settingsBloom" type="range" min="0" max="3" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsDensity">Particle density</label><output class="value" id="settingsDensityVal"></output></div>
        <input id="settingsDensity" type="range" min="0.3" max="2" step="0.1">
      </div>
      <div class="row"><span>Asteroid belt</span>
        <label class="switch"><input id="settingsBelt" type="checkbox" aria-label="Asteroid belt visibility"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Nebulas &amp; dust</span>
        <label class="switch"><input id="settingsNebulas" type="checkbox" aria-label="Nebulas and dust visibility"><span class="track"></span><span class="thumb"></span></label>
      </div>
    </section>

    <section id="settingsPanelCamera" class="settings-panel" role="tabpanel"
      aria-labelledby="settingsTabCamera" hidden>
      <div class="slider-row">
        <div class="row"><label for="settingsMouseSensitivity">Free-look sensitivity</label><output class="value" id="settingsMouseSensitivityVal"></output></div>
        <input id="settingsMouseSensitivity" type="range" min="0.25" max="2" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsCameraSpeed">Free-flight speed</label><output class="value" id="settingsCameraSpeedVal"></output></div>
        <input id="settingsCameraSpeed" type="range" min="0.25" max="3" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsRotationSpeed">Orbit rotation speed</label><output class="value" id="settingsRotationSpeedVal"></output></div>
        <input id="settingsRotationSpeed" type="range" min="0.25" max="2" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsPanSpeed">Pan speed</label><output class="value" id="settingsPanSpeedVal"></output></div>
        <input id="settingsPanSpeed" type="range" min="0.25" max="2" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsZoomSpeed">Zoom speed</label><output class="value" id="settingsZoomSpeedVal"></output></div>
        <input id="settingsZoomSpeed" type="range" min="0.25" max="2" step="0.05">
      </div>
    </section>

    <section id="settingsPanelInterface" class="settings-panel" role="tabpanel"
      aria-labelledby="settingsTabInterface" hidden>
      <div class="row"><span>Show HUD</span>
        <label class="switch"><input id="settingsHUD" type="checkbox" aria-label="Show HUD"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Show timeline</span>
        <label class="switch"><input id="settingsTimeline" type="checkbox" aria-label="Show timeline"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Show object labels</span>
        <label class="switch"><input id="settingsLabels" type="checkbox" aria-label="Show object labels"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Show collision warnings</span>
        <label class="switch"><input id="settingsWarnings" type="checkbox" aria-label="Show collision warnings"><span class="track"></span><span class="thumb"></span></label>
      </div>
    </section>

    <section id="settingsPanelAudio" class="settings-panel" role="tabpanel"
      aria-labelledby="settingsTabAudio" hidden>
      <div class="slider-row">
        <div class="row"><label for="settingsMasterVol">Master volume</label><output class="value" id="settingsMasterVolVal"></output></div>
        <input id="settingsMasterVol" type="range" min="0" max="100" step="1">
      </div>
      <div class="slider-row">
        <div class="row"><label for="settingsBgmVol">Background music volume</label><output class="value" id="settingsBgmVolVal"></output></div>
        <input id="settingsBgmVol" type="range" min="0" max="100" step="1">
      </div>
      <div class="row"><span>Random playback</span>
        <label class="switch"><input id="settingsRandom" type="checkbox" aria-label="Random music playback"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Loop playlist</span>
        <label class="switch"><input id="settingsLoop" type="checkbox" aria-label="Loop music playlist"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <label class="settings-wide" for="settingsTrack">Now playing
        <select id="settingsTrack" aria-label="Select music track"></select>
      </label>
      <p class="settings-help settings-wide">Random playback and looping apply to the Solar System playlist. Each scene fades between tracks automatically.</p>
    </section>
  </div>
</dialog>

<iframe id="bigbangPreview" class="mode-preview" data-src="?preview=1#/big-bang"
  title="Animated Big Bang preview" aria-hidden="true" tabindex="-1"></iframe>
<iframe id="creatorPreview" class="mode-preview" data-src="?preview=1#/creator"
  title="Animated Creator galaxy preview" aria-hidden="true" tabindex="-1"></iframe>

<!-- Title screen -->
<div id="title">
  <button id="titleBackBtn" class="mode-back" type="button">&larr; Back to Title Screen</button>
  <div class="title-card">
    <h1><span id="titleText">CosmicX</span></h1>
    <p class="tagline"><span id="taglineText">A live model of our cosmic neighborhood</span></p>
    <div class="stage-wrap">
      <div class="stage" id="stageStart">
        <div class="title-actions">
          <button id="enterBtn" class="menu-btn" type="button">Start</button>
          <button id="settingsBtn" class="menu-btn" type="button"
            aria-haspopup="dialog" aria-controls="settingsDialog">Settings</button>
        </div>
      </div>
    </div>
  </div>
  <div class="mode-bar">
    <p class="mode-hint">Choose your simulation mode</p>
    <div class="mode-grid">
      <button id="startBtn" class="mode-card">
        <span class="mode-txt"><b>As the Gods Will</b><span>An immersive journey through the planets and beyond.</span></span>
        <span class="mode-play" aria-hidden="true"><svg viewBox="0 0 10 12" width="11" height="13"><path d="M0 0 10 6 0 12Z" fill="currentColor"/></svg>PLAY</span>
      </button>
      <button id="creatorBtn" class="mode-card">
        <span class="mode-txt"><b>Become the Creator</b><span>Design, evolve, and rule your own galaxy.</span></span>
        <span class="mode-play" aria-hidden="true"><svg viewBox="0 0 10 12" width="11" height="13"><path d="M0 0 10 6 0 12Z" fill="currentColor"/></svg>PLAY</span>
      </button>
      <button id="bigbangBtn" class="mode-card">
        <span class="mode-txt"><b>Before the Stars</b><span>From singularity to Infinity</span></span>
        <span class="mode-play" aria-hidden="true"><svg viewBox="0 0 10 12" width="11" height="13"><path d="M0 0 10 6 0 12Z" fill="currentColor"/></svg>PLAY</span>
      </button>
    </div>
  </div>
</div>
<p id="appCredit" class="app-credit">Developed by Mark Adrianne Salunga</p>

<div id="fade"></div>

<a id="simBackLink" href="#/modes">&larr; Back to Menu</a>

<!-- Immersive view: hides every overlay, leaves only the 3D scene -->
<button id="uiToggle" class="ui-eye" aria-pressed="false" title="Hide interface (H)">Hide UI</button>

<!-- Control panel (revealed after the intro flight) -->
<div id="ui" class="glass">
  <header>
    <h2>Controls</h2>
    <button id="collapseBtn" class="icon-btn" title="Collapse panel"
      aria-label="Collapse panel" aria-expanded="true">&#8722;</button>
  </header>
  <div class="tabs">
    <button class="tab active" data-tab="world">World</button>
    <button class="tab" data-tab="sim">Sim</button>
    <button class="tab" data-tab="spawn">Spawn</button>
    <button class="tab" data-tab="impact">Impact</button>
    <button class="tab" data-tab="laser">Laser</button>
    <button class="tab" data-tab="cam">Cam</button>
    <button class="tab" data-tab="fx">FX</button>
  </div>
  <div id="uiBody">

    <div class="tab-page active" data-page="world">
      <div class="section-label">Galaxy</div>
      <div id="galaxyList" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div id="galaxyInfo"></div>
      <div class="sep"></div>
      <div class="section-label">Bodies</div>
      <div class="planet-grid" id="planetGrid"></div>
      <div class="sep"></div>
      <button id="resetBtn" class="btn">Reset camera</button>
    </div>

    <div class="tab-page" data-page="sim">
      <div class="row"><span>Playing</span>
        <label class="switch"><input id="playing" type="checkbox" aria-label="Simulation playback" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="slider-row">
        <div class="row"><span>Speed</span><span class="value" id="speedVal"></span></div>
        <input id="speed" type="range" min="0" max="8" step="1">
      </div>
      <div class="slider-row">
        <div class="row"><span>Gravity</span><span class="value" id="gravityVal"></span></div>
        <input id="gravity" type="range" min="0" max="5" step="0.1">
      </div>
      <div id="wormholeControls" hidden>
        <div class="sep"></div>
        <div class="section-label">Wormhole physics</div>
        <div class="slider-row">
          <div class="row"><span>Gravitational pull</span><span class="value" id="wormholePullVal"></span></div>
          <input id="wormholePull" type="range" min="0.25" max="3" step="0.05" value="1" aria-label="Wormhole gravitational pull">
        </div>
        <div class="slider-row">
          <div class="row"><span>Throat size</span><span class="value" id="wormholeThroatVal"></span></div>
          <input id="wormholeThroat" type="range" min="0.5" max="2" step="0.05" value="1" aria-label="Wormhole throat size">
        </div>
        <div class="slider-row">
          <div class="row"><span>Exit velocity</span><span class="value" id="wormholeExitVelocityVal"></span></div>
          <input id="wormholeExitVelocity" type="range" min="0.5" max="2" step="0.05" value="1" aria-label="Wormhole exit velocity">
        </div>
        <div class="note">Bodies crossing the throat emerge on the opposite side with their direction preserved.</div>
      </div>
      <div class="slider-row">
        <div class="row"><span>Planet size</span><span class="value" id="sizeVal"></span></div>
        <input id="size" type="range" min="0.5" max="4" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><span>Distances</span><span class="value" id="distVal"></span></div>
        <input id="dist" type="range" min="20" max="60" step="1">
      </div>
      <div class="sep"></div>
      <div class="row"><span>Orbit trails</span>
        <label class="switch"><input id="trails" type="checkbox" aria-label="Orbit trails" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Labels</span>
        <label class="switch"><input id="labels-toggle" type="checkbox" aria-label="Celestial body labels" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="sep"></div>
      <div class="section-label">Automatic events</div>
      <div class="row"><span>Collisions</span>
        <label class="switch"><input id="collisions" type="checkbox" aria-label="Collision physics"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Eclipses</span>
        <label class="switch"><input id="eclipses" type="checkbox" aria-label="Automatic eclipse events"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Resident asteroids</span>
        <label class="switch"><input id="neas-toggle" type="checkbox" aria-label="Resident near-Earth asteroids"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="section-label">Manual events</div>
      <button id="eclipseBtn" class="btn">Trigger solar eclipse</button>
    </div>

    <div class="tab-page" data-page="spawn">
      <div class="section-label">Comets</div>
      <select id="cometColor" aria-label="Comet color variant">
        <option value="blue">Blue ice comet</option>
        <option value="green">Green gas comet</option>
      </select>
      <button id="spawnComet" class="btn accent">Spawn comet</button>
      <div class="slider-row">
        <div class="row"><span>Last comet: semi-major</span><span class="value" id="cometAVal"></span></div>
        <input id="cometA" type="range" min="50" max="260" step="2">
      </div>
      <div class="slider-row">
        <div class="row"><span>Last comet: eccentricity</span><span class="value" id="cometEVal"></span></div>
        <input id="cometE" type="range" min="0.4" max="0.95" step="0.01">
      </div>
      <div class="sep"></div>
      <div class="section-label">Asteroids</div>
      <div class="slider-row">
        <div class="row"><span>Size</span><span class="value" id="astSizeVal"></span></div>
        <input id="astSize" type="range" min="0.3" max="3" step="0.1">
      </div>
      <div class="slider-row">
        <div class="row"><span>Mass</span><span class="value" id="astMassVal"></span></div>
        <input id="astMass" type="range" min="0.2" max="10" step="0.2">
      </div>
      <div class="slider-row">
        <div class="row"><span>Velocity</span><span class="value" id="astVelVal"></span></div>
        <input id="astVel" type="range" min="0.1" max="3" step="0.05">
      </div>
      <div class="btn-row">
        <button id="spawnAsteroid" class="btn accent">From camera</button>
        <button id="spawnAstBelt" class="btn">Random orbit</button>
      </div>
      <button id="spawnNEA" class="btn">Spawn near-Earth asteroid</button>
      <div class="note">Click any spawned asteroid to inspect it and begin a mining operation.</div>
      <div class="sep"></div>
      <div class="section-label">Black hole</div>
      <div class="slider-row">
        <div class="row"><span>Mass (suns)</span><span class="value" id="bhMassVal"></span></div>
        <input id="bhMass" type="range" min="50" max="5000" step="50">
      </div>
      <button id="spawnBH" class="btn danger">Spawn black hole</button>
      <div class="note">Black holes pull every free body; planets break off their orbital rails and deform naturally. Objects crossing the event horizon are consumed.</div>
      <div class="sep"></div>
      <button id="clearSpawned" class="btn">Clear spawned objects</button>
    </div>

    <div class="tab-page" data-page="impact">
      <div class="section-label">Target</div>
      <select id="impactTarget"></select>
      <div class="section-label">Projectile</div>
      <select id="impactKind">
        <option value="asteroid">Asteroid</option>
        <option value="comet">Comet</option>
      </select>
      <select id="impCometColor" aria-label="Comet color variant" hidden>
        <option value="blue">Blue ice comet</option>
        <option value="green">Green gas comet</option>
      </select>
      <div class="slider-row">
        <div class="row"><span>Speed</span><span class="value" id="impSpeedVal"></span></div>
        <input id="impSpeed" type="range" min="0.5" max="6" step="0.1">
      </div>
      <div class="slider-row">
        <div class="row"><span>Approach angle</span><span class="value" id="impAngleVal"></span></div>
        <input id="impAngle" type="range" min="0" max="360" step="5">
      </div>
      <div class="slider-row">
        <div class="row"><span>Mass</span><span class="value" id="impMassVal"></span></div>
        <input id="impMass" type="range" min="0.5" max="60" step="0.5">
      </div>
      <div class="slider-row">
        <div class="row"><span>Size</span><span class="value" id="impSizeVal"></span></div>
        <input id="impSize" type="range" min="0.3" max="4" step="0.1">
      </div>
      <div class="row"><span>Lock-on</span>
        <label class="switch"><input id="impLockOn" type="checkbox" aria-label="Lock-on guidance"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <button id="launchBtn" class="btn danger">Launch</button>
      <button id="meteorBtn" class="btn">Meteor shower</button>
      <div class="note">Heavy, fast projectiles can shatter a planet outright; lighter ones crater it, kick up debris, and perturb its orbit. Meteor showers burn up in an atmosphere or pepper the surface with craters.</div>
    </div>

    <div class="tab-page" data-page="laser">
      <div class="section-label">Target</div>
      <select id="laserTarget" aria-label="Laser target"></select>
      <div class="section-label">Beam</div>
      <div class="slider-row">
        <div class="row"><span>Width</span><span class="value" id="laserWidthVal"></span></div>
        <input id="laserWidth" type="range" min="0.1" max="2" step="0.05">
      </div>
      <div class="row"><span>Color</span>
        <input id="laserColor" type="color" value="#ff4a3a" aria-label="Beam color">
      </div>
      <div class="slider-row">
        <div class="row"><span>Power</span><span class="value" id="laserPowerVal"></span></div>
        <input id="laserPower" type="range" min="10" max="800" step="10">
      </div>
      <div class="slider-row">
        <div class="row"><span>Duration</span><span class="value" id="laserDurationVal"></span></div>
        <input id="laserDuration" type="range" min="0.2" max="3" step="0.1">
      </div>
      <div class="row"><span>Destructive</span>
        <label class="switch"><input id="laserDestructive" type="checkbox" aria-label="Destructive beam" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Cursor Laser Mode</span>
        <label class="switch"><input id="cursorLaserMode" type="checkbox" aria-label="Cursor Laser Mode"><span class="track"></span><span class="thumb"></span></label>
      </div>
      <button id="fireLaser" class="btn danger">Fire laser (F)</button>
      <div class="note">A light-speed beam from your viewpoint to the target — it hits instantly. At full power a destructive beam shatters a world; non-destructive mode only scorches the surface.</div>
    </div>

    <div class="tab-page" data-page="cam">
      <div class="section-label">Camera mode</div>
      <div class="cam-grid" id="camGrid">
        <button class="cam-btn active" data-cam="orbit">Orbit<small>Drag to circle the system</small></button>
        <button class="cam-btn" data-cam="free">Free flight<small>WASD + drag to look</small></button>
        <button class="cam-btn" data-cam="follow">Follow<small>Track the target</small></button>
        <button class="cam-btn" data-cam="cinematic">Cinematic<small>Auto-directed tour</small></button>
        <button class="cam-btn" data-cam="drone">Drone<small>Handheld close orbit</small></button>
        <button class="cam-btn" data-cam="telescope">Telescope<small>Long-lens observation</small></button>
      </div>
      <div class="section-label">Target</div>
      <select id="camTarget" aria-label="Camera target"></select>
      <div class="slider-row" id="teleZoomRow" hidden>
        <div class="row"><span>Telescope zoom</span><span class="value" id="teleZoomVal"></span></div>
        <input id="teleZoom" type="range" min="0.5" max="15" step="0.1" aria-label="Telescope zoom">
      </div>
      <div class="note" id="camHint">Left-drag orbits, right-drag pans, scroll zooms. Click any body to focus it.</div>
    </div>

    <div class="tab-page" data-page="fx">
      <div class="section-label">Graphics quality</div>
      <select id="quality">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high" selected>High — shadows &amp; eclipses</option>
      </select>
      <div class="slider-row">
        <div class="row"><span>Bloom intensity</span><span class="value" id="bloomVal"></span></div>
        <input id="bloomI" type="range" min="0" max="3" step="0.05">
      </div>
      <div class="slider-row">
        <div class="row"><span>Particle density</span><span class="value" id="densityVal"></span></div>
        <input id="density" type="range" min="0.3" max="2" step="0.1">
      </div>
      <div class="row"><span>Asteroid belt</span>
        <label class="switch"><input id="belt-toggle" type="checkbox" aria-label="Asteroid belt visibility" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="row"><span>Nebulas &amp; dust</span>
        <label class="switch"><input id="nebula-toggle" type="checkbox" aria-label="Nebulas and dust visibility" checked><span class="track"></span><span class="thumb"></span></label>
      </div>
      <div class="sep"></div>
      <button id="resetSim" class="btn danger">Reset simulation</button>
    </div>

  </div>
</div>

<!-- Planet dossier -->
<aside id="infoPanel" class="glass" aria-live="polite" aria-hidden="true" inert>
  <header>
    <div id="ipTitle">
      <h3 id="ipName"></h3>
      <span class="chip" id="ipType"></span>
    </div>
    <button id="ipClose" class="icon-btn" title="Close panel" aria-label="Close panel">&#215;</button>
  </header>
  <div id="ipBody"></div>
</aside>

<!-- Impact warnings -->
<div id="warnings"></div>
<div id="warningAnnouncer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>

<!-- Event toasts -->
<div id="toasts" aria-live="polite"></div>

<!-- Telescope overlay -->
<div id="teleOverlay">
  <div class="vignette"></div>
  <div class="reticle"></div>
  <div id="teleReadout" class="glass"></div>
</div>

<!-- Cinematic letterbox -->
<div id="cinebars"><div class="bar top"></div><div class="bar bottom"></div></div>

<!-- Active camera mode chip -->
<div id="modeChip" class="glass"><span class="dot"></span><span id="modeChipLabel"></span><small>Esc to exit</small></div>

<!-- Timeline and persistent selected-object summary -->
<section id="bottomBar" class="glass" aria-label="Simulation timeline and selected object">
  <div class="bar-primary">
    <div class="bar-time">
      <strong id="barUtcDate">2000-01-01</strong>
      <strong id="barUtcTime">12:00:00 UTC</strong>
    </div>
    <div class="bar-controls">
      <button id="barPlay" type="button" aria-label="Play forward" aria-pressed="true">&#9654;</button>
      <button id="barPause" type="button" aria-label="Pause simulation" aria-pressed="false">&#10074;&#10074;</button>
      <div class="bar-speed">
        <label for="barTimeScale">Speed</label>
        <input id="barTimeScale" type="range" min="0" max="8" step="1" aria-label="Simulation time scale">
        <output id="barTimeScaleValue">10 d/s</output>
      </div>
    </div>
    <div class="bar-selection">
      <strong id="barSelectedName">Current system</strong>
      <span id="barSelectedType">Galaxy system</span>
    </div>
    <button id="barCollapse" type="button" aria-expanded="true"
      aria-label="Hide timeline panel" title="Hide timeline panel">&#9662;</button>
    <div class="bar-timeline">
      <span id="barElapsed">+0.00 days</span>
      <input id="timelineScrubber" type="range" min="-36525" max="36525" step="0.01"
        aria-label="Simulation date" aria-valuetext="2000-01-01 12:00:00 UTC">
      <button id="timelineDetails" type="button" aria-expanded="false"
        aria-controls="timelineDetailsPanel">Details</button>
    </div>
  </div>
  <div id="timelineDetailsPanel" aria-hidden="false">
    <div class="bar-extra-controls">
      <button id="barReverse" type="button" aria-label="Play in reverse" aria-pressed="false">&#9664;</button>
      <button id="timelinePrev" type="button" aria-label="Previous timeline stop">&#124;&lsaquo;</button>
      <button id="timelineNext" type="button" aria-label="Next timeline stop">&rsaquo;&#124;</button>
      <button id="barSpeedDown" type="button" aria-label="Decrease time scale">&minus;</button>
      <button id="barSpeedUp" type="button" aria-label="Increase time scale">+</button>
      <button id="timelineReset" type="button" aria-label="Reset to session start">Reset</button>
      <button id="timelinePresent" type="button" aria-label="Jump to present">Now</button>
    </div>
    <div class="bar-detail">
      <span><small>Day</small><b id="barDay">01</b></span>
      <span><small>Month</small><b id="barMonth">January</b></span>
      <span><small>Year</small><b id="barYear">2000</b></span>
      <span><small>Universe</small><b id="barUniverseAge">13.8 billion years</b></span>
      <span><small>Epoch</small><b id="barEpoch">J2000.000</b></span>
      <span><small>Source</small><b id="barSelectedSource">Simulator model</b></span>
      <span><small>Status</small><b id="barSelectedStatus">Current system</b></span>
    </div>
    <div id="barSelectedMetric" class="bar-detail">Metrics unavailable</div>
  </div>
</section>
`;
}
