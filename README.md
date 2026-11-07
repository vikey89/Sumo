# 相撲 SUMO

[![CI](https://github.com/vikey89/Sumo/actions/workflows/ci.yml/badge.svg)](https://github.com/vikey89/Sumo/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/vikey89/Sumo)](https://github.com/vikey89/Sumo/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

![A bout in the SUMO arena: Google Chrome faces claude, the prediction pays off and the chanko coins fly](docs/assets/demo.gif)

Your Mac's processes and apps become sumo wrestlers in a 3D arena: the more memory they
use, the bigger they get. Processes from node, python, java and other runtimes are named
after what they are running and the project they belong to (`vite · shop`, `uvicorn · api`).
Watch them wrestle, make predictions, and push the apps that weigh too much out of the ring
(always after a confirmation; the operating system is always protected).

Also in the arena: **Who turned the fans on?** (<kbd>C</kbd>), a ten-minute CPU timeline that
names the app behind every spike, and **the basho** (<kbd>T</kbd>), a fifteen-day tournament
where each app's first bout of the day counts towards kachi-koshi and the yūshō.

## Install

macOS 11 or later, on Apple Silicon or Intel.

```sh
brew install vikey89/tap/sumo
```

Or without Homebrew: the script picks the build for your Mac, checks its SHA-256 and puts
`sumo` in `~/.local/bin`, no sudo.

```sh
curl -fsSL https://raw.githubusercontent.com/vikey89/sumo/main/install.sh | sh
```

Prefer to read it first: `curl -fsSLO https://raw.githubusercontent.com/vikey89/sumo/main/install.sh`,
open `install.sh`, then `sh install.sh`. `SUMO_VERSION=0.2.0` installs a specific release,
`SUMO_INSTALL_DIR` picks another folder, and `sh install.sh --uninstall` removes it.

## Usage

```sh
sumo                        # opens the arena in a browser tab and gives you the prompt back
sumo stop                   # stops the engine
sumo status                 # tells whether the engine is running
sumo top                    # your apps' ranking, live in the terminal (c sorts by CPU, q quits)
sumo serve                  # keeps the engine in the foreground, with live RAM in the terminal
brew services start sumo    # Homebrew installs: always on in the background, even at login
```

The engine started by `sumo` runs in the background and stops by itself a couple of minutes
after you close the last arena tab. Options: `--port 4000` (or `SUMO_PORT=4000`),
`--no-open` to skip opening the browser, `--no-notify` to skip notifications when memory
runs low. Logs from the background engine go to `~/Library/Logs/sumo.log`.

## Safety & privacy

SUMO can quit apps, so it is careful about it:

- **Nothing quits without you.** Pushing a wrestler out of the ring always asks for
  confirmation first. Apps get a polite `quit`, so they can ask to save your work; other
  processes get `SIGTERM`, never `SIGKILL`.
- **Some wrestlers can't be pushed.** System processes, other users' processes and SUMO's
  own process tree are locked.
- **Local only.** The engine listens on `127.0.0.1` and refuses requests from any other web
  page or host name, so a site you visit can't read your processes or quit apps.
- **No telemetry.** SUMO collects nothing. Full command lines never leave the engine: the
  arena only gets an app's name, its tool and its project folder name. The one request to
  the outside is the arena's fonts, from Google Fonts.

Found a security problem? Please report it privately, see [SECURITY.md](SECURITY.md).

## Development

Needs Node 22 and Rust 1.95 or later.

```sh
npm install
npm run dev         # Rust engine on :3001 and the Vite arena on :5173
npm run build:cli   # binary with the arena embedded: server/target/release/sumo
```

## Releasing

1. Bump `version` in `server/Cargo.toml`, then create and push the tag: `git tag v0.2.0 && git push --tags`.
2. The GitHub Action builds for Apple Silicon and Intel and publishes the release.
3. If the `HOMEBREW_TAP_TOKEN` secret is set (a fine-grained token with *Contents: read and
   write* on `homebrew-tap`), it also updates `Formula/sumo.rb` in the tap.
4. If a step fails, fix it and re-run the job: an existing release is kept as it is and the
   formula is written from its `checksums.txt`.

## License

[MIT](LICENSE)
