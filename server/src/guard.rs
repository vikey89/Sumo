//! The engine answers only to itself: a Host and Origin check in front of every route.

use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};

/// The Vite dev server, allowed only in debug builds of the engine.
const DEV_ORIGINS: [&str; 2] = ["http://localhost:5173", "http://127.0.0.1:5173"];

/// Hosts and origins the engine answers to: its own address, plus Vite while developing.
pub(crate) struct Guard {
    hosts: Vec<String>,
    pub(crate) origins: Vec<String>,
}

impl Guard {
    pub(crate) fn new(port: u16) -> Self {
        let hosts = vec![format!("127.0.0.1:{port}"), format!("localhost:{port}")];
        let mut origins: Vec<String> = hosts.iter().map(|host| format!("http://{host}")).collect();
        if cfg!(debug_assertions) {
            origins.extend(DEV_ORIGINS.map(str::to_owned));
        }
        Self { hosts, origins }
    }
}

/// The process list reveals installed apps and home paths, and `/api/quit` closes apps.
/// CORS does not apply to WebSockets or simple POSTs, so any page could otherwise reach
/// them; the Host check also blocks DNS rebinding.
pub(crate) async fn local_only(
    State(guard): State<Arc<Guard>>,
    request: Request,
    next: Next,
) -> Response {
    let headers = request.headers();
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let allowed = host.is_some_and(|host| guard.hosts.iter().any(|allowed| allowed == host))
        && origin.is_none_or(|origin| guard.origins.iter().any(|allowed| allowed == origin));
    if allowed {
        next.run(request).await
    } else {
        StatusCode::FORBIDDEN.into_response()
    }
}
