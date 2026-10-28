import './style.css';
import { ArenaAudio } from './audio';
import { Commentator, narrate } from './commentary';
import type { CommentaryKind } from './commentary';
import { Customizations } from './customizations';
import { BettingDesk } from './betting';
import { Basho, KACHI_KOSHI } from './basho';
import type { BashoEvent } from './basho';
import { BashoDialog } from './basho-dialog';
import { DailyStats } from './daily-stats';
import { Coach } from './coach';
import { FanWatch } from './fans';
import { Guide, installTermTooltips } from './guide';
import { MissionBoard } from './missions';
import type { MissionEvent } from './missions';
import { ProcessClient } from './process-client';
import { REFEREE, rankFor } from './ranks';
import { Arena } from './scene/Arena';
import { formatBytes } from './types';
import type { AppInfo, AppSnapshot, ConnectionState } from './types';
import { Wallet } from './wallet';
import { flyCoins, renderBalance } from './ui/coins';
import { ViewControls } from './ui/controls';
import { $ } from './ui/dom';
import { Feed } from './ui/feed';
import { ProcessPanel } from './ui/process-panel';
import type { CustomizationPatch } from './ui/process-panel';
import { Recap } from './ui/recap';
import { SHELL } from './ui/shell';
import { SidePanel } from './ui/side-panel';
import { TOUR } from './ui/tour';

/** How long a pushed-out app gets to actually exit before it climbs back in. */
const QUIT_GRACE_MS = 8000;

$('#app').innerHTML = SHELL;

const loading = $('#loading-state');
const confirmDialog = $<HTMLDialogElement>('#confirm-dialog');
const audio = new ArenaAudio();
const customizations = new Customizations();
const displayName = (process: Pick<AppInfo, 'id' | 'name'>) => customizations.displayName(process);
const stats = new DailyStats();
const commentator = new Commentator(displayName);
const wallet = new Wallet();
const betting = new BettingDesk($('#bet-card'), wallet);
const missions = new MissionBoard(displayName);
const coach = new Coach();
const guide = new Guide(() => startTour());
const basho = new Basho();
const select = (id?: string) => arena.select(id);
const bashoDialog = new BashoDialog(basho, (id, name) => displayName({ id, name }), select);
const fans = new FanWatch(() => client.history(), (id, name) => displayName({ id, name }), select);
const feed = new Feed($('#commentary'), audio, select);
const side = new SidePanel(basho, displayName, select);
const recap = new Recap(stats, displayName);
const controls = new ViewControls(audio, () => arena.select());
/** First sighting of every app during this session. */
const firstSeen = new Map<string, number>();
const details = new ProcessPanel({
  customizations,
  stats,
  firstSeen,
  onCustomize: customize,
  onPushOut: () => {
    const process = selectedId === undefined ? undefined : findApp(selectedId);
    if (process) requestPushOut(process);
  },
  onClose: () => arena.select(),
});
let guidedBet = false;
let welcomed = false;
let latestSnapshot: AppSnapshot | undefined;
let selectedId: string | undefined;
let pendingPushOut: AppInfo | undefined;
let arenaLimit = 20;

function findApp(id: string): AppInfo | undefined {
  return latestSnapshot?.processes.find((process) => process.id === id);
}

/** The apps that compete: everything but the macOS referee. */
function competitors(): AppInfo[] {
  return latestSnapshot?.processes.filter((process) => !process.system) ?? [];
}

function showProcess(process?: AppInfo): void {
  selectedId = process?.id;
  side.select(selectedId);
  const index = process ? competitors().findIndex((candidate) => candidate.id === process.id) : 0;
  const rank = process?.system ? REFEREE : rankFor(Math.max(index, 0));
  if (details.show(process, rank, latestSnapshot?.total_memory ?? 0)) feed.highlight(selectedId);
}

