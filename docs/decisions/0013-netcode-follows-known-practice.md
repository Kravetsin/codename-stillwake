# 0013 — Netcode follows known practice

- Status: proposed
- Date: 2026-10-12

## Context

The first playtests across the internet ([0012](0012-playtest-server.md)) showed others' heroes
stuttering and the world stopping for everyone while the host's tab was hidden. We fixed what we
found one symptom at a time. But both halves of our model ([0002](0002-coop-model.md)) are old,
well-described techniques: lockstep on commands, as in RTS games and Factorio, and interpolation of
remote entities, as in Source and most action games. This record names the practice each part
follows, what we take from it, and what we leave out on purpose.

Sources:

- Glenn Fiedler, gafferongames.com: "Fix Your Timestep!", "Deterministic Lockstep", "Snapshot
  Interpolation".
- Gabriel Gambetta, "Fast-Paced Multiplayer": entity interpolation.
- Valve, "Source Multiplayer Networking": the interpolation delay.
- Factorio Friday Facts #76, #83, #302: lockstep, latency hiding, a network simulator for debugging.
- Unity Netcode for Entities manual: bounded extrapolation.
- Chrome, "Heavy throttling of chained JS timers" (Chrome 88): timers in hidden pages.

## Decision

| Practice                                           | Where it comes from                         | Here                                  |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Commands stamped with a tick, every peer simulates | lockstep: RTS, Factorio                     | kept                                  |
| Hashes compared, a drifted peer resynced           | Factorio's desync detection                 | kept                                  |
| Fixed timestep, an accumulator, capped catch-up    | "Fix Your Timestep!"                        | kept; woken by a worker while hidden  |
| A playout buffer for released ticks                | "Deterministic Lockstep": 100 ms of playout | new: peers run ticks at a steady pace |
| Remote entities drawn a fixed delay in the past    | Source: two to three send intervals         | kept: 150 ms, three sends             |
| Bounded extrapolation when the buffer runs dry     | Unity Netcode: a few ticks, then hold       | new: 100 ms on, then standing         |
| A network simulator in development                 | Factorio (clumsy), Source's fake lag        | new: `?lag`, `?jitter`                |

- **A peer plays ticks out at a steady pace.** It queues the ticks the host released and runs them
  on its own clock, as the host releases them, holding two in reserve; a surplus beyond that drains
  a few extra ticks a frame. It never runs ticks as they arrive: the relay delivers in bursts, and the
  world, debris first, would move in bursts with it.
- **Time does not stop with the frames.** Browsers stop animation frames in a hidden tab and slow its
  timers to once a second, after five minutes to once a minute. While hidden, a dedicated worker's
  timer wakes the session instead, so the host keeps releasing ticks and every peer keeps running
  them. The desktop shell turns background throttling off.
- **Others' heroes are drawn three sends in the past,** between the samples around that moment. When
  a hero's samples run out, it walks on along its last velocity for a moment, then stands, drawn
  standing rather than frozen mid-stride.
- **The network is made bad on purpose in development.** A page's relay socket can delay and jitter
  its messages, in order, as TCP does. A netcode bug is reproduced on one machine before it is fixed.
- **Transport.** Playtests run over a WebSocket, TCP: a lost packet holds everything behind it, which
  the buffers ride out up to their depth. The Steam transport gets an ADR of its own; it will send
  heroes unreliably, as every UDP game sends state.

## Deliberately not done

- **Latency hiding** (Factorio's latency state): a peer's own command shows once it comes back from
  the host, one round trip and the playout depth later, 200–300 ms across the internet. Building
  tolerates that in a prototype; the hiding is a second, predicted world to keep right. Revisited when
  a playtest names the delay.
- **Rollback** (GGPO): it rewinds and replays the whole state, made for small worlds such as fighting
  games. Ours is a factory.
- **An adaptive delay** (a jitter buffer sized from measured lateness): a fixed delay of three sends
  covers the jitter seen so far, and a stall longer than any sane delay shows either way. Revisited
  if the simulator or a playtest shows a fixed delay too short on some links and too long on others.
- **Hermite interpolation** (Fiedler): it pays off for bodies tumbling at 10 Hz. Heroes are sampled
  at 20 Hz and walk straight between abrupt stops, where a curve through the velocities overshoots.
- **Clock sync by ping** (NTP): the quickest delivery of the sender's own stamps gives the offset with
  no extra messages.
- **An unreliable channel in the browser** (WebRTC): it would serve playtests only.
- **Input delay for the host:** it runs its own commands a round trip before its guests do. Co-op
  needs no fairness between friends.

## Consequences

- A peer's world runs two ticks behind what it has received, and its own commands take that much
  longer to show.
- A hidden tab keeps simulating: its CPU time stays spent, which is the point while it hosts.
- Netcode changes are judged under the simulator, not on one machine's perfect link.
