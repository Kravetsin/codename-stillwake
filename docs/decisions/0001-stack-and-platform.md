# 0001 — Stack and platform

- Status: accepted
- Date: 2026-10-10

## Context

Stillwake is a 2D side-view space game: an always-moving ship salvages floating debris and turns it into
automated production. PC only (Steam), online co-op for 4+ players in host-owned worlds. Simple 2D
graphics, light physics, a large share of play in management UI.

The team builds mostly through AI coding agents. Its engine experience is TypeScript, React and PixiJS:
the Factory game in Tossit, a pure-TS fixed-tick engine stepped by both page and server.

## Decision

| Layer          | Choice                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| Language, repo | TypeScript (strict), pnpm workspace                                                |
| Simulation     | pure-TS package, deterministic fixed tick (see [0002](0002-coop-model.md))         |
| Rendering      | PixiJS 8 on the WebGL2 renderer; tiles via `@pixi/tilemap` once textures arrive    |
| Lighting       | in-house: a per-cell lightmap multiplied over the scene; bloom from pixi-filters   |
| UI             | React 19 + Tailwind 4, DOM overlay over the canvas                                 |
| Physics        | Rapier2D, host-only, outside the simulation                                        |
| Desktop shell  | Electron: electron-vite in development, electron-builder for packaging             |
| Steam          | steamworks.js: lobbies, invites, P2P, Cloud, achievements, Steam Input, Workshop   |
| Tests          | Vitest for simulation, determinism and desync; Playwright for renderer smoke tests |

- Windows first; Linux (Steam Deck) and macOS later.
- Game code reaches Electron and Steam only through a platform interface.
- The renderer also runs in a plain browser on the Vite dev server with a mock platform. It is a dev
  tool, not a release target: agents can launch and inspect the game, and several tabs act as several
  players over a local transport.

## Alternatives considered

- **Godot 4 + C#**: editor, built-in multiplayer, 2D lights and shadows, GodotSteam. No team
  experience; agents are far less effective in an editor-centric workflow; complex management UI is
  slower to build than in React.
- **Unity 6**: the same learning cost, heavy for simple 2D.
- **Tauri**: system WebViews; WebKitGTK on Linux and Steam Deck is weak at WebGL, rendering differs per
  OS.
- **Mobile and web releases**: out of scope. A mobile game, if ever, is a separate product.

## Consequences

- No engine editor: camera, scenes, input, audio and the asset pipeline are assembled from libraries.
- Lighting is ours to build: Pixi 8 has no 2D light system, and the v6-era plugins (pixi-lights,
  pixi-shadows) do not run on it. Shaders target WebGL2 only, so each is written once in GLSL.
- Consoles are out of reach: Electron does not run there.
- steamworks.js P2P sits on Valve's deprecated `ISteamNetworking` API. It is enough for small co-op;
  the transport hides behind an interface so it can move to `ISteamNetworkingMessages` later.
