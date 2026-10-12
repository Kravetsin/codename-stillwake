# 0012 — A playtest server runs the dev relay on our own VPS

- Status: accepted
- Date: 2026-10-12

## Context

Co-op runs over Steam in release builds ([0002](0002-coop-model.md)), and nothing of it is built
yet. Until now peers met through the dev relay inside the Vite dev server: fine on one machine or one
home network, but friends on different networks could not reach it without a VPN or a tunnel, which
every playtester would have to install or trust. The team already runs a VPS for another project.

## Decision

- **The relay runs on its own** as `apps/relay`, a small Node server that also serves the built game,
  one process on one port. The relay code moves to `packages/net` and is the same in both places;
  frames on the playtest server are `{ event, data }` JSON over a WebSocket at `/relay`.
- **The built game reaches it beside its page:** `?host` and `?join` use the dev server's socket in
  development, the playtest server's anywhere else served over HTTP, and nothing in the desktop shell.
- **A password guards everything,** pages and sockets alike, as HTTP basic authorization: the
  playtest is for friends, and a game with its dev panel should not be open to anyone who finds it.
- **It ships as a Docker image** run behind the VPS's existing proxy, which gives it a domain and
  HTTPS (`deploy/playtest`).

## Rejected

- **A VPN (Tailscale) or a tunnel (cloudflared):** each playtester installs or trusts another service,
  or the host's dev server, source and all, is exposed while it runs.
- **Building Steam networking now** (on the test app id 480): the way to release, and a task of its
  own, not what lets friends play this week.

## Consequences

- Every message crosses the VPS: a few tens of small frames a second per player, nothing to speak of,
  but one more hop of latency than Steam's peer-to-peer would add.
- The server sees every message, and trusts every page that knows the password: the threat model of
  co-op among friends.
- Updating the playtest means rebuilding the image; sessions running then end, as every page must load
  the new build.
- When Steam networking arrives, the playtest server stays for browser playtests or goes, by a new ADR.
