//! A name for the processes of language runtimes, which otherwise all look alike: five
//! fighters called "node" become "vite · my-app", "next · shop", "playwright-mcp".
//! Only the tool and the project folder name leave the engine, never the command line.

/// Runtime processes and the name the arena gives them.
fn runtime(name: &str) -> Option<&'static str> {
    let name = name.to_ascii_lowercase();
    Some(match name.as_str() {
        "node" => "node",
        "bun" => "bun",
        "deno" => "deno",
        "java" => "java",
        "ruby" => "ruby",
        "php" => "php",
        "perl" => "perl",
        "dotnet" => "dotnet",
        _ if name == "python" || name.starts_with("python3") || name.starts_with("python2") => {
            "python"
        }
        _ => return None,
    })
}

pub fn is_runtime(name: &str) -> bool {
    runtime(name).is_some()
}

/// Flags whose value is a separate argument, so it is not mistaken for the script.
const VALUE_FLAGS: [&str; 10] = [
    "-r",
    "--require",
    "--import",
    "--loader",
    "-cp",
    "-classpath",
    "--class-path",
    "-c",
    "--config",
    "-W",
];
/// Subcommands of runtimes that are also package runners (`bun run dev`, `deno task start`).
const SUBCOMMANDS: [&str; 6] = ["run", "x", "exec", "task", "test", "start"];
/// Entry files that say nothing about what is running.
const GENERIC: [&str; 6] = ["index", "main", "server", "app", "cli", "start"];

/// Package runners, as they show up in a process title (`npm exec @playwright/mcp@latest`).
const RUNNERS: [&str; 5] = ["npm", "npx", "pnpm", "yarn", "bunx"];
const RUNNER_VERBS: [&str; 4] = ["exec", "dlx", "run", "x"];

/// A process that renamed itself (npm sets `process.title`): the title is what it runs,
/// and the original arguments are gone.
fn from_title(title: &str) -> Option<String> {
    let mut words = title.split_whitespace();
    let first = words.next()?;
    let first = first.rsplit('/').next().unwrap_or(first);
    if !RUNNERS.contains(&first) {
        return Some(first.to_owned());
    }
    let package = words.find(|word| !word.starts_with('-') && !RUNNER_VERBS.contains(word));
    let Some(package) = package else {
        return Some(first.to_owned());
    };
    // Drop a version: @playwright/mcp@latest → @playwright/mcp, vite@5 → vite.
    let package = match package.rfind('@') {
        Some(at) if at > 0 => &package[..at],
        _ => package,
    };
    Some(package.to_owned())
}

/// What the runtime is running: a package from node_modules, a module, a jar or a script.
fn tool(runtime: &str, args: &[String]) -> Option<String> {
    let title = args.first()?;
    let launcher = title.split_whitespace().next()?;
    if self::runtime(launcher.rsplit('/').next().unwrap_or(launcher)).is_none() {
        return from_title(title);
    }
    let mut rest = args.iter().skip(1);
    while let Some(arg) = rest.next() {
        if arg == "-m" && runtime == "python" {
            return rest
                .next()
                .map(|module| module.split('.').next().unwrap_or(module).to_owned());
        }
        if arg == "-jar" {
            return rest.next().and_then(|jar| stem(jar));
        }
        if VALUE_FLAGS.contains(&arg.as_str()) {
            rest.next();
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        if SUBCOMMANDS.contains(&arg.as_str()) && matches!(runtime, "bun" | "deno") {
            continue;
        }
        if let Some(package) = package(arg) {
            return Some(package);
        }
        if runtime == "java" && !arg.contains('/') {
            // A main class: org.gradle.launcher.daemon.bootstrap.GradleDaemon → GradleDaemon.
            return arg.rsplit('.').next().map(str::to_owned);
        }
        return stem(arg).filter(|stem| !GENERIC.contains(&stem.as_str()));
    }
    None
}

/// `…/node_modules/vite/bin/vite.js` → vite, `…/node_modules/.bin/tsc` → tsc.
fn package(path: &str) -> Option<String> {
    let (_, inside) = path.rsplit_once("/node_modules/")?;
    let mut parts = inside.split('/');
    let first = parts.next()?;
    let name = match first {
        ".bin" => parts.next()?.to_owned(),
        scope if scope.starts_with('@') => format!("{scope}/{}", parts.next()?),
        name => name.to_owned(),
    };
    (!name.is_empty()).then_some(name)
}

/// File name without folders or extension.
fn stem(path: &str) -> Option<String> {
    let file = path.rsplit('/').next()?;
    let stem = match file.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem,
        _ => file,
    };
    (!stem.is_empty()).then(|| stem.to_owned())
}

