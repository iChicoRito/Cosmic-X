import { ICONS } from '../../shared/icons.js';

export function bigBangTemplate() {
  return String.raw`
<a id="backLink" href="#/modes">${ICONS.back}<span>Modes</span></a>
<button id="bbUiToggle" class="ui-eye" aria-pressed="false" title="Hide interface (H)">Hide UI</button>

<!-- Title overlay -->
<div id="bbTitle">
  <div class="title-card">
    <h1>Before the Stars</h1>
    <p class="tagline">From Singularity to Infinity: A Journey from the Big Bang to the Modern Universe</p>
    <button id="beginBtn" class="btn">Begin</button>
  </div>
</div>
<div id="bbEnding" role="status" aria-live="polite" aria-hidden="true" inert>
  <h2>The Beginning Was Never the End</h2>
  <p>The night sky is more than a collection of stars—it is the story of where you came from.</p>
  <div class="ending-actions">
    <button id="bbReplayBtn" class="btn" type="button">Play Again</button>
    <a id="bbEndingBack" class="btn" href="#/modes">${ICONS.back}<span>Back to Menu</span></a>
  </div>
</div>

<div id="cinebars"><div class="bar top"></div><div class="bar bottom"></div></div>
<div id="toasts" aria-live="polite"></div>

<!-- Epoch jump list + expansion control -->
<aside id="bbPanel" class="glass" aria-label="Epochs and expansion controls">
  <div class="section-label">Epochs</div>
  <div id="epochList"></div>
  <div class="section-label">Expansion</div>
  <div class="slider-row">
    <div class="row"><span>Expansion rate</span><span class="value" id="expansionRateVal">1.0&times;</span></div>
    <input id="expansionRate" type="range" min="0.2" max="3" step="0.05" value="1" aria-label="Universe expansion rate">
  </div>
  <button id="bbCamBtn" class="btn" aria-pressed="false">Camera: Cinematic</button>
</aside>

<!-- Current epoch dossier -->
<div id="epochCard" class="glass" aria-live="polite">
  <div class="card-inner">
    <b id="epochName"></b>
    <div class="chips"><span class="chip" id="epochTime"></span><span class="chip" id="epochTemp"></span></div>
    <div class="note" id="epochDesc"></div>
  </div>
</div>

<!-- Timeline transport -->
<section id="bbBar" class="glass" aria-label="Cosmic timeline">
  <div class="bb-now">
    <strong id="bbEpochLabel"></strong>
    <span id="bbTimeLabel"></span>
  </div>
  <div class="bb-controls">
    <button id="bbReverse" type="button" aria-label="Play in reverse" aria-pressed="false">${ICONS.reverse}</button>
    <button id="bbPlay" type="button" aria-label="Play or pause" aria-pressed="false">${ICONS.play}</button>
    <button id="bbSpeedDown" type="button" aria-label="Slower">${ICONS.minus}</button>
    <output id="bbSpeedVal">1&times;</output>
    <button id="bbSpeedUp" type="button" aria-label="Faster">${ICONS.plus}</button>
  </div>
  <div class="bb-track">
    <input id="bbScrubber" type="range" min="0" max="1000" step="1" value="0" aria-label="Cosmic timeline">
    <div id="bbTicks"></div>
  </div>
</section>
`;
}
