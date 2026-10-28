mod memory;
mod top;

use std::{
    fs::OpenOptions,
    io::{ErrorKind, Read, Write},
    net::{SocketAddr, TcpStream},
    os::unix::process::CommandExt,
    path::PathBuf,
    process::{ExitCode, Stdio},
    time::{Duration, Instant},
};

use tokio::net::TcpListener;

const DEFAULT_PORT: u16 = 3001;
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// A background engine started by `sumo` quits once no arena tab has been open this long.
const IDLE_GRACE: Duration = Duration::from_secs(120);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const HELP: &str = "\
SUMO: your Mac's processes wrestle in a sumo arena.

Usage:
  sumo            Open the arena in your browser (the engine starts in the
                  background and stops by itself when you close the tab)
  sumo stop       Stop the engine
  sumo status     Tell whether the engine is running
  sumo top        Your apps' ranking, live in this terminal
  sumo serve      Keep the engine in the foreground of this terminal

Options:
  -p, --port <port>   Local port for the arena (default 3001, or SUMO_PORT)
      --no-open       Don't open the browser
      --no-notify     No notifications when memory runs low
  -h, --help          Show this help
  -V, --version       Show the version

Always on, even at login:  brew services start sumo";

#[derive(Clone, Copy, PartialEq)]
enum Action {
    Open,
    Serve,
    Stop,
    Status,
    Top,
}

struct Options {
    action: Action,
    port: u16,
    open: bool,
    notify: bool,
    /// Started in the background by `sumo`: quit when the last tab is gone.
    idle_exit: bool,
}

enum Command {
    Run(Options),
    Print(String),
}

fn parse(mut args: impl Iterator<Item = String>) -> Result<Command, String> {
    let port = match std::env::var("SUMO_PORT") {
        Ok(value) => value
            .parse()
            .map_err(|_| format!("SUMO_PORT is not a valid port: {value}"))?,
        Err(_) => DEFAULT_PORT,
    };
    let mut options = Options {
        action: Action::Open,
        port,
        open: true,
        notify: true,
        idle_exit: false,
    };
    let mut first = true;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "open" if first => options.action = Action::Open,
            "serve" if first => options.action = Action::Serve,
            "stop" if first => options.action = Action::Stop,
            "status" if first => options.action = Action::Status,
            "top" if first => options.action = Action::Top,
            "-p" | "--port" => {
                let value = args.next().ok_or("--port needs a number")?;
                options.port = value
                    .parse()
                    .map_err(|_| format!("invalid port: {value}"))?;
            }
            "--no-open" => options.open = false,
            "--no-notify" => options.notify = false,
            "--idle-exit" => options.idle_exit = true,
            "-h" | "--help" => return Ok(Command::Print(HELP.into())),
            "-V" | "--version" => return Ok(Command::Print(format!("sumo {VERSION}"))),
            other => return Err(format!("unknown command or option: {other}\n\n{HELP}")),
        }
        first = false;
    }
    Ok(Command::Run(options))
}

/// What is listening on the arena's port.
enum Port {
    Free,
    /// A SUMO engine; versions before 0.1.0's background mode do not report their pid.
    Sumo(Option<u32>),
    Taken,
}

fn probe(port: u16) -> Port {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return Port::Free;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    let mut reply = String::new();
    if stream.write_all(request.as_bytes()).is_err()
        || stream.read_to_string(&mut reply).is_err()
        || !reply.contains(r#""app":"sumo""#)
    {
        return Port::Taken;
    }
    let pid = reply.split(r#""pid":"#).nth(1).and_then(|digits| {
        digits
            .chars()
            .take_while(char::is_ascii_digit)
            .collect::<String>()
            .parse()
            .ok()
    });
    Port::Sumo(pid)
}

fn port_taken(port: u16) -> ExitCode {
    eprintln!("sumo: port {port} is already used by another program; try --port");
    ExitCode::FAILURE
}

fn wait_until(timeout: Duration, mut done: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    done()
}

fn open_browser(url: &str) {
    let _ = std::process::Command::new("/usr/bin/open")
        .arg(url)
        .status();
}

fn log_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Logs/sumo.log"))
}

