# 0014 — A player's own actions show at once

- Status: accepted; supersedes the "latency hiding" omission of
  [0013](0013-netcode-follows-known-practice.md)
- Date: 2026-10-12

## Context

0013 left latency hiding out until a playtest named the delay. The first co-op playtest across the
internet did: both players found doors and crates the most annoying thing in the game. A guest's
command shows once it has gone to the host, waited for its tick, come back and sat through the
playout reserve: a median of 370 ms under `?lag=100&jitter=60`, against a frame on the host.

## Decision

- **The client knows its commands in flight.** `Client.inFlight` lists the commands this peer sent
  that have not run yet. The host passes a peer's commands on in the order it received them, over an
  ordered link, so each of its own in a released tick (`from` = its id), accepted or refused, is the
  oldest in flight; one that is not is our bug and throws.
- **What is shown is the world plus the commands in flight,** computed on each read, never stored,
  never reaching the sim. A command that runs leaves the list with its effect in the world, so
  nothing on screen changes; one refused leaves it and the world shows as it is. Several fold in
  order. Nothing reconciles: there is nothing to reconcile.
- **The rules stay in the sim.** The fold is a query of the module that owns the rule, over copies:
  `grid.afterToggles` for doors and valves, `items.afterMoves` for stacks. A grabbed piece of debris
  needs no rule: it is gone.
- **Covered:** doors and valves (drawn, walked through, named in the prompt), stack moves in the
  inventory, hotbar and crates, debris grabs. The dev panel times a command from sent to run.

## Deliberately not done

- **Building:** plans, work and cancels show when their tick runs. Revisited when a playtest names it.
- **What a command gives or takes elsewhere:** the item a grab gives, the cost `work` takes, air
  through a door only predicted open.
- **Others' actions:** they show when their tick runs here, as they must.
- **Timeouts and resending:** an ordered link loses no command while the session lives.
- **Rollback or a second simulated world:** a fold per kind of action is enough for the actions
  players feel.
- **A shorter playout reserve:** with own actions shown at once, the 50 ms a reserve of one tick would
  save shows only on others' actions, at the cost of more pauses on a jittery link.

## Consequences

- Another player who wins a race for the same door or slot within the round trip makes the view
  snap to what the sim decided. The hero may stand in a door only predicted open, and resend `enter`
  until the world agrees, for a round trip at most.
- A stack picked from a slot only predicted full is dropped from the hand when the move that filled
  it is refused.
- A new kind of action shown at once needs a fold query in its module and a reader in its feature.