/// The project folder: the working directory, unless it is home or the disk root.
fn project(cwd: Option<&str>, home: Option<&str>) -> Option<String> {
    let cwd = cwd?.trim_end_matches('/');
    if cwd.is_empty() || Some(cwd) == home.map(|home| home.trim_end_matches('/')) {
        return None;
    }
    cwd.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

/// "vite · my-app", "node · my-app", "playwright-mcp", or `None` when nothing is known.
pub fn describe(
    name: &str,
    args: &[String],
    cwd: Option<&str>,
    home: Option<&str>,
) -> Option<String> {
    let runtime = runtime(name)?;
    let tool = tool(runtime, args);
    let project = project(cwd, home);
    match (tool, project) {
        (Some(tool), Some(project)) if tool != project => Some(format!("{tool} · {project}")),
        (Some(tool), _) => Some(tool),
        (None, Some(project)) => Some(format!("{runtime} · {project}")),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: Option<&str> = Some("/Users/me");

    fn args(line: &str) -> Vec<String> {
        line.split(' ').map(str::to_owned).collect()
    }

    #[test]
    fn node_packages_are_named_after_the_package() {
        let vite = args("node /Users/me/shop/node_modules/vite/bin/vite.js --port 5173");
        assert_eq!(
            describe("node", &vite, Some("/Users/me/shop"), HOME).as_deref(),
            Some("vite · shop")
        );
        let npx = args("node /Users/me/.npm/_npx/98/node_modules/.bin/playwright-mcp");
        assert_eq!(
            describe("node", &npx, Some("/Users/me/sumo"), HOME).as_deref(),
            Some("playwright-mcp · sumo")
        );
        let scoped = args("node /Users/me/x/node_modules/@angular/cli/bin/ng serve");
        assert_eq!(
            describe("node", &scoped, HOME, HOME).as_deref(),
            Some("@angular/cli")
        );
    }

    #[test]
    fn renamed_processes_use_their_title() {
        let npm = vec![
            "npm exec @playwright/mcp@latest".to_owned(),
            "/Users/me".to_owned(),
        ];
        assert_eq!(
            describe("node", &npm, Some("/Users/me/sumo"), HOME).as_deref(),
            Some("@playwright/mcp · sumo")
        );
        let next = vec!["next-server (v15.1.0)".to_owned()];
        assert_eq!(
            describe("node", &next, Some("/Users/me/blog"), HOME).as_deref(),
            Some("next-server · blog")
        );
        let full_path = args("/opt/homebrew/bin/node server.js");
        assert_eq!(
            describe("node", &full_path, Some("/Users/me/api"), HOME).as_deref(),
            Some("node · api")
        );
    }

    #[test]
    fn scripts_and_generic_entries() {
        let script = args("node --inspect worker.js");
        assert_eq!(
            describe("node", &script, Some("/Users/me/api"), HOME).as_deref(),
            Some("worker · api")
        );
        let generic = args("node -r dotenv/config dist/index.js");
        assert_eq!(
            describe("node", &generic, Some("/Users/me/api"), HOME).as_deref(),
            Some("node · api")
        );
        assert_eq!(describe("node", &args("node"), HOME, HOME), None);
    }

    #[test]
    fn other_runtimes() {
        let module = args("python3.12 -m uvicorn app:main --reload");
        assert_eq!(
            describe("python3.12", &module, Some("/Users/me/ml"), HOME).as_deref(),
            Some("uvicorn · ml")
        );
        let gradle = args(
            "java -Xmx2g -cp /opt/gradle/lib/a.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.7",
        );
        assert_eq!(
            describe("java", &gradle, HOME, HOME).as_deref(),
            Some("GradleDaemon")
        );
        let jar = args("java -jar /Users/me/tools/server.jar");
        assert_eq!(
            describe("java", &jar, HOME, HOME).as_deref(),
            Some("server")
        );
        let bun = args("bun run dev.ts");
        assert_eq!(
            describe("bun", &bun, Some("/Users/me/site"), HOME).as_deref(),
            Some("dev · site")
        );
        assert_eq!(describe("Finder", &args("Finder"), HOME, HOME), None);
    }
}
