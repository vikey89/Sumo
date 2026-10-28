#!/bin/sh
# Install SUMO on macOS without Homebrew:
#
#   curl -fsSL https://raw.githubusercontent.com/vikey89/sumo/main/install.sh | sh
#
# Downloads the release for this Mac, checks its SHA-256 and puts `sumo` in ~/.local/bin.
# No sudo. Settings, all optional:
#   SUMO_VERSION=0.2.0          a specific release instead of the latest
#   SUMO_INSTALL_DIR=~/bin      where to put the binary
#   sh -s -- --uninstall        remove it again
set -eu

main() {
  repo=${SUMO_REPO:-vikey89/sumo}
  dir=${SUMO_INSTALL_DIR:-$HOME/.local/bin}

  if [ "${1:-}" = "--uninstall" ]; then
    "$dir/sumo" stop >/dev/null 2>&1 || true
    rm -f "$dir/sumo"
    say "Removed $dir/sumo. Your arena data lives in the browser and goes with the site's data."
    return
  fi

  [ "$(uname -s)" = Darwin ] || fail "SUMO runs on macOS only, for now."
  need curl
  need tar
  need shasum

  target=$(target)
  version=${SUMO_VERSION:-$(latest "$repo")}
  version=${version#v}
  base=${SUMO_DOWNLOAD_URL:-https://github.com/$repo/releases/download/v$version}
  archive="sumo-$version-$target.tar.gz"

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  say "Downloading SUMO ${version} for ${target}…"
  curl -fsSL --retry 2 -o "$tmp/$archive" "$base/$archive" || fail "could not download $base/$archive"
  curl -fsSL --retry 2 -o "$tmp/checksums.txt" "$base/checksums.txt" || fail "could not download the checksums"

  expected=$(awk -v file="$archive" '$2 == file { print $1 }' "$tmp/checksums.txt")
  actual=$(shasum -a 256 "$tmp/$archive" | awk '{ print $1 }')
  [ -n "$expected" ] || fail "$archive is not listed in checksums.txt"
  [ "$expected" = "$actual" ] || fail "checksum mismatch for $archive: the download is corrupt or was tampered with"

  tar -xzf "$tmp/$archive" -C "$tmp" sumo
  # Downloaded with curl, so not quarantined, but clear it in case the archive carried it.
  xattr -d com.apple.quarantine "$tmp/sumo" 2>/dev/null || true
  mkdir -p "$dir"
  if "$dir/sumo" status >/dev/null 2>&1; then
    restart=1
    "$dir/sumo" stop >/dev/null 2>&1 || true
  fi
  mv -f "$tmp/sumo" "$dir/sumo"
  chmod 755 "$dir/sumo"

  say "Installed $("$dir/sumo" --version) in $dir/sumo"
  [ -z "${restart:-}" ] || say "The running arena was stopped: run sumo to open the new one."
  case ":$PATH:" in
    *":$dir:"*) say "Run sumo to open the arena." ;;
    *)
      say ""
      say "$dir is not in your PATH yet. Add it, then open a new terminal:"
      say "  echo 'export PATH=\"$dir:\$PATH\"' >> ~/.zshrc"
      ;;
  esac
}

# Apple Silicon, even from a terminal running under Rosetta.
target() {
  if [ "$(uname -m)" = arm64 ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    echo aarch64-apple-darwin
  else
    echo x86_64-apple-darwin
  fi
}

# The latest release's tag, from where GitHub redirects /releases/latest (no API rate limit).
latest() {
  url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest") || fail "could not find a release of $1 on GitHub"
  tag=${url##*/}
  [ "$tag" != latest ] && [ -n "$tag" ] || fail "no release of $1 found"
  echo "$tag"
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

say() {
  printf '%s\n' "$1"
}

fail() {
  printf 'sumo install: %s\n' "$1" >&2
  exit 1
}

# Everything runs from here, so a download cut short never executes half a script.
main "$@"