const arena = new Arena($<HTMLCanvasElement>('#arena'), $('#labels'), {
  onSelect: showProcess,
  customization: (id) => customizations.get(id),
  onBoutStart: (east, west, eastChance) => {
    audio.gong();
    const eastName = displayName(east);
    const westName = displayName(west);
    const bailout = betting.offer({ eastId: east.id, eastName, westId: west.id, westName, eastChance });
    arena.showOdds(betting.oddsByFighter());
    feed.announce([{ kind: 'bout', id: east.id, text: narrate('bout', eastName, westName) }]);
    if (bailout > 0) say('mission', east, `A bowl of chanko on the house: +${bailout} points to keep playing`);
    if (guidedBet) {
      guidedBet = false;
      // Let the card slide in before pointing at it.
      window.setTimeout(() => {
        if (betting.open) coach.point('#bet-card', 'Your first prediction', 'Tap the wrestler you think will win, in the ring or down here. The underdog pays more. You only have a few seconds!');
      }, 350);
    }
    controls.offerSound();
  },
  onBoutClash: () => {
    audio.thud();
    betting.lock();
    arena.showOdds();
    coach.dismiss();
  },
  onPick: (process) => {
    if (!betting.pickFighter(process.id)) return false;
    coach.dismiss();
    return true;
  },
  onBoutResult: (winner, loser, kimarite) => {
    audio.roar();
    stats.recordBout(winner, loser);
    handleBasho(basho.recordBout(winner, loser, displayName));
    feed.announce([{ kind: 'win', id: winner.id, text: narrate('win', displayName(winner), `${kimarite.label} (${kimarite.name})`) }]);
    const outcome = betting.settle(winner.id);
    if (outcome?.picked) {
      stats.recordPrediction(outcome.won);
      if (outcome.won) {
        audio.claps();
        flyCoins($('#bet-card'));
      }
      handleMissions(missions.predicted(outcome.won));
    }
    if (selectedId === winner.id || selectedId === loser.id) showProcess(findApp(selectedId));
  },
  onBoutAbort: () => {
    betting.cancel();
    arena.showOdds();
    coach.dismiss();
  },
  onPushOut: requestPushOut,
});

/** Ask before closing an app; protected apps get an explanation instead of a choice. */
function requestPushOut(process: AppInfo): void {
  pendingPushOut = process;
  const name = displayName(process);
  const locked = process.locked;
  confirmDialog.dataset.mode = locked ? 'locked' : 'confirm';
  $('#confirm-accept').hidden = locked;
  $('#confirm-cancel').textContent = locked ? 'OK, it stays' : 'Let it fight';
  $('#confirm-title').textContent = locked ? `${name} is protected` : `Push ${name} out?`;
  $('#confirm-copy').textContent = locked
    ? 'It is a system process, belongs to another user or runs SUMO itself: quitting it could freeze the Mac or the arena. Protected apps have a padlock on their label.'
    : process.process_count > 1
      ? `The app will quit along with its ${process.process_count} processes. If it has open documents, it may ask you to save them.`
      : 'The app will quit. If it has open documents, it may ask you to save them.';
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
}

confirmDialog.addEventListener('close', () => {
  const process = pendingPushOut;
  pendingPushOut = undefined;
  if (!process) return;
  if (confirmDialog.returnValue !== 'confirm') {
    arena.resolvePushOut(process.id, false);
    return;
  }
  void pushOut(process);
});

async function pushOut(process: AppInfo): Promise<void> {
  arena.resolvePushOut(process.id, true);
  audio.thud(1.2);
  audio.roar(2.8);
  const failure = await client.quit(process);
  const name = displayName(process);
  if (failure) {
    arena.release(process.id);
    say('resist', process, `${name} holds on: ${failure}`);
    return;
  }
  stats.recordPushOut();
  handleMissions(missions.pushedOut(process));
  commentator.hush(process.id);
  say('out', process, narrate('out', name));
  window.setTimeout(() => {
    if (findApp(process.id)) {
      arena.release(process.id);
      say('resist', process, narrate('resist', name));
    }
  }, QUIT_GRACE_MS);
}

function customize(patch: CustomizationPatch): void {
  if (selectedId === undefined) return;
  const next = customizations.set(selectedId, patch);
  arena.customize(selectedId, next);
  if (latestSnapshot) side.renderBanzuke(competitors(), selectedId);
  showProcess(findApp(selectedId));
}

$<HTMLInputElement>('#crowd-limit').addEventListener('input', (event) => {
  arenaLimit = Number((event.target as HTMLInputElement).value);
  $<HTMLOutputElement>('#crowd-limit-value').value = arenaLimit.toString();
  commentator.reset();
  if (latestSnapshot) updateSnapshot(latestSnapshot);
});

function startTour(): void {
  arena.select();
  coach.start(TOUR, () => {
    guidedBet = true;
    arena.requestBout();
  });
}

const SHORTCUT_ACTIONS: Record<string, () => void> = {
  b: () => arena.requestBout(),
  h: () => controls.toggleZen(),
  l: () => side.toggle(),
  r: () => recap.open(),
  c: () => fans.open(),
  t: () => bashoDialog.open(),
  s: () => controls.toggleSound(),
  f: () => controls.toggleFullscreen(),
  '?': () => guide.openGuide(),
};

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
  if (coach.active || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    if (controls.zen) controls.toggleZen(false);
    else arena.select();
    return;
  }
  const action = SHORTCUT_ACTIONS[event.key.toLowerCase()];
  if (!action) return;
  event.preventDefault();
  action();
});

