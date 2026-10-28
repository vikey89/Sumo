#!/bin/sh
# Run install.sh against a fake release built from server/target/release/sumo:
# it installs and runs, refuses a tampered checksum, and uninstalls.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/^version = "\(.*\)"/\1/p' server/Cargo.toml | head -1)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/release"
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  tar -czf "$work/release/sumo-$version-$target.tar.gz" -C server/target/release sumo
done
(cd "$work/release" && shasum -a 256 sumo-*.tar.gz > checksums.txt)

export SUMO_VERSION="v$version" SUMO_DOWNLOAD_URL="file://$work/release" SUMO_INSTALL_DIR="$work/bin"
sh install.sh
test "$("$work/bin/sumo" --version)" = "sumo $version"

sed 's/^./0/' "$work/release/checksums.txt" > "$work/tampered" && mv "$work/tampered" "$work/release/checksums.txt"
if SUMO_INSTALL_DIR="$work/other" sh install.sh 2>/dev/null; then echo "installed despite a bad checksum" >&2; exit 1; fi
test ! -e "$work/other/sumo"

sh -s -- --uninstall < install.sh
test ! -e "$work/bin/sumo"
echo "install.sh: ok"
