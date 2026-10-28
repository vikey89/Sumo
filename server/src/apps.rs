//! Processes grouped into the apps a person recognises: Chrome and its helpers are one
//! fighter, and the macOS background plumbing is a single referee.

use std::collections::HashMap;

use serde::Serialize;
use ts_rs::TS;

pub const SYSTEM_ID: &str = "system:macos";
const SYSTEM_NAME: &str = "macOS";
/// Where macOS keeps its own executables.
pub(crate) const SYSTEM_PREFIXES: [&str; 5] =
    ["/System/", "/usr/", "/bin/", "/sbin/", "/Library/Apple/"];

/// One process, as sampled.
pub struct Process {
    pub pid: u32,
    pub name: String,
    pub executable: String,
    pub memory: u64,
    pub cpu: f32,
    /// System, foreign-user or arena-owned process: it can never be pushed out.
    pub locked: bool,
    /// For runtimes such as node or python: what they run, e.g. "vite · shop".
    pub label: Option<String>,
}

/// An app as the engine groups it: its main process plus helpers.
#[derive(Serialize, TS)]
#[ts(export, rename = "AppInfo")]
pub struct App {
    pub id: String,
    /// The process that names the app (its main executable), else the heaviest one.
    pub pid: u32,
    pub pids: Vec<u32>,
    pub name: String,
    pub memory: u64,
    pub cpu: f32,
    pub process_count: usize,
    /// At least one process is a system or arena process: the app cannot be pushed out.
    pub locked: bool,
    /// The macOS system processes, lumped into one fighter that referees instead of competing.
    /// Sent only when true.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub system: bool,
}

/// Background plumbing of macOS; apps the user opens (Preview, Finder…) keep their own fighter.
fn is_system(process: &Process) -> bool {
    let path = process.executable.as_str();
    process.locked
        && !path.starts_with("/System/Applications/")
        && !path.contains("/Finder.app/")
        && (path.is_empty()
            || SYSTEM_PREFIXES
                .iter()
                .any(|prefix| path.starts_with(prefix)))
}

/// Outermost `.app` bundle in a path: "Google Chrome" for every Chrome helper.
fn bundle_name(executable: &str) -> Option<&str> {
    let mut parts = executable.split('/').peekable();
    while let Some(part) = parts.next() {
        if let Some(name) = part.strip_suffix(".app")
            && !name.is_empty()
            && parts.peek().is_some()
        {
            return Some(name);
        }
    }
    None
}

/// "Code Helper (Renderer)" → "Code", for helpers that live outside a bundle.
fn without_helper(name: &str) -> &str {
    let base = match name
        .strip_suffix(')')
        .and_then(|rest| rest.rfind(" (").map(|at| &name[..at]))
    {
        Some(base) => base,
        None => name,
    };
    let lower = base.to_ascii_lowercase();
    if lower.ends_with(" helper") {
        &base[..base.len() - " helper".len()]
    } else {
        name
    }
}

fn identity(process: &Process) -> (String, String, bool) {
    if is_system(process) {
        return (SYSTEM_ID.into(), SYSTEM_NAME.into(), true);
    }
    let bundle = bundle_name(&process.executable);
    // A runtime shipped inside an app (Electron's node) belongs to the app; Python.app is
    // just how the python.org runtime is packaged.
    if let Some(label) = &process.label
        && bundle.is_none_or(|bundle| bundle.eq_ignore_ascii_case("python"))
    {
        let runtime = process.name.to_lowercase();
        return (
            format!("process:{runtime}:{}", label.to_lowercase()),
            label.clone(),
            false,
        );
    }
    if let Some(bundle) = bundle {
        return (
            format!("app:{}", bundle.to_lowercase()),
            bundle.into(),
            false,
        );
    }
    let name = without_helper(&process.name);
    (
        format!("process:{}", name.to_lowercase()),
        name.into(),
        false,
    )
}

