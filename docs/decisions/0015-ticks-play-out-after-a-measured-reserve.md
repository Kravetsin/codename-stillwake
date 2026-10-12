# 0015 — Ticks play out after a measured reserve

- Status: accepted; supersedes the fixed playout reserve of
  [0013](0013-netcode-follows-known-practice.md), and its omission of an adaptive delay for ticks
- Date: 2026-10-12

## Context

0013 had a joined peer hold two released ticks before running them, about 100 ms whatever the
link, plus a spare tick in a burst. Once the playtest server was reached directly, a guest's command
took a median of 179 ms from sent to run, and most of it was that reserve: the path itself was
about 50–70 ms. A reserve counted in whole ticks cannot go lower: one tick must arrive while the
one before it runs. The reserve has to be counted in milliseconds, and sized to the link.

## Decision

A jitter buffer, as every adaptive one is built (WebRTC's NetEq for voice, Unity Netcode's
interpolation delay for snapshots) and as others' heroes are already placed:

- **When each tick runs:** at the earliest it has been seen to arrive, plus the reserve. The
  earliest arrival is estimated from the quickest so far, `now − tick × 50 ms`, allowed to slip
  later slowly, as a path that grew slower is followed; a tick 500 ms past the estimate, as after a
  host's tab paused, starts the estimate over.
- **The reserve:** the 95th percentile of how late ticks came over the last five seconds against
  that estimate, plus 10 ms, within 10–300 ms; 100 ms until anything is measured.
- **Gradually:** the reserve moves toward that target at a tenth of the time passed, so the world
  runs at most 10% slower or faster while it changes, and never jumps or stalls (Unity corrects a
  tenth of the error a frame; Overwatch dilates its clients' time the same way).
- A backlog still drains at most five ticks a frame.
- The dev panel shows the reserve beside the queue.

Measured under the simulator: no lag, a 10 ms reserve and a 37 ms round trip (79 ms before); lag
20 ms with 10 ms of jitter, 19 ms and 101 ms; lag 100 ms with 60 ms of jitter, about 60 ms and 354
ms (370 before), no frame running two ticks, no pause over 90 ms.

## Deliberately not done

- **The same for others' heroes:** they keep their fixed 150 ms. Own actions show at once (0014),
  and a hero's samples come from another path and peer; it would be a second estimate to keep.
- **Speeding up and slowing down by the depth of the queue alone** (NetEq's time stretching): the
  arrival estimate already says when each tick is due; the queue only shows the result.

## Consequences

- On an even link a guest's world runs about 80 ms closer to the host's, and its commands come back
  that much sooner. On a jittery one the reserve grows by itself, and a burst of lateness costs a
  few seconds of a wider reserve rather than a pause.
- A host speeding its world up (×4, in development) shows as ticks arriving early: the estimate
  follows them at once.
