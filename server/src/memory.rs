use std::{
    collections::HashMap,
    io::{IsTerminal, Write},
    time::{Duration, Instant},
};

use serde::Deserialize;
use tokio::process::Command;

use sumo::Snapshots;

const REFRESH: Duration = Duration::from_secs(5);
const GB: u64 = 1024 * 1024 * 1024;
/// An app above this gets a notification, at most once per `APP_COOLDOWN`.
const HEAVY_APP: u64 = 8 * GB;
const APP_COOLDOWN: Duration = Duration::from_secs(30 * 60);
/// Share of RAM in use that counts as the Mac running out of memory.
const HIGH_PRESSURE: f64 = 0.9;
const PRESSURE_COOLDOWN: Duration = Duration::from_secs(15 * 60);
#[derive(Deserialize)]
struct Snapshot {
    total_memory: u64,
    used_memory: u64,
    processes: Vec<App>,
}

/// The engine's grouped apps, heaviest first.
#[derive(Deserialize)]
struct App {
    name: String,
    memory: u64,
    #[serde(default)]
    system: bool,
}

/// "7.2 GB", the way the arena writes it.
pub fn format_bytes(bytes: u64) -> String {
    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else {
        format!("{} MB", bytes / (1024 * 1024))
    }
}

/// A macOS notification; the texts are passed as arguments, never spliced into the script.
async fn notify(title: &str, body: &str) {
    let _ = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            "display notification (item 2 of argv) with title (item 1 of argv)",
            "-e",
            "end run",
            title,
            body,
        ])
        .status()
        .await;
}

/// Keep a one-line RAM summary in the terminal and warn about memory hogs.
pub async fn follow(snapshots: Snapshots, notifications: bool) {
    let status = std::io::stdout().is_terminal();
    let mut warned_apps: HashMap<String, Instant> = HashMap::new();
    let mut warned_pressure: Option<Instant> = None;
    let mut interval = tokio::time::interval(REFRESH);
    loop {
        interval.tick().await;
        let payload = snapshots.borrow().clone();
        let Ok(snapshot) = serde_json::from_str::<Snapshot>(&payload) else {
            continue;
        };
        let pressure = snapshot.used_memory as f64 / snapshot.total_memory.max(1) as f64;
        let apps: Vec<&App> = snapshot
            .processes
            .iter()
            .filter(|app| !app.system)
            .collect();

        if status {
            let top = apps
                .first()
                .map(|app| format!("  ·  on top {} {}", app.name, format_bytes(app.memory)))
                .unwrap_or_default();
            print!(
                "\r\x1b[2K  RAM {} of {} ({:.0}%){top}",
                format_bytes(snapshot.used_memory),
                format_bytes(snapshot.total_memory),
                pressure * 100.0
            );
            let _ = std::io::stdout().flush();
        }
        if !notifications {
            continue;
        }

        let now = Instant::now();
        for app in apps.iter().filter(|app| app.memory >= HEAVY_APP) {
            let recent = warned_apps
                .get(&app.name)
                .is_some_and(|at| now.duration_since(*at) < APP_COOLDOWN);
            if !recent {
                warned_apps.insert(app.name.clone(), now);
                notify(
                    &format!("{} is a heavyweight", app.name),
                    &format!(
                        "It is using {} of memory. Open the arena to put it on a diet.",
                        format_bytes(app.memory)
                    ),
                )
                .await;
            }
        }
        if pressure >= HIGH_PRESSURE
            && warned_pressure.is_none_or(|at| now.duration_since(at) >= PRESSURE_COOLDOWN)
        {
            warned_pressure = Some(now);
            let culprit = apps
                .first()
                .map(|app| format!(" The heaviest is {}.", app.name))
                .unwrap_or_default();
            notify(
                "Your Mac is running low on memory",
                &format!("RAM at {:.0}%.{culprit}", pressure * 100.0),
            )
            .await;
        }
    }
}