/// Group processes into apps, heaviest first.
pub fn group(processes: &[Process]) -> Vec<App> {
    let mut apps: Vec<App> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for process in processes {
        let (id, name, system) = identity(process);
        if let Some(&at) = index.get(&id) {
            let app = &mut apps[at];
            app.memory += process.memory;
            app.cpu += process.cpu;
            app.process_count += 1;
            app.pids.push(process.pid);
            app.locked |= process.locked;
            if process.name == app.name {
                app.pid = process.pid;
            }
            continue;
        }
        index.insert(id.clone(), apps.len());
        apps.push(App {
            id,
            pid: process.pid,
            pids: vec![process.pid],
            name,
            memory: process.memory,
            cpu: process.cpu,
            process_count: 1,
            locked: process.locked,
            system,
        });
    }
    apps.sort_by(|a, b| b.memory.cmp(&a.memory).then_with(|| a.id.cmp(&b.id)));
    apps
}

#[cfg(test)]
mod tests {
    use super::*;

    fn process(pid: u32, name: &str, executable: &str, memory: u64, locked: bool) -> Process {
        Process {
            pid,
            name: name.into(),
            executable: executable.into(),
            memory,
            cpu: 1.0,
            locked,
            label: None,
        }
    }

    #[test]
    fn helpers_join_their_bundle() {
        let chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        let helper = "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU)";
        let apps = group(&[
            process(2, "Google Chrome Helper (GPU)", helper, 300, false),
            process(1, "Google Chrome", chrome, 200, false),
        ]);
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].id, "app:google chrome");
        assert_eq!(apps[0].name, "Google Chrome");
        assert_eq!(apps[0].memory, 500);
        assert_eq!(apps[0].pid, 1, "the main executable names the app");
        assert_eq!(apps[0].pids, [2, 1]);
    }

    #[test]
    fn locked_plumbing_becomes_the_referee_but_user_apps_do_not() {
        let apps = group(&[
            process(1, "launchd", "/sbin/launchd", 10, true),
            process(2, "WindowServer", "", 20, true),
            process(
                3,
                "Finder",
                "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder",
                30,
                true,
            ),
            process(
                4,
                "Preview",
                "/System/Applications/Preview.app/Contents/MacOS/Preview",
                40,
                true,
            ),
            process(5, "python3", "/usr/bin/python3", 50, false),
        ]);
        let system = apps.iter().find(|app| app.system).unwrap();
        assert_eq!(system.pids, [1, 2]);
        assert!(apps.iter().any(|app| app.name == "Finder" && !app.system));
        assert!(apps.iter().any(|app| app.name == "Preview" && !app.system));
        assert!(
            apps.iter().any(|app| app.name == "python3" && !app.system),
            "unlocked tools are not the system"
        );
    }

    #[test]
    fn runtimes_split_by_what_they_run() {
        let node = |pid, label: &str| Process {
            label: Some(label.into()),
            ..process(pid, "node", "/opt/homebrew/bin/node", 10, false)
        };
        let apps = group(&[
            node(1, "vite · shop"),
            node(2, "vite · shop"),
            node(3, "next · blog"),
            process(4, "node", "/opt/homebrew/bin/node", 5, false),
        ]);
        let names: Vec<_> = apps
            .iter()
            .map(|app| (app.name.as_str(), app.process_count))
            .collect();
        assert_eq!(names, [("vite · shop", 2), ("next · blog", 1), ("node", 1)]);

        let electron = Process {
            label: Some("worker".into()),
            ..process(
                5,
                "node",
                "/Applications/Kimi.app/Contents/Resources/node",
                10,
                false,
            )
        };
        assert_eq!(
            group(&[electron])[0].name,
            "Kimi",
            "a runtime inside an app stays with the app"
        );
    }

    #[test]
    fn loose_helpers_lose_their_suffix() {
        assert_eq!(without_helper("Code Helper (Renderer)"), "Code");
        assert_eq!(without_helper("Slack Helper"), "Slack");
        assert_eq!(without_helper("node"), "node");
        assert_eq!(without_helper("Foo (Bar)"), "Foo (Bar)");
    }

    #[test]
    fn bundle_needs_a_path_inside_it() {
        assert_eq!(
            bundle_name("/Applications/Foo.app/Contents/MacOS/Foo"),
            Some("Foo")
        );
        assert_eq!(bundle_name("/Applications/Foo.app"), None);
        assert_eq!(bundle_name("/usr/bin/node"), None);
    }
}
