# 0021 — Cables by hand, in the power mode

- Status: accepted
- Date: 2026-10-13

## Context

Cables (0017) are laid with a tool from the build menu, point to point, and cut with Remove in the
power overlay. Players find them awkward: what can be cabled is not shown, a cable cannot be moved
once laid, and a long run means laying it piece by piece to anchors picked by hand. Drawn as ropes
that hang and sway, cables look like things to handle, and the team wants them handled: taken by an
end and carried somewhere else, the way a belt is led in Tossit. They do not want them laid by
themselves, as Factorio's poles join: wiring stays the player's.

## Decision

- **A cable's end may move** to another node: `move { from, to, cable? }` takes every cable ending
  at node `from`, or only the one named, to node `to`. Refused when no cable ends there
  (`power.noCable`), `to` is no node (`power.noNode`), a moved cable would join a node to itself
  (`power.sameNode`) or a pair already joined (`power.twice`), or would be pulled taut, spanning
  farther than a cable does (`power.taut`, `POWER.maxSpan` as for laying). Moving costs nothing.
- **Supports are anchors, as before:** any cell with a wall, floor, door or back wall. Wherever a
  cable ends on one, a fitting is drawn there, as where a cable goes through the hull. They cost
  nothing and are no thing of their own.
- **The power overlay is the power mode.** In it the left button lays, moves and the right button
  cuts:
  - dragged from a node, a new cable follows the pointer and is laid where it is let go, on a node;
  - led past what one cable reaches, it is held at a support at the last anchor in reach and goes on
    from there, laid as a chain of cables;
  - dragged from a support or a cable's end, they move, the cables following;
  - while dragging, the nodes it could reach are lit, those a cable would be taut to reach are red.
- **The mode has the hands.** In it the left button does nothing else; picking a build tool leaves
  it, and turning it on puts the plan away. The cable tool leaves the build menu, and Remove no
  longer cuts cables.

## Rejected

- **A length of its own for each cable,** set when laid, its ends moving only as far apart as that: a
  cable laid is already taut, so a support could only ever move nearer. Every cable is as long as a
  cable is, `POWER.maxSpan`, and hangs by the way it spans.
- **Laying a cable by itself when a machine is built,** as poles join in Factorio: too casual for
  the team; which way the power goes is the player's to choose.
- **Dragging with bare hands or with the cable tool:** the left button already builds and works
  plans; a cable torn off by a stray press is a worse mistake than an extra key.
- **Supports as things built and paid for:** a wall already holds a cable; a support of its own is
  for when cables cross open space, and that waits.
- **A cable's cost by its length:** later, if long cables prove too cheap.

## Consequences

- The build menu loses its cable card; the Remove tool keeps to what is built.
- A support moves freely within a cable's span of every cable on it, the way a belt is re-led.
