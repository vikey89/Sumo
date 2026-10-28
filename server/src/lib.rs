use std::sync::{
    Arc, Mutex, MutexGuard,
    atomic::{AtomicUsize, Ordering},
};

use sysinfo::{MINIMUM_CPU_UPDATE_INTERVAL, System};
use tokio::{net::TcpListener, sync::watch};

mod apps;
mod guard;
mod history;
mod quit;
mod routes;
mod runtimes;
mod sampler;

pub use routes::has_arena;
pub use sampler::Sampler;

/// Latest snapshot, serialized once and shared by every client.
pub type Snapshots = watch::Receiver<Arc<str>>;
type SharedSystem = Arc<Mutex<System>>;
type SharedHistory = Arc<Mutex<history::History>>;

/// A running engine: its live snapshots, and how many arena tabs are watching.
pub struct Engine {
    pub snapshots: Snapshots,
    viewers: Arc<AtomicUsize>,
}

impl Engine {
    /// Arena pages connected right now.
    pub fn viewers(&self) -> usize {
        self.viewers.load(Ordering::Relaxed)
    }
}

/// Start sampling and serving on `listener` in the background.
pub async fn serve(listener: TcpListener) -> std::io::Result<Engine> {
    let guard = Arc::new(guard::Guard::new(listener.local_addr()?.port()));
    let mut system = System::new();
    sampler::refresh(&mut system);
    tokio::time::sleep(MINIMUM_CPU_UPDATE_INTERVAL).await;
    sampler::refresh(&mut system);

    let (sender, snapshots) = watch::channel(sampler::serialize(&system));
    let system = Arc::new(Mutex::new(system));
    let history = Arc::new(Mutex::new(history::History::new()));
    tokio::spawn(sampler::sample(system.clone(), history.clone(), sender));
    let viewers = Arc::new(AtomicUsize::new(0));

    let app = routes::router(
        guard,
        routes::AppState {
            snapshots: snapshots.clone(),
            system,
            history,
            viewers: viewers.clone(),
        },
    );

    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, app).await {
            eprintln!("sumo engine stopped: {error}");
        }
    });
    Ok(Engine { snapshots, viewers })
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
