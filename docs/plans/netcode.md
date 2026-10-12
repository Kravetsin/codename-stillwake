# Netcode — smooth across the internet

Goal: co-op that feels the same across the internet as on one machine, built on the practice named in
[0013](../decisions/0013-netcode-follows-known-practice.md) rather than on fixes one symptom at a
time. It runs before P2-05: every later prototype stands on it.

**In:** a network simulator in development; peers running ticks at a steady pace; time going on in a
hidden tab; others' heroes riding out short gaps.

**Out:** latency hiding, an adaptive delay, Hermite curves, the Steam transport: see 0013.

## How to work through it

As the prototypes: sizes **S** up to a day, **M** two or three days; one task is one PR, done when its
"Done when" holds and CI is green. N-01 comes first, since every other task is checked with it; the
rest are independent. Nothing here touches `packages/sim`; `packages/net` changes only in N-02.

**The check by eye** that several tasks name: two tabs on one machine, `?host=net` and
`?join=net&lag=100&jitter=60`, the guest walking and debris drifting for a minute, written up in the
PR in a sentence.

## Tasks

**N-01 · A bad network on demand** · S · client `session`

- A page opened with `?lag=<ms>` or `?jitter=<ms>` wraps its relay socket, in `relayFor`, over both
  the dev server's and the playtest server's. Every event in either direction, `joined` and `left`
  included, waits `lag` plus a random share of `jitter`, but never arrives before the one sent ahead
  of it on that socket: one TCP stream, so a host's peers share it. `off` finds the wrapped listener.
- Dev and playtest builds alike, so a real session can be made worse too.

Done when: unit tests show order kept per direction, every delay within its bounds, and `off`
working; the check by eye reproduces the stutter the playtest saw, on the guest and, with the
parameters on the host's tab instead, on the host.

**N-02 · Ticks at a steady pace on peers** · M · net `client`, client `session`, dev panel · after
N-01

- `Client.queued` counts the released ticks not yet run, resyncs not counted. `update(limit?)` runs
  at most `limit` ticks; a resync met on the way is taken in its place in the order, never before the
  ticks queued ahead of it, and does not count. No limit runs everything, as now: the host's own
  client, its saves (`local.ts`) and the desync fuzz.
- A joined session runs as many ticks a frame as its clock has due, as the host releases them. It
  starts once `PLAYOUT_TICKS` (2) wait, and holds, the clock with it, whenever the queue runs dry,
  until they wait again. Each tick waiting beyond `PLAYOUT_TICKS + 1` speeds its clock by a quarter:
  a joiner's first ticks, a backlog after a hidden tab, and a host at ×4 speed drain this way, at
  most the clock's catch-up of five ticks a frame.
- `game.progress` stays the clock's, now true on a peer, so debris drifts between ticks as on the
  host. The dev panel's `net` line shows `queued`.
- `fuzzDesync` draws a limit for each update from its generator, 0 included, so a limit boundary and
  a resync with ticks behind it are exercised.

Done when: unit tests of the playout: ticks delivered in bursts run one per 50 ms; a cold queue waits
for `PLAYOUT_TICKS`; an empty queue holds; a 1200-tick backlog drains within five seconds of frames;
`update` with a limit takes a resync in order; the desync suite passes with limits drawn; the check by
eye shows debris drifting smoothly on the guest.

**N-03 · Time goes on in a hidden tab** · S · client `session`, `apps/desktop` · after N-01

- A worker made from a Blob URL, so it also starts on the desktop shell's `file:` page, posts a beat
  every 50 ms while the page is hidden; `visibilitychange` picks the frames or the beats, and the time
  measured at the switch carries over, so nothing is counted twice or lost. A beat runs
  `game.frame(elapsed)`: the host releases ticks and every client runs them. The worker and the
  listener stop when the game is destroyed, as StrictMode does once in development.
- A beat leaves others' heroes queued in the client, all taken on the first frame after: the offset
  estimate places them at once and the hero stands where its newest says, which a test pins down.
- The Electron window sets `backgroundThrottling: false`.
- Tests inject the beat source: no test runner can hide a tab.

Done when: unit tests of the hand-over and of stopping; a host tab hidden for ten minutes in Chrome
and in Firefox, and the desktop shell minimised, release 12 000 ticks within 1% (the numbers in the
PR); on the playtest server a friend plays on through it.

**N-04 · Others' heroes through a gap** · S · client `crew` · after N-01

- Past its newest sample a hero walks on at its last velocity for at most `EXTRAPOLATE_MS` (100),
  then stands, its speed taken as zero so it is drawn standing.
- `BEHIND_MS` stays 150 unless the check by eye still stutters at it; then 200.

Done when: tests: a gap under 100 ms keeps a hero walking along its line; a longer one stands it,
drawn with zero speed; the check by eye shows no stutter, and with `jitter=300` a hero stands briefly
and walks on.

## Accepted, said once

- A peer's commands take `PLAYOUT_TICKS` longer to come back than today.
- A hidden tab uses CPU for its world while it is hidden.
- The host's hero fades for its guests while the host's tab is hidden: its controller steps with the
  frames. It comes back with them.
- After a stall longer than the delay, a hero jumps to where it is; on TCP nothing hides a long stall.
- A peer more than 600 ticks behind is not hash-checked until it catches up (`KEPT` in `host.ts`).
- A host that loads a save leaves its guests waiting on an empty queue, as before: they rejoin.
