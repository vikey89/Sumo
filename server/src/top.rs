//! `sumo top`: the banzuke in the terminal, for a quick look without opening the arena.

use std::{
    io::{IsTerminal, Read, Write},
    time::Duration,
};

use serde::Deserialize;

use crate::memory::format_bytes;

const REFRESH: Duration = Duration::from_secs(2);
const NAME_WIDTH: usize = 30;
const TITLE_WIDTH: usize = 13;
const BAR_WIDTH: usize = 12;
/// Narrower terminals drop the memory bar.
const BAR_MIN_COLUMNS: usize = 92;
/// Lines around the table: header, column titles, referee and footer.
const FRAME_LINES: usize = 9;
/// RAM use that turns the header red, as the arena does.
const HIGH_PRESSURE: f64 = 0.85;

#[derive(Deserialize)]
struct Snapshot {
    total_memory: u64,
    used_memory: u64,
    process_count: usize,
    processes: Vec<App>,
}

#[derive(Deserialize)]
struct App {
    name: String,
    memory: u64,
    cpu: f32,
    #[serde(default)]
    system: bool,
}

/// ANSI styling, off when piped or with NO_COLOR.
struct Style {
    color: bool,
}

impl Style {
    fn paint(&self, code: &str, text: &str) -> String {
        if self.color {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_owned()
        }
    }
}

/// Banzuke rank for a position in the memory ranking (0 = heaviest), as in the arena.
fn rank(index: usize) -> (&'static str, String) {
    match index {
        0 => ("横綱", "Yokozuna".into()),
        1 | 2 => ("大関", "Ōzeki".into()),
        3 | 4 => ("関脇", "Sekiwake".into()),
        5 | 6 => ("小結", "Komusubi".into()),
        _ => ("前頭", format!("Maegashira {}", index - 6)),
    }
}

/// Pad or cut `text` to exactly `width` characters.
fn fit(text: &str, width: usize) -> String {
    if text.chars().count() <= width {
        format!("{text:<width$}")
    } else {
        let cut: String = text.chars().take(width - 1).collect();
        format!("{cut}…")
    }
}

fn bar(share: f64, style: &Style) -> String {
    let filled = ((share * BAR_WIDTH as f64).round() as usize).clamp(1, BAR_WIDTH);
    format!(
        "{}{}",
        style.paint("33", &"█".repeat(filled)),
        style.paint("2", &"░".repeat(BAR_WIDTH - filled))
    )
}

/// Rows and columns of the terminal on stdout.
fn terminal_size() -> Option<(usize, usize)> {
    // SAFETY: TIOCGWINSZ only writes into the winsize passed to it.
    let mut size: libc::winsize = unsafe { std::mem::zeroed() };
    let ok = unsafe { libc::ioctl(libc::STDOUT_FILENO, libc::TIOCGWINSZ, &mut size) } == 0;
    (ok && size.ws_row > 0).then_some((size.ws_row.into(), size.ws_col.into()))
}

fn render(
    snapshot: &Snapshot,
    size: Option<(usize, usize)>,
    live: bool,
    by_cpu: bool,
    style: &Style,
) -> Vec<String> {
    let (contenders, referee): (Vec<&App>, Vec<&App>) =
        snapshot.processes.iter().partition(|app| !app.system);
    let pressure = snapshot.used_memory as f64 / snapshot.total_memory.max(1) as f64;
    let shown = size.map_or(contenders.len(), |(rows, _)| {
        rows.saturating_sub(FRAME_LINES).max(3)
    });
    let with_bar = size.is_none_or(|(_, columns)| columns >= BAR_MIN_COLUMNS);
    // Ranks always follow memory, as on the banzuke; `c` only reorders the rows.
    let mut ranked: Vec<(usize, &App)> = contenders.iter().copied().enumerate().collect();
    if by_cpu {
        ranked.sort_by(|a, b| b.1.cpu.total_cmp(&a.1.cpu));
    }
    let measure = |app: &App| {
        if by_cpu {
            f64::from(app.cpu)
        } else {
            app.memory as f64
        }
    };
    let top = ranked.first().map_or(1.0, |(_, app)| measure(app).max(1.0));

    let ram = format!(
        "RAM {} of {} ({:.0}%)",
        format_bytes(snapshot.used_memory),
        format_bytes(snapshot.total_memory),
        pressure * 100.0
    );
    let mut lines = vec![
        String::new(),
        format!(
            "  {} {}   {}  {}",
            style.paint("1;31", "相撲"),
            style.paint("1", "SUMO top"),
            style.paint(
                if pressure >= HIGH_PRESSURE {
                    "1;31"
                } else {
                    "1"
                },
                &ram
            ),
            style.paint(
                "2",
                &format!(
                    "· {} apps, {} processes",
                    contenders.len(),
                    snapshot.process_count
                )
            ),
        ),
        String::new(),
        style.paint(
            "2",
            &format!(
                "  {:<w$}  {}  {:>9}  {:>6}",
                "RANK",
                fit("APP", NAME_WIDTH),
                if by_cpu { "MEMORY" } else { "MEMORY ▾" },
                if by_cpu { "CPU ▾" } else { "CPU" },
                w = TITLE_WIDTH + 5
            ),
        ),
    ];

    let row = |kanji: &str, title: &str, app: &App, bar: String| {
        format!(
            "  {} {}  {}  {:>9}  {:>5.0}%  {bar}",
            style.paint("33", kanji),
            fit(title, TITLE_WIDTH),
            fit(&app.name, NAME_WIDTH),
            format_bytes(app.memory),
            app.cpu
        )
    };
    for (row_index, &(index, app)) in ranked.iter().take(shown).enumerate() {
        let (kanji, title) = rank(index);
        let share = measure(app) / top;
        let bar = if with_bar {
            bar(share, style)
        } else {
            String::new()
        };
        let line = row(kanji, &title, app, bar);
        lines.push(if row_index == 0 {
            style.paint("1", &line)
        } else {
            line
        });
    }
    if contenders.len() > shown {
        lines.push(style.paint("2", &format!("  … and {} more", contenders.len() - shown)));
    }
    for app in referee {
        lines.push(String::new());
        lines.push(style.paint(
            "2",
            &row("行司", "Gyōji", app, "referee: never fights".into()),
        ));
    }
    lines.push(String::new());
    if live {
        let sort = if by_cpu {
            "m sort by memory"
        } else {
            "c sort by CPU"
        };
        lines.push(style.paint(
            "2",
            &format!("  Every 2 s · {sort} · q to quit · `sumo` opens the arena"),
        ));
    }
    lines
}

