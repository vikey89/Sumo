#!/bin/sh
# Print the Homebrew formula for a release: formula.sh <version> <sha256 arm64> <sha256 x86_64>
set -eu
version=$1
arm=$2
intel=$3
repo=${SUMO_REPO:-vikey89/sumo}
base="https://github.com/$repo/releases/download/v$version"

cat <<RUBY
class Sumo < Formula
  desc "Your Mac's processes and apps, wrestling in a sumo arena"
  homepage "https://github.com/$repo"
  version "$version"
  license "MIT"

  depends_on :macos

  on_arm do
    url "$base/sumo-$version-aarch64-apple-darwin.tar.gz"
    sha256 "$arm"
  end
  on_intel do
    url "$base/sumo-$version-x86_64-apple-darwin.tar.gz"
    sha256 "$intel"
  end

  def install
    bin.install "sumo"
  end

  service do
    run [opt_bin/"sumo", "serve", "--no-open"]
    keep_alive true
    log_path var/"log/sumo.log"
    error_log_path var/"log/sumo.log"
  end

  def caveats
    <<~EOS
      Open the arena in your browser (the engine stops by itself when you close the tab):
        sumo
      Or keep it always on, even at login:
        brew services start sumo
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/sumo --version")
  end
end
RUBY
