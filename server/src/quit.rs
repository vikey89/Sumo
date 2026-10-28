//! `/api/quit`: pushing an app out of the ring, politely first.

use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, Process, ProcessesToUpdate, Signal};
use tokio::process::Command;

use crate::{SharedSystem, lock, routes::AppState, sampler::locked_pids};

const QUIT_TIMEOUT: Duration = Duration::from_secs(4);
/// An app that acknowledged `quit` gets this long to exit before it is sent SIGTERM.
const QUIT_GRACE: Duration = Duration::from_secs(3);

#[derive(Deserialize)]
pub(crate) struct QuitRequest {
    pids: Vec<u32>,
}

#[derive(Serialize)]
struct QuitResponse {
    method: &'static str,
    signalled: usize,
}

/// Push an app out of the ring: a polite AppleScript `quit` for `.app` bundles (so the
/// app can ask to save documents), SIGTERM for everything else.
pub(crate) async fn quit(
    State(state): State<AppState>,
    Json(request): Json<QuitRequest>,
) -> Response {
    let system = state.system.clone();
    let plan = tokio::task::spawn_blocking(move || {
        let system = lock(&system);
        let locked = locked_pids(&system);
        let targets: Vec<&Process> = request
            .pids
            .iter()
            .filter_map(|pid| system.process(Pid::from_u32(*pid)))
            .collect();
        if targets.is_empty() {
            return Err(StatusCode::NOT_FOUND);
        }
        if targets
            .iter()
            .any(|process| locked.contains(&process.pid()))
        {
            return Err(StatusCode::FORBIDDEN);
        }
        let bundle = targets
            .iter()
            .find_map(|process| process.exe().and_then(app_bundle));
        Ok((
            bundle,
            targets
                .iter()
                .map(|process| process.pid())
                .collect::<Vec<_>>(),
        ))
    })
    .await;

    let (bundle, pids) = match plan {
        Ok(Ok(plan)) => plan,
        Ok(Err(status)) => return status.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    if let Some(bundle) = bundle {
        match quit_bundle(&bundle).await {
            // A save-changes dialog is open: leave the decision to the user.
            QuitReply::Pending => {
                return Json(QuitResponse {
                    method: "quit",
                    signalled: 1,
                })
                .into_response();
            }
            QuitReply::Done if exits_within(&state.system, &pids, QUIT_GRACE).await => {
                return Json(QuitResponse {
                    method: "quit",
                    signalled: 1,
                })
                .into_response();
            }
            // Not a scriptable app, or it ignored the request: fall back to SIGTERM.
            QuitReply::Done | QuitReply::Failed => {}
        }
    }

    let system = state.system.clone();
    let signalled = tokio::task::spawn_blocking(move || {
        let system = lock(&system);
        pids.iter()
            .filter_map(|pid| system.process(*pid))
            .filter(|process| process.kill_with(Signal::Term) == Some(true))
            .count()
    })
    .await
    .unwrap_or(0);
    Json(QuitResponse {
        method: "term",
        signalled,
    })
    .into_response()
}

enum QuitReply {
    Done,
    /// No reply yet, typically because the app is asking whether to save documents.
    Pending,
    Failed,
}

/// The path is passed as an argument, never spliced into the script.
async fn quit_bundle(bundle: &Path) -> QuitReply {
    let mut command = Command::new("/usr/bin/osascript");
    command
        .args([
            "-e",
            "on run argv",
            "-e",
            "tell application (item 1 of argv) to quit",
            "-e",
            "end run",
        ])
        .arg(bundle)
        .kill_on_drop(true);
    match tokio::time::timeout(QUIT_TIMEOUT, command.status()).await {
        Ok(Ok(status)) if status.success() => QuitReply::Done,
        Ok(_) => QuitReply::Failed,
        Err(_) => QuitReply::Pending,
    }
}

async fn exits_within(system: &SharedSystem, pids: &[Pid], grace: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + grace;
    loop {
        let system = system.clone();
        let pids = pids.to_vec();
        let alive = tokio::task::spawn_blocking(move || {
            let mut system = lock(&system);
            system.refresh_processes(ProcessesToUpdate::Some(&pids), true);
            pids.iter().any(|pid| system.process(*pid).is_some())
        })
        .await
        .unwrap_or(true);
        if !alive {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

/// Outermost `.app` bundle containing an executable, e.g. Chrome for its helpers.
fn app_bundle(executable: &Path) -> Option<PathBuf> {
    let mut path = PathBuf::new();
    for component in executable.components() {
        path.push(component);
        if path.extension().is_some_and(|extension| extension == "app") {
            return Some(path);
        }
    }
    None
}
