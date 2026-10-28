import { MAWASHI_COLORS, NICKNAME_MAX } from '../customizations';
import { ICONS, icon } from './dom';

/** The arena's chrome around the canvas: panels, toolbar, cards and dialogs. */
export const SHELL = `
  <main class="stage">
    <canvas id="arena" aria-label="3D arena of your Mac's apps. Drag a wrestler out of the ring to quit the app."></canvas>
    <div class="stage-shade" aria-hidden="true"></div>

    <header class="brand">
      <span class="brand-mark" aria-hidden="true">相撲</span>
      <div class="brand-text">
        <h1>SUMO</h1>
        <p class="connection is-connecting" id="connection" role="status">
          <span class="status-dot"></span><span id="connection-text">Connecting</span>
        </p>
      </div>
    </header>

    <section class="side-panel card" id="side-panel" aria-label="Ranking and missions">
      <div class="side-tabs" role="tablist" aria-label="Ranking and missions">
        <button type="button" role="tab" id="tab-banzuke" data-tab="banzuke" aria-controls="banzuke-pane">Ranking <span data-term="banzuke">番付</span></button>
        <button type="button" role="tab" id="tab-missions" data-tab="missions" aria-controls="missions-pane">Missions <b class="tab-count" id="missions-count"></b></button>
        <button type="button" class="side-collapse" id="side-collapse" aria-label="Collapse panel" aria-expanded="true">${icon(ICONS.chevron)}</button>
      </div>
      <div class="side-pane banzuke" id="banzuke-pane" role="tabpanel" aria-labelledby="tab-banzuke">
        <button type="button" class="basho-line" id="basho-open" data-tip="Tournament" data-key="T">
          <span class="basho-kanji" aria-hidden="true">場所</span><span id="basho-name"></span><span id="basho-day"></span>
        </button>
        <ol id="banzuke-list"></ol>
        <p class="side-empty" id="banzuke-empty">Waiting for the wrestlers…</p>
      </div>
      <div class="side-pane missions" id="missions-pane" role="tabpanel" aria-labelledby="tab-missions" hidden>
        <ol id="missions-list"></ol>
        <p class="side-empty" id="missions-empty">New missions coming up shortly.</p>
      </div>
    </section>

    <section class="system-mini card" aria-label="System summary">
      <div class="system-stat">
        <span>RAM</span>
        <strong id="ram-used">—</strong><small id="ram-total">of —</small>
        <div class="meter" aria-hidden="true"><i id="ram-meter"></i></div>
      </div>
      <div class="system-stat">
        <span>IN ARENA</span>
        <strong id="arena-count">20</strong><small id="app-total">of —</small>
      </div>
      <div class="system-stat chanko-stat">
        <span data-term="chanko" tabindex="0">CHANKO</span>
        <strong id="chanko-balance">—</strong><small>points</small>
        <em class="chanko-delta" id="chanko-delta" aria-hidden="true"></em>
      </div>
    </section>
    <div id="labels" class="labels-layer" aria-label="Apps in the arena"></div>

    <div class="loading-state card" id="loading-state">
      <span class="loader-ring"></span>
      <strong id="loading-title">Calling the wrestlers</strong>
      <span id="loading-copy">Reading processes from the local engine…</span>
    </div>

    <aside class="process-panel card" id="process-panel" aria-label="App details" hidden>
      <button class="panel-close" id="panel-close" aria-label="Close details">×</button>
      <span class="rank-chip" id="process-rank"></span>
      <h2 id="process-name"></h2>
      <span class="process-pid" id="process-pid"></span>
      <div class="trophy-chips" id="process-trophies"></div>
      <div class="process-metrics">
        <div>
          <span>MEMORY</span><strong id="process-memory"></strong>
          <div class="meter" aria-hidden="true"><i id="process-memory-meter"></i></div>
          <small id="process-share"></small>
        </div>
        <div>
          <span>CPU</span><strong id="process-cpu"></strong>
          <div class="meter is-cpu" aria-hidden="true"><i id="process-cpu-meter"></i></div>
          <small id="process-mood"></small>
        </div>
      </div>
      <dl class="process-record">
        <div><dt>Today's peak</dt><dd id="process-peak"></dd></div>
        <div><dt>Bouts</dt><dd id="process-bouts"></dd></div>
        <div><dt>In the arena for</dt><dd id="process-since"></dd></div>
      </dl>
      <details class="customize" id="customize">
        <summary>Customise</summary>
        <label class="field">
          <span>Nickname</span>
          <input id="nickname" type="text" maxlength="${NICKNAME_MAX}" placeholder="e.g. The Devourer" autocomplete="off" />
        </label>
        <div class="field">
          <span>Belt colour (<b data-term="mawashi" tabindex="0">mawashi</b>)</span>
          <div class="swatches" id="swatches" role="radiogroup" aria-label="Belt colour">
            ${MAWASHI_COLORS.map((color) => `<button type="button" role="radio" data-color="${color}" style="--swatch:${color}" aria-label="Colour ${color}"></button>`).join('')}
          </div>
        </div>
        <button type="button" class="text-button" id="customize-reset">Reset</button>
      </details>
      <button type="button" class="push-out" id="push-out">
        <span>Push out of the ring</span><small id="push-out-hint">Quits the app</small>
      </button>
    </aside>

    <footer class="arena-footer">
      <div class="footer-controls">
        <label class="crowd-control card" for="crowd-limit">
          <span>WRESTLERS <output id="crowd-limit-value" for="crowd-limit">20</output></span>
          <input id="crowd-limit" type="range" min="4" max="36" step="1" value="20" aria-label="Number of wrestlers in the arena" />
        </label>
        <div class="toolbar card" id="toolbar" role="toolbar" aria-label="Arena controls">
          <button type="button" id="sound-toggle" aria-pressed="false" data-tip="Sound" data-key="S"></button>
          <button type="button" id="bout-now" data-tip="Bout now" data-key="B" aria-label="Bout now">${icon(ICONS.bout)}</button>
          <button type="button" id="fans-open" data-tip="Who turned the fans on?" data-key="C" aria-label="Who turned the fans on?">${icon(ICONS.fans)}</button>
          <button type="button" id="recap-open" data-tip="Today's recap" data-key="R" aria-label="Today's recap">${icon(ICONS.recap)}</button>
          <button type="button" id="panel-toggle" data-tip="Ranking and missions" data-key="L" aria-label="Ranking and missions" aria-pressed="true">${icon(ICONS.panel)}</button>
          <button type="button" id="zen-toggle" data-tip="Arena only" data-key="H" aria-label="Arena only" aria-pressed="false">${icon(ICONS.zen)}</button>
          <button type="button" id="guide-open" data-tip="Guide and glossary" data-key="?" aria-label="Guide and glossary">${icon(ICONS.guide)}</button>
          <button type="button" id="fullscreen-toggle" data-tip="Full screen" data-key="F"></button>
        </div>
      </div>
      <ol class="commentary" id="commentary" aria-live="polite" aria-label="Arena commentary"></ol>
    </footer>

    <section class="bet-card card" id="bet-card" aria-label="Prediction" hidden></section>

    <p class="hint" id="hint">Drag a wrestler out of the ring to quit the app</p>

    <div class="toast card" id="sound-toast" role="status" hidden>
      <span>Want to hear the gong and the crowd cheering?</span>
      <button type="button" class="toast-primary" id="sound-yes">Turn on sound</button>
      <button type="button" class="toast-secondary" id="sound-no">No, thanks</button>
    </div>
    <p class="zen-note" id="zen-note" hidden>Arena only · press <kbd>H</kbd> or tap here to go back</p>
    <div class="coin-layer" id="coin-layer" aria-hidden="true"></div>
  </main>

  <dialog class="dialog" id="confirm-dialog" aria-labelledby="confirm-title">
    <form method="dialog">
      <span class="dialog-kanji" aria-hidden="true">押出</span>
      <h2 id="confirm-title"></h2>
      <p id="confirm-copy"></p>
      <div class="dialog-actions">
        <button value="cancel" class="secondary" id="confirm-cancel">Let it fight</button>
        <button value="confirm" class="danger" id="confirm-accept">Push out</button>
      </div>
    </form>
  </dialog>

  <dialog class="dialog recap" id="recap-dialog" aria-labelledby="recap-title">
    <form method="dialog">
      <button value="close" class="panel-close" aria-label="Close recap">×</button>
      <span class="dialog-kanji" aria-hidden="true">本日</span>
      <h2 id="recap-title">Your Mac today</h2>
      <p id="recap-date"></p>
      <div class="recap-totals" id="recap-totals"></div>
      <ol class="recap-trophies" id="recap-trophies"></ol>
      <div class="dialog-actions">
        <button type="button" class="secondary" id="recap-copy">Copy text</button>
        <button type="button" class="primary" id="recap-download">Download card</button>
      </div>
    </form>
  </dialog>
`;