function updateConnection(state: ConnectionState): void {
  $('#connection').className = `connection is-${state}`;
  $('#connection-text').textContent = state === 'live'
    ? 'Live from your Mac'
    : state === 'connecting' ? 'Connecting' : 'Reconnecting';
  if (state !== 'live' && !latestSnapshot) {
    loading.classList.remove('is-hidden');
    $('#loading-title').textContent = state === 'reconnecting'
      ? 'The local engine is not responding'
      : 'Calling the wrestlers';
    $('#loading-copy').textContent = state === 'reconnecting'
      ? 'Run sumo in your terminal. Retrying automatically.'
      : 'Reading processes from the local engine…';
  }
}

/** Tournament milestones go to the commentary; a yūshō gets the full celebration. */
function handleBasho(events: BashoEvent[]): void {
  for (const event of events) {
    if (event.kind === 'opening') {
      feed.announce([{ kind: 'basho', id: 'basho', text: narrate('basho', `Day 1 of the ${event.basho}: hakkeyoi!`) }]);
    } else if (event.kind === 'yusho') {
      const { champion } = event;
      const name = displayName({ id: champion.id, name: champion.name });
      feed.announce([{ kind: 'basho', id: champion.id, text: narrate('basho', `${name} wins the ${champion.basho}, ${champion.wins}–${champion.losses}!`) }]);
      audio.gong();
      audio.roar(3.2);
      arena.cheer();
    } else {
      const name = displayName({ id: event.id, name: event.name });
      const text = event.kind === 'kachi-koshi'
        ? `${name} secures kachi-koshi: ${KACHI_KOSHI} wins this basho!`
        : `${name} falls to make-koshi: ${KACHI_KOSHI} losses this basho`;
      feed.announce([{ kind: 'basho', id: event.id, text: narrate('basho', text) }]);
      if (event.kind === 'kachi-koshi') audio.claps();
    }
  }
}

function handleMissions(events: MissionEvent[]): void {
  for (const event of events) {
    if (event.kind !== 'completed') continue;
    const { mission } = event;
    wallet.earn(mission.reward);
    flyCoins(side.missionsAnchor);
    side.flagMissions();
    stats.recordMission();
    audio.claps();
    arena.cheer();
    feed.announce([{ kind: 'mission', id: mission.appId ?? mission.id, text: narrate('mission', mission.title, mission.reward.toString()) }]);
  }
  side.renderMissions(missions.active);
}

function say(kind: CommentaryKind, process: AppInfo, text: string): void {
  feed.announce([{ kind, id: process.id, text }]);
}

function updateSnapshot(snapshot: AppSnapshot): void {
  latestSnapshot = snapshot;
  loading.classList.add('is-hidden');
  const now = Date.now();
  for (const process of snapshot.processes) {
    if (!firstSeen.has(process.id)) firstSeen.set(process.id, now);
  }
  const contenders = competitors();
  stats.observe(contenders, now);

  arena.setProcesses(snapshot.processes, arenaLimit);
  feed.announce(commentator.observe(snapshot.processes.slice(0, arenaLimit).filter((process) => !process.system)));
  side.renderBanzuke(contenders, selectedId);
  handleMissions(missions.observe(snapshot, now));

  $('#ram-used').textContent = formatBytes(snapshot.used_memory);
  $('#ram-total').textContent = `of ${formatBytes(snapshot.total_memory)}`;
  const pressure = snapshot.used_memory / snapshot.total_memory;
  const meter = $('#ram-meter');
  meter.style.width = `${(pressure * 100).toFixed(1)}%`;
  meter.classList.toggle('is-high', pressure > 0.85);
  arena.setExcitement((pressure - 0.45) / 0.45);
  arena.setTension((pressure - 0.6) / 0.3);
  $('#arena-count').textContent = Math.min(arenaLimit, snapshot.processes.length).toString();
  $('#app-total').textContent = `of ${snapshot.processes.length.toLocaleString('en-US')}`;
  if (selectedId !== undefined) showProcess(findApp(selectedId));
  if (!welcomed) {
    welcomed = true;
    handleBasho(basho.rollover());
    // Wait for the panels to fill so the tour has something to point at.
    if (!coach.onboarded) window.setTimeout(startTour, 600);
  }
}

wallet.onChange(renderBalance);
renderBalance(wallet.balance);
$('#bout-now').addEventListener('click', () => arena.requestBout());
$('#guide-open').addEventListener('click', () => guide.openGuide());
$('#fans-open').addEventListener('click', () => fans.open());
$('#basho-open').addEventListener('click', () => bashoDialog.open());
installTermTooltips();
$('#bet-card').addEventListener('click', () => coach.dismiss());

const client = new ProcessClient(updateSnapshot, updateConnection);
void client.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    client.dispose();
    arena.dispose();
  });
}
