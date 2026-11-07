# Security

SUMO reads your Mac's processes and can quit apps, so security reports are very welcome.

## Reporting a vulnerability

Please don't open a public issue. Report it privately from the
[Security tab](https://github.com/vikey89/Sumo/security/advisories/new) of the repository,
with the steps to reproduce it and the output of `sumo --version`.

You'll get an answer within a week. Once a fix is released, the advisory is published with
credit to you, unless you'd rather stay anonymous.

## What counts

For example:

- a web page or another host reaching the engine despite the local-only guard;
- quitting an app without the confirmation, or quitting a locked process (system, other
  users', SUMO's own);
- full command lines, arguments or paths leaving the engine;
- the installer or the Homebrew formula installing something that doesn't match the
  release's `checksums.txt`.

## Supported versions

Only the latest release gets fixes.