/// Live in a terminal; a single snapshot when piped.
pub async fn run() {
    let live = std::io::stdout().is_terminal();
    let style = Style {
        color: live && std::env::var_os("NO_COLOR").is_none(),
    };
    let mut sampler = sumo::Sampler::new().await;
    let read =
        |sampler: &mut sumo::Sampler| serde_json::from_str::<Snapshot>(&sampler.sample()).ok();

    let mut stdout = std::io::stdout();
    if !live {
        if let Some(snapshot) = read(&mut sampler) {
            let _ = writeln!(
                stdout,
                "{}",
                render(&snapshot, None, false, false, &style).join("\n")
            );
        }
        return;
    }

    // Alternate screen with a hidden cursor and single-key input, all restored on the way out.
    let raw = RawMode::enable();
    let mut keys = keys();
    let _ = write!(stdout, "\x1b[?1049h\x1b[?25l");
    let quit = tokio::signal::ctrl_c();
    tokio::pin!(quit);
    let mut interval = tokio::time::interval(REFRESH);
    let mut by_cpu = false;
    let mut latest: Option<Snapshot> = None;
    loop {
        tokio::select! {
            _ = &mut quit => break,
            key = keys.recv() => match key {
                Some(b'q' | b'Q') | None => break,
                Some(b'c' | b'C') => by_cpu = true,
                Some(b'm' | b'M') => by_cpu = false,
                Some(_) => continue,
            },
            _ = interval.tick() => match read(&mut sampler) {
                Some(snapshot) => latest = Some(snapshot),
                None => continue,
            },
        }
        let Some(snapshot) = &latest else { continue };
        let lines = render(snapshot, terminal_size(), true, by_cpu, &style);
        // Overwrite in place instead of clearing, so the table doesn't flicker.
        let _ = write!(stdout, "\x1b[H{}\x1b[J", lines.join("\x1b[K\n"));
        let _ = stdout.flush();
    }
    let _ = write!(stdout, "\x1b[?25h\x1b[?1049l");
    let _ = stdout.flush();
    drop(raw);
}

/// Keys read one at a time from stdin; closes when stdin does.
fn keys() -> tokio::sync::mpsc::UnboundedReceiver<u8> {
    let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
    if std::io::stdin().is_terminal() {
        std::thread::spawn(move || {
            let mut byte = [0u8; 1];
            while let Ok(1) = std::io::stdin().read(&mut byte) {
                if sender.send(byte[0]).is_err() {
                    break;
                }
            }
        });
    } else {
        // Keep the sender alive so a missing keyboard is not read as "quit".
        std::mem::forget(sender);
    }
    receiver
}

/// The terminal without line buffering or echo, so `q` and `c` act at once; Ctrl+C still works.
struct RawMode(libc::termios);

impl RawMode {
    fn enable() -> Option<Self> {
        // SAFETY: tcgetattr/tcsetattr only read and write the termios structs passed to them.
        unsafe {
            let mut original: libc::termios = std::mem::zeroed();
            if libc::tcgetattr(libc::STDIN_FILENO, &mut original) != 0 {
                return None;
            }
            let mut raw = original;
            raw.c_lflag &= !(libc::ICANON | libc::ECHO);
            raw.c_cc[libc::VMIN] = 1;
            raw.c_cc[libc::VTIME] = 0;
            (libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &raw) == 0)
                .then_some(Self(original))
        }
    }
}

impl Drop for RawMode {
    fn drop(&mut self) {
        // SAFETY: restores the settings read in `enable`.
        unsafe {
            libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &self.0);
        }
    }
}
