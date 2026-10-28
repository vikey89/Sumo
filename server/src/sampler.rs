//! Reading the machine: one snapshot of every process, grouped into apps, once a second.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use sysinfo::{
    MINIMUM_CPU_UPDATE_INTERVAL, Pid, Process, ProcessRefreshKind, ProcessesToUpdate, System, Uid,
    UpdateKind,
};
use tokio::{sync::watch, time::MissedTickBehavior};
use ts_rs::TS;

use crate::{SharedHistory, SharedSystem, apps, lock, runtimes};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(1);
/// Processes that launch the engine (a shell, or `npm run dev` → concurrently → cargo); their whole
/// tree, Vite included, is protected so the arena can never knock itself out.
const LAUNCHERS: [&str; 6] = ["sumo", "cargo", "node", "npm", "sh", "bash"];
const SYSTEM_NAMES: [&str; 3] = ["kernel_task", "launchd", "WindowServer"];

/// What the arena receives every second, over `/ws` and `/api/processes`.
#[derive(Serialize, TS)]
#[ts(export, rename = "AppSnapshot")]
pub(crate) struct Snapshot {
    pub(crate) timestamp: u64,
    pub(crate) total_memory: u64,
    pub(crate) used_memory: u64,
    /// Processes before grouping.
    pub(crate) process_count: usize,
    /// Grouped here rather than in the page: ~40 apps instead of ~700 processes a second.
    pub(crate) processes: Vec<apps::App>,
}

/// Takes snapshots on demand, without serving anything: what `sumo top` reads.
pub struct Sampler(System);

impl Sampler {
    /// Ready once a first CPU reading has settled.
    pub async fn new() -> Self {
        let mut system = System::new();
        refresh(&mut system);
        tokio::time::sleep(MINIMUM_CPU_UPDATE_INTERVAL).await;
        Self(system)
    }

    /// A snapshot in the same JSON the arena receives.
    pub fn sample(&mut self) -> Arc<str> {
        refresh(&mut self.0);
        serialize(&self.0)
    }
}

pub(crate) async fn sample(
    system: SharedSystem,
    history: SharedHistory,
    sender: watch::Sender<Arc<str>>,
) {
    let mut interval = tokio::time::interval(SAMPLE_INTERVAL);
    interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
    interval.tick().await;

    loop {
        interval.tick().await;
        let system = system.clone();
        let history = history.clone();
        let Ok(payload) = tokio::task::spawn_blocking(move || {
            let mut system = lock(&system);
            refresh(&mut system);
            let snapshot = snapshot(&system);
            lock(&history).record(snapshot.timestamp / 1000, &snapshot.processes);
            encode(&snapshot)
        })
        .await
        else {
            break;
        };
        if sender.send(payload).is_err() {
            break;
        }
    }
}

pub(crate) fn refresh(system: &mut System) {
    system.refresh_memory();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_memory()
            .with_cpu()
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_user(UpdateKind::OnlyIfNotSet)
            .with_cmd(UpdateKind::OnlyIfNotSet)
            .with_cwd(UpdateKind::OnlyIfNotSet),
    );
}

pub(crate) fn locked_pids(system: &System) -> HashSet<Pid> {
    let me = sysinfo::get_current_pid().ok();
    let my_user: Option<Uid> = me
        .and_then(|pid| system.process(pid))
        .and_then(|process| process.user_id().cloned());

    let mut locked: HashSet<Pid> = system
        .processes()
        .values()
        .filter(|process| is_system(process, my_user.as_ref()))
        .map(Process::pid)
        .collect();

    let Some(mut root) = me else { return locked };
    while let Some(parent) = system.process(root).and_then(Process::parent)
        && system
            .process(parent)
            .is_some_and(|process| LAUNCHERS.contains(&process.name().to_string_lossy().as_ref()))
    {
        root = parent;
    }

    let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for process in system.processes().values() {
        if let Some(parent) = process.parent() {
            children.entry(parent).or_default().push(process.pid());
        }
    }
    let mut visited = HashSet::new();
    let mut pending = vec![root];
    while let Some(pid) = pending.pop() {
        if visited.insert(pid) {
            locked.insert(pid);
            pending.extend(children.get(&pid).into_iter().flatten());
        }
    }
    locked
}

fn is_system(process: &Process, my_user: Option<&Uid>) -> bool {
    let executable = process
        .exe()
        .map(|path| path.to_string_lossy())
        .unwrap_or_default();
    process.pid().as_u32() <= 1
        || executable.is_empty()
        || apps::SYSTEM_PREFIXES
            .iter()
            .any(|prefix| executable.starts_with(prefix))
        || SYSTEM_NAMES.contains(&process.name().to_string_lossy().as_ref())
        || my_user.is_none_or(|user| process.user_id() != Some(user))
}

fn runtime_label(process: &Process, home: Option<&str>) -> Option<String> {
    let name = process.name().to_string_lossy();
    if !runtimes::is_runtime(&name) {
        return None;
    }
    let args: Vec<String> = process
        .cmd()
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let cwd = process.cwd().map(|path| path.to_string_lossy());
    runtimes::describe(&name, &args, cwd.as_deref(), home)
}

fn snapshot(system: &System) -> Snapshot {
    let locked = locked_pids(system);
    let home = std::env::var("HOME").ok();
    let mut processes: Vec<_> = system
        .processes()
        .values()
        .map(|process| apps::Process {
            pid: process.pid().as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            executable: process
                .exe()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default(),
            memory: process.memory(),
            cpu: process.cpu_usage(),
            locked: locked.contains(&process.pid()),
            label: runtime_label(process, home.as_deref()),
        })
        .collect();
    // Heaviest first, so an app's first process is its heaviest.
    processes.sort_by(|a, b| b.memory.cmp(&a.memory).then_with(|| a.pid.cmp(&b.pid)));

    Snapshot {
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        total_memory: system.total_memory(),
        used_memory: system.used_memory(),
        process_count: processes.len(),
        processes: apps::group(&processes),
    }
}

fn encode(snapshot: &Snapshot) -> Arc<str> {
    serde_json::to_string(snapshot)
        .unwrap_or_else(|_| "{}".into())
        .into()
}

pub(crate) fn serialize(system: &System) -> Arc<str> {
    encode(&snapshot(system))
}
