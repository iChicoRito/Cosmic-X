export function creatorTemplate() {
  return String.raw`
<a id="creatorBackLink" class="glass" href="#/modes">&larr; Back to Modes</a>

<!-- Title view: empty space where galaxies periodically bloom -->
<div id="crTitle">
  <div class="cr-title-card">
    <p class="cr-kicker">CosmicX</p>
    <h1>Become the Creator</h1>
    <p class="cr-tagline">An empty universe awaits its first architect.</p>
    <div class="cr-title-actions">
      <button id="crCreateBtn" class="cr-btn primary" type="button">Create a Galaxy</button>
      <button id="crLoadBtn" class="cr-btn" type="button" hidden>Load Galaxy</button>
    </div>
  </div>
</div>

<!-- Creation wizard -->
<section id="crWizard" class="glass" hidden aria-label="Galaxy creation">
  <header class="cr-wizard-head">
    <h2 id="crWizardTitle">Choose a Galaxy Type</h2>
    <ol id="crStepDots" aria-hidden="true">
      <li class="on"></li><li></li><li></li><li></li>
    </ol>
  </header>
  <div class="cr-step" id="crStepType">
    <div id="crTypeGrid" class="cr-type-grid"></div>
  </div>
  <div class="cr-step" id="crStepStructure" hidden>
    <div class="cr-name-row">
      <label for="crNameInput">Galaxy name</label>
      <input id="crNameInput" maxlength="24" autocomplete="off" spellcheck="false">
      <button id="crSeedBtn" class="cr-btn small" type="button" title="Reroll the random seed">&#10227; Seed</button>
    </div>
    <div id="crStructureSliders" class="cr-sliders"></div>
  </div>
  <div class="cr-step" id="crStepPopulation" hidden>
    <div id="crPopulationSliders" class="cr-sliders"></div>
  </div>
  <div class="cr-step" id="crStepPhysics" hidden>
    <div id="crPhysicsSliders" class="cr-sliders"></div>
  </div>
  <footer class="cr-wizard-foot">
    <button id="crPrevBtn" class="cr-btn" type="button" disabled>Back</button>
    <span class="cr-foot-gap"></span>
    <button id="crNextBtn" class="cr-btn primary" type="button">Next</button>
    <button id="crGenerateBtn" class="cr-btn primary" type="button" hidden>&#10022; Create Galaxy</button>
  </footer>
</section>

<!-- Simulation HUD -->
<div id="crHud" hidden>
  <!-- right-side control panel (mirrors the As the Gods Will #ui rail) -->
  <section id="crPanel" class="glass">
    <header class="cr-panel-head">
      <h2>Creator Controls</h2>
      <button id="crPanelCollapse" class="cr-icon-btn" type="button" aria-label="Collapse panel" aria-expanded="true">&#9662;</button>
    </header>
    <nav id="crToolbar" class="cr-tabs" aria-label="Creator tools">
      <button class="cr-tab" type="button" data-panel="build">Build</button>
      <button class="cr-tab" type="button" data-panel="place">Place</button>
      <button class="cr-tab" type="button" data-panel="events">Events</button>
      <button class="cr-tab" type="button" data-panel="bodies">Bodies</button>
      <button class="cr-tab" type="button" data-panel="view">View</button>
      <button class="cr-tab" type="button" data-panel="cam">Cam</button>
      <button class="cr-tab" type="button" data-panel="spawn">Spawn</button>
      <button class="cr-tab" type="button" data-panel="impact">Impact</button>
      <button class="cr-tab" type="button" data-panel="laser">Laser</button>
      <button class="cr-tab" type="button" data-panel="stats">Stats</button>
      <button class="cr-tab" type="button" data-panel="encyclopedia">Codex</button>
      <button class="cr-tab" type="button" data-panel="save">Save</button>
      <button class="cr-tab" type="button" data-panel="fx">FX</button>
    </nav>
    <div id="crPanelBody">

    <div class="cr-panel-body" id="crBuildPanel" hidden>
      <h4>Stellar system</h4>
      <div class="cr-field"><label for="crStarType">Star type</label><select id="crStarType"></select></div>
      <div class="cr-field"><label for="crStarCount">Stars</label><select id="crStarCount">
        <option value="1">Single</option><option value="2">Binary</option><option value="3">Trinary</option>
      </select></div>
      <div id="crStarSliders" class="cr-sliders"></div>
      <button id="crAddSystemBtn" class="cr-btn primary wide" type="button">Place Stellar System</button>
      <h4 class="cr-gap">Planet <span id="crPlanetTarget" class="cr-dim">— select a system first</span></h4>
      <div class="cr-field"><label for="crPlanetClass">Class</label><select id="crPlanetClass"></select></div>
      <div class="cr-field"><label for="crPlanetAtmo">Atmosphere</label><select id="crPlanetAtmo"></select></div>
      <div id="crPlanetSliders" class="cr-sliders"></div>
      <div class="cr-field cr-check"><label for="crPlanetRings">Rings</label><input type="checkbox" id="crPlanetRings"></div>
      <button id="crAddPlanetBtn" class="cr-btn primary wide" type="button" disabled>Add Planet</button>
    </div>

    <div class="cr-panel-body" id="crPlacePanel" hidden>
      <p class="cr-dim">Pick an object, then click the galaxy to place it.</p>
      <div id="crPlaceGrid" class="cr-choice-grid"></div>
    </div>

    <div class="cr-panel-body" id="crEventsPanel" hidden>
      <p class="cr-dim">Bend the cosmos to your will.</p>
      <div id="crEventGrid" class="cr-choice-grid"></div>
    </div>

    <div class="cr-panel-body" id="crBodiesPanel" hidden>
      <p class="cr-dim">Every world in this system. Hide one, or fly to it.</p>
      <div id="crBodyList" class="cr-bodies"></div>
    </div>

    <div class="cr-panel-body" id="crViewPanel" hidden>
      <div class="cr-field cr-check"><label for="crViewLabels">Labels</label><input type="checkbox" id="crViewLabels" checked></div>
      <div class="cr-field cr-check"><label for="crViewTrails">Orbit trails</label><input type="checkbox" id="crViewTrails" checked></div>
      <div id="crViewSliders" class="cr-sliders"></div>
    </div>

    <div class="cr-panel-body" id="crCamPanel" hidden>
      <div id="crCamGrid" class="cr-cam-grid"></div>
      <div class="cr-field"><label for="crCamTarget">Target</label><select id="crCamTarget"></select></div>
      <p id="crCamHint" class="cr-note"></p>
    </div>

    <div class="cr-panel-body" id="crSpawnPanel" hidden>
      <p class="cr-dim">Populate the system — then bend its physics.</p>
      <div class="cr-spawn-grid">
        <button id="crSpawnAsteroid" class="cr-btn" type="button">Asteroid</button>
        <button id="crSpawnComet" class="cr-btn" type="button">Comet</button>
        <button id="crSpawnBH" class="cr-btn" type="button">Black Hole</button>
        <button id="crClearSpawned" class="cr-btn danger" type="button">Clear</button>
      </div>
      <div id="crSpawnSliders" class="cr-sliders"></div>
      <div class="cr-field cr-check"><label for="crSysCollide">Collisions</label><input type="checkbox" id="crSysCollide" checked></div>
    </div>

    <div class="cr-panel-body" id="crImpactPanel" hidden>
      <div class="cr-field"><label for="crImpactTarget">Target</label><select id="crImpactTarget"></select></div>
      <div id="crImpactSliders" class="cr-sliders"></div>
      <div class="cr-field cr-check"><label for="crImpactHoming">Homing</label><input type="checkbox" id="crImpactHoming" checked></div>
      <button id="crLaunchBtn" class="cr-btn primary wide" type="button">Launch Impactor</button>
    </div>

    <div class="cr-panel-body" id="crLaserPanel" hidden>
      <div class="cr-field"><label for="crLaserTarget">Target</label><select id="crLaserTarget"></select></div>
      <div id="crLaserSliders" class="cr-sliders"></div>
      <div class="cr-field"><label for="crLaserColor">Beam colour</label><input type="color" id="crLaserColor" value="#ff4d6d"></div>
      <div class="cr-field cr-check"><label for="crLaserDestructive">Destructive</label><input type="checkbox" id="crLaserDestructive" checked></div>
      <button id="crFireLaser" class="cr-btn primary wide" type="button">Fire Laser <kbd>F</kbd></button>
    </div>

    <div class="cr-panel-body" id="crStatsPanel" hidden>
      <dl id="crStatsList" class="cr-stats"></dl>
    </div>

    <div class="cr-panel-body" id="crEncPanel" hidden>
      <p id="crEncProgress" class="cr-dim"></p>
      <div id="crEncList" class="cr-enc"></div>
    </div>

    <div class="cr-panel-body" id="crSavePanel" hidden>
      <div class="cr-field">
        <input id="crSaveName" placeholder="Save name" maxlength="40" autocomplete="off">
        <button id="crSaveBtn" class="cr-btn primary" type="button">Save</button>
      </div>
      <ul id="crSlotList" class="cr-slots"></ul>
      <div class="cr-save-actions">
        <button id="crExportBtn" class="cr-btn" type="button">Export JSON</button>
        <button id="crImportBtn" class="cr-btn" type="button">Import JSON</button>
        <button id="crShotBtn" class="cr-btn" type="button">&#128247; Screenshot</button>
      </div>
      <input type="file" id="crImportFile" accept=".json,application/json" hidden>
    </div>

    <div class="cr-panel-body" id="crFxPanel" hidden>
      <h4>Graphics</h4>
      <div class="cr-field"><label for="crFxQuality">Render quality</label><select id="crFxQuality">
        <option value="1">Low</option>
        <option value="1.5">Medium</option>
        <option value="2">High</option>
      </select></div>
      <div id="crFxSliders" class="cr-sliders"></div>
      <div class="cr-field cr-check"><label for="crFxNebulae">Nebulae &amp; dust</label><input type="checkbox" id="crFxNebulae" checked></div>
      <div class="cr-field cr-check"><label for="crFxClusters">Star clusters</label><input type="checkbox" id="crFxClusters" checked></div>
      <div class="cr-field cr-check"><label for="crFxTwinkle">Star twinkle</label><input type="checkbox" id="crFxTwinkle" checked></div>
    </div>

    </div><!-- /crPanelBody -->
  </section>

  <!-- left-side inspector (mirrors the As the Gods Will #infoPanel dossier) -->
  <aside id="crInspector" class="glass" hidden aria-label="Object inspector">
    <header class="cr-panel-head">
      <h3 id="crInspName"></h3>
      <button id="crInspClose" class="cr-icon-btn" type="button" aria-label="Close inspector">&times;</button>
    </header>
    <p id="crInspKind" class="cr-dim"></p>
    <dl id="crInspFacts" class="cr-stats"></dl>
    <div id="crInspExtra"></div>
    <div class="cr-insp-actions">
      <button id="crScanBtn" class="cr-btn primary" type="button">Scan</button>
      <button id="crFocusBtn" class="cr-btn" type="button">Focus</button>
      <button id="crRemoveBtn" class="cr-btn danger" type="button" hidden>Remove</button>
    </div>
  </aside>

  <!-- full-width timeline / transport (mirrors the As the Gods Will #bottomBar) -->
  <div id="crTransport" class="glass" aria-label="Simulation timeline">
    <div class="cr-bar-time">
      <span id="crGalaxyName" class="cr-bar-name"></span>
      <strong id="crYears">0 yr</strong>
      <span class="cr-bar-sub">elapsed cosmic time</span>
    </div>
    <div class="cr-bar-transport" role="group" aria-label="Simulation speed">
      <button id="crPauseBtn" class="cr-speed" type="button" aria-pressed="false" title="Pause">&#10074;&#10074;</button>
      <span id="crSpeeds"></span>
    </div>
    <div class="cr-bar-glance">
      <span><small>Stars</small><b id="crGlanceStars">—</b></span>
      <span><small>Gas</small><b id="crGlanceGas">—</b></span>
      <span><small>Systems</small><b id="crGlanceSystems">0</b></span>
    </div>
  </div>

  <p id="crHint" class="glass" hidden></p>
</div>

<div id="crToasts" aria-live="polite"></div>
<div id="crFade"></div>`;
}
