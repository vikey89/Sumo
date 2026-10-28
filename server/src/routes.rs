//! The HTTP side: the router, its handlers, the embedded arena page and the snapshot stream.

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use axum::{
    Router,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{
        Method, StatusCode, Uri,
        header::{self, HeaderValue},
    },
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::SinkExt;
use tower_http::cors::CorsLayer;

use crate::{
    SharedHistory, SharedSystem, Snapshots,
    guard::{Guard, local_only},
    lock, quit,
};

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) snapshots: Snapshots,
    pub(crate) system: SharedSystem,
    pub(crate) history: SharedHistory,
    pub(crate) viewers: Arc<AtomicUsize>,
}

/// The arena page, built by `npm run build` and baked into the binary.
#[derive(rust_embed::Embed)]
#[folder = "../dist"]
#[allow_missing = true]
struct Assets;

/// True when the arena page was embedded at build time.
pub fn has_arena() -> bool {
    Assets::get("index.html").is_some()
}

pub(crate) fn router(guard: Arc<Guard>, state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(
            guard
                .origins
                .iter()
                .filter_map(|origin| HeaderValue::from_str(origin).ok())
                .collect::<Vec<_>>(),
        )
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);

    Router::new()
        .route("/health", get(health))
        .route("/api/processes", get(processes))
        .route("/api/history", get(cpu_history))
        .route("/api/quit", post(quit::quit))
        .route("/ws", get(websocket))
        .fallback(get(asset))
        .with_state(state)
        .layer(cors)
        .layer(middleware::from_fn_with_state(guard, local_only))
}

async fn asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    let Some(file) = Assets::get(path) else {
        return if has_arena() {
            StatusCode::NOT_FOUND.into_response()
        } else {
            (
                StatusCode::NOT_FOUND,
                "Arena not embedded: run `npm run build` before building sumo.",
            )
                .into_response()
        };
    };
    // Vite fingerprints everything under assets/, so only the page itself must be revalidated.
    let cache = if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    (
        [
            (header::CONTENT_TYPE, file.metadata.mimetype().to_owned()),
            (header::CACHE_CONTROL, cache.to_owned()),
        ],
        file.data,
    )
        .into_response()
}

/// Also how `sumo stop` finds the engine to stop.
async fn health() -> impl IntoResponse {
    let payload = format!(
        r#"{{"status":"ok","app":"sumo","pid":{}}}"#,
        std::process::id()
    );
    ([(header::CONTENT_TYPE, "application/json")], payload)
}

/// The last ten minutes of CPU load, for "who turned the fans on?".
async fn cpu_history(State(state): State<AppState>) -> impl IntoResponse {
    let payload = lock(&state.history).to_json();
    ([(header::CONTENT_TYPE, "application/json")], payload)
}

async fn processes(State(state): State<AppState>) -> impl IntoResponse {
    let payload = state.snapshots.borrow().to_string();
    ([(header::CONTENT_TYPE, "application/json")], payload)
}

async fn websocket(State(state): State<AppState>, upgrade: WebSocketUpgrade) -> Response {
    upgrade.on_upgrade(move |socket| async move {
        state.viewers.fetch_add(1, Ordering::Relaxed);
        stream_snapshots(socket, state.snapshots).await;
        state.viewers.fetch_sub(1, Ordering::Relaxed);
    })
}

async fn stream_snapshots(mut socket: WebSocket, mut snapshots: Snapshots) {
    snapshots.mark_changed();

    loop {
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() {
                    break;
                }
                let payload = snapshots.borrow_and_update().to_string();
                if socket.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Close(_))) => {
                        let _ = socket.close().await;
                        break;
                    }
                    Some(Err(_)) | None => break,
                    _ => {}
                }
            }
        }
    }
}
