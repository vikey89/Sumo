import { BASHO_DAYS, KACHI_KOSHI } from '../basho';
import type { Basho } from '../basho';
import { timeLeft } from '../missions';
import type { Mission } from '../missions';
import { rankFor } from '../ranks';
import { adoptLegacy, isRecord, readVersioned, writeVersioned } from '../storage';
import { formatBytes } from '../types';
import type { AppInfo } from '../types';
import { $, clickedId } from './dom';

const KEY = 'sumo:panel';
const VERSION = 1;
const BANZUKE_SIZE = 5;
const NARROW = '(max-width: 1100px)';

type Tab = 'banzuke' | 'missions';

interface PanelState {
  tab: Tab;
  collapsed: boolean;
}

function load(): PanelState {
  const stored = readVersioned(KEY, VERSION, adoptLegacy);
  const state = isRecord(stored) ? stored : {};
  return { tab: state.tab === 'missions' ? 'missions' : 'banzuke', collapsed: state.collapsed === true };
}

/** The side panel: the banzuke (with the basho line) and the missions, as two tabs. */
export class SidePanel {
  private readonly root = $('#side-panel');
  private readonly banzuke = $('#banzuke-list');
  private readonly state = load();

  constructor(
    private readonly basho: Basho,
    private readonly displayName: (process: Pick<AppInfo, 'id' | 'name'>) => string,
    onPick: (id: string) => void,
  ) {
    const tabs = this.root.querySelector('.side-tabs')!;
    tabs.addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab === 'banzuke' || tab === 'missions') this.showTab(tab);
    });
    tabs.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      this.showTab(this.state.tab === 'banzuke' ? 'missions' : 'banzuke');
      $(`#tab-${this.state.tab}`).focus();
    });
    $('#side-collapse').addEventListener('click', () => {
      this.state.collapsed = !this.state.collapsed;
      this.save();
    });
    $('#panel-toggle').addEventListener('click', () => this.toggle());
    window.matchMedia(NARROW).addEventListener('change', () => this.render());
    this.banzuke.addEventListener('click', (event) => {
      const id = clickedId(event);
      if (id) onPick(id);
    });
    this.render();
  }

  /** Where coins won on a mission fly from: the list when it's open, else its tab. */
  get missionsAnchor(): HTMLElement {
    return this.state.tab === 'missions' && !this.state.collapsed ? $('#missions-pane') : $('#tab-missions');
  }

  /** A mission paid out while the player was looking elsewhere. */
  flagMissions(): void {
    if (this.state.tab !== 'missions') $('#tab-missions').classList.add('has-news');
  }

  /** Desktop: collapse the panel to its tabs. Narrow screens: show or hide it over the arena. */
  toggle(): void {
    if (window.matchMedia(NARROW).matches) document.body.classList.toggle('show-side');
    else this.state.collapsed = !this.state.collapsed;
    this.save();
  }

  select(selectedId: string | undefined): void {
    this.banzuke.querySelectorAll<HTMLElement>('[data-id]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.id === selectedId);
    });
  }

  renderBanzuke(processes: AppInfo[], selectedId: string | undefined): void {
    const { basho } = this;
    const top = processes.slice(0, BANZUKE_SIZE);
    const heaviest = top[0]?.memory || 1;
    this.banzuke.replaceChildren(...top.map((process, index) => {
      const rank = rankFor(index);
      const item = document.createElement('li');
      item.innerHTML = `
        <button type="button" data-tier="${rank.tier}">
          <span class="banzuke-rank" data-term="${rank.tier}">${rank.kanji}</span>
          <span class="banzuke-name"></span>
          <span class="banzuke-record"></span>
          <span class="banzuke-memory">${formatBytes(process.memory)}</span>
          <span class="banzuke-bar" style="--fill:${(process.memory / heaviest * 100).toFixed(1)}%"></span>
        </button>`;
      const button = item.querySelector('button')!;
      button.dataset.id = process.id;
      button.classList.toggle('is-selected', process.id === selectedId);
      item.querySelector('.banzuke-name')!.textContent = this.displayName(process);
      const record = basho.record(process.id);
      if (record && record.wins + record.losses > 0) {
        const element = item.querySelector<HTMLElement>('.banzuke-record')!;
        element.textContent = `${record.wins}–${record.losses}`;
        element.title = `${basho.name}: ${record.wins} wins, ${record.losses} losses`;
        element.classList.toggle('is-good', record.wins >= KACHI_KOSHI);
      }
      return item;
    }));
    $('#banzuke-empty').hidden = top.length > 0;
    $('#basho-name').textContent = basho.name;
    $('#basho-day').textContent = `Day ${basho.day}/${BASHO_DAYS}`;
  }

  renderMissions(active: readonly Mission[]): void {
    $('#missions-list').replaceChildren(...active.map((mission) => {
      const item = document.createElement('li');
      item.dataset.kind = mission.kind;
      item.classList.toggle('is-done', mission.done);
      item.innerHTML = `
        <div class="mission-head"><strong></strong><span class="mission-reward">+${mission.reward}</span></div>
        <p></p>
        <div class="mission-progress"><i style="width:${(mission.progress * 100).toFixed(1)}%"></i></div>
        <small>${mission.done ? 'Done!' : `${Math.round(mission.progress * 100)}% · ${timeLeft(mission)}`}</small>`;
      item.querySelector('strong')!.textContent = mission.title;
      item.querySelector('p')!.textContent = mission.detail;
      return item;
    }));
    const open = active.filter((mission) => !mission.done).length;
    $('#missions-count').textContent = open > 0 ? String(open) : '';
    $('#missions-empty').hidden = active.length > 0;
  }

  private showTab(tab: Tab): void {
    this.state.tab = tab;
    this.state.collapsed = false;
    if (tab === 'missions') $('#tab-missions').classList.remove('has-news');
    this.save();
  }

  private save(): void {
    writeVersioned(KEY, VERSION, this.state);
    this.render();
  }

  private render(): void {
    const { state, root } = this;
    const narrow = window.matchMedia(NARROW).matches;
    const shown = narrow ? document.body.classList.contains('show-side') : !state.collapsed;
    root.classList.toggle('is-collapsed', !narrow && state.collapsed);
    for (const tab of root.querySelectorAll<HTMLElement>('[data-tab]')) {
      const selected = tab.dataset.tab === state.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    $('#banzuke-pane').hidden = state.tab !== 'banzuke';
    $('#missions-pane').hidden = state.tab !== 'missions';
    const collapse = $('#side-collapse');
    collapse.setAttribute('aria-expanded', String(!state.collapsed));
    collapse.setAttribute('aria-label', state.collapsed ? 'Expand panel' : 'Collapse panel');
    $('#panel-toggle').setAttribute('aria-pressed', String(shown));
  }
}