/// Start `sumo serve` detached from this terminal, so closing it leaves the arena running.
fn spawn_engine(options: &Options) -> std::io::Result<()> {
    let log =
        log_path().and_then(|path| OpenOptions::new().create(true).append(true).open(path).ok());
    let (stdout, stderr) = match log.and_then(|file| file.try_clone().ok().map(|copy| (file, copy)))
    {
        Some((out, err)) => (Stdio::from(out), Stdio::from(err)),
        None => (Stdio::null(), Stdio::null()),
    };
    let mut command = std::process::Command::new(std::env::current_exe()?);
    command
        .args([
            "serve",
            "--no-open",
            "--idle-exit",
            "--port",
            &options.port.to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr);
    if !options.notify {
        command.arg("--no-notify");
    }
    // SAFETY: setsid is async-signal-safe and touches nothing but the new process.
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    command.spawn().map(drop)
}

fn open(options: &Options, url: &str) -> ExitCode {
    let started = match probe(options.port) {
        Port::Sumo(_) => false,
        Port::Taken => return port_taken(options.port),
        Port::Free => {
            if let Err(error) = spawn_engine(options) {
                eprintln!("sumo: could not start the engine: {error}");
                return ExitCode::FAILURE;
            }
            if !wait_until(STARTUP_TIMEOUT, || {
                matches!(probe(options.port), Port::Sumo(_))
            }) {
                let log = log_path()
                    .map(|path| format!(" (details in {})", path.display()))
                    .unwrap_or_default();
                eprintln!(
                    "sumo: the engine did not start on port {}{log}",
                    options.port
                );
                return ExitCode::FAILURE;
            }
            true
        }
    };
    if options.open {
        open_browser(url);
    }
    match (started, options.open) {
        (true, true) => println!(
            "相撲 Arena open at {url}. It stops by itself when you close the tab, or run: sumo stop"
        ),
        (true, false) => println!(
            "相撲 Engine running at {url}. It stops by itself if no tab opens it, or run: sumo stop"
        ),
        (false, true) => println!("相撲 Arena open at {url} (the engine was already running)"),
        (false, false) => println!("相撲 The engine is already running at {url}"),
    }
    ExitCode::SUCCESS
}

fn stop(port: u16) -> ExitCode {
    let pid = match probe(port) {
        Port::Sumo(Some(pid)) => pid,
        Port::Sumo(None) => {
            eprintln!(
                "sumo: an older version of SUMO is running on port {port}: stop it with Ctrl+C in its terminal"
            );
            return ExitCode::FAILURE;
        }
        Port::Free | Port::Taken => {
            println!("SUMO is not running.");
            return ExitCode::SUCCESS;
        }
    };
    // SAFETY: plain syscall; the pid comes from the engine's own health reply.
    if unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) } != 0 {
        eprintln!(
            "sumo: could not stop the engine (pid {pid}): {}",
            std::io::Error::last_os_error()
        );
        return ExitCode::FAILURE;
    }
    if wait_until(Duration::from_secs(3), || {
        !matches!(probe(port), Port::Sumo(_))
    }) {
        println!("SUMO stopped.");
        ExitCode::SUCCESS
    } else {
        eprintln!("sumo: the engine (pid {pid}) did not stop");
        ExitCode::FAILURE
    }
}

async fn serve(options: &Options, url: &str) -> ExitCode {
    let listener = match TcpListener::bind(("127.0.0.1", options.port)).await {
        Ok(listener) => listener,
        Err(error)
            if error.kind() == ErrorKind::AddrInUse
                && matches!(probe(options.port), Port::Sumo(_)) =>
        {
            println!("SUMO is already running at {url}");
            if options.open {
                open_browser(url);
            }
            return ExitCode::SUCCESS;
        }
        Err(error) if error.kind() == ErrorKind::AddrInUse => return port_taken(options.port),
        Err(error) => {
            eprintln!("sumo: could not start the arena: {error}");
            return ExitCode::FAILURE;
        }
    };
    let engine = match sumo::serve(listener).await {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("sumo: could not start the arena: {error}");
            return ExitCode::FAILURE;
        }
    };

    if options.idle_exit {
        println!("sumo {VERSION}: arena at {url}");
    } else {
        println!("\n  相撲 SUMO {VERSION}\n\n  Arena    {url}\n  Quit     Ctrl+C\n");
    }
    if !sumo::has_arena() {
        eprintln!("  This build has no arena page: run `npm run build` and rebuild.\n");
    } else if options.open {
        open_browser(url);
    }

    tokio::spawn(memory::follow(engine.snapshots.clone(), options.notify));
    if options.idle_exit {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = until_unwatched(&engine) => println!("No arena open for {} minutes: stopping.", IDLE_GRACE.as_secs() / 60),
        }
    } else {
        let _ = tokio::signal::ctrl_c().await;
        println!();
    }
    ExitCode::SUCCESS
}

/// Resolves once no arena tab has been connected for `IDLE_GRACE`.
async fn until_unwatched(engine: &sumo::Engine) {
    let mut last_watched = Instant::now();
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        if engine.viewers() > 0 {
            last_watched = Instant::now();
        } else if last_watched.elapsed() >= IDLE_GRACE {
            return;
        }
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let options = match parse(std::env::args().skip(1)) {
        Ok(Command::Run(options)) => options,
        Ok(Command::Print(text)) => {
            println!("{text}");
            return ExitCode::SUCCESS;
        }
        Err(message) => {
            eprintln!("sumo: {message}");
            return ExitCode::from(2);
        }
    };
    let url = format!("http://127.0.0.1:{}", options.port);
    match options.action {
        Action::Open => open(&options, &url),
        Action::Serve => serve(&options, &url).await,
        Action::Stop => stop(options.port),
        Action::Top => {
            top::run().await;
            ExitCode::SUCCESS
        }
        Action::Status => match probe(options.port) {
            Port::Sumo(pid) => {
                let pid = pid.map(|pid| format!(" (pid {pid})")).unwrap_or_default();
                println!("SUMO is running at {url}{pid}.");
                ExitCode::SUCCESS
            }
            Port::Free | Port::Taken => {
                println!("SUMO is not running.");
                ExitCode::FAILURE
            }
        },
    }
}
