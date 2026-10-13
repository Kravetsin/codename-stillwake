# 0021 — Cables by hand, in the power mode

- Status: accepted; its power mode superseded by [0022](0022-one-hand.md)
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
  cable ends on one, a peg is drawn there, as a grommet is where a cable goes through the hull. They
  cost nothing and are no thing of their own.
- **A machine has one socket** (`plug` in `MACHINES`), drawn in its picture: every cable to it
  plugs in there, a plug drawn in it. Only drawn: the sim knows the machine as one node.
- **The power overlay is the power mode.** The left button is its and nothing else's there:
  - with the cable tool in hand, which turns the mode on and keeps the plan, a cable is dragged
    from any node, a peg too, follows the pointer and is laid where it is let go, on a node; led
    past what one cable reaches, it is held at a peg at the last anchor in reach and goes on from
    there, laid as a chain of cables;
  - without it, a peg or a cable's plug is dragged to move it, the cables following, and the right
    button cuts;
  - while dragging, each machine's socket is lit by whether the cable reaches it.
- **The mode and the plan put each other away,** but for the cable, which is laid in the mode. Remove
  no longer cuts cables.

## Rejected

- **A length of its own for each cable,** set when laid, its ends moving only as far apart as that: a
  cable laid is already taut, so a support could only ever move nearer. Every cable is as long as a
  cable is, `POWER.maxSpan`, and hangs by the way it spans.
- **Laying a cable by itself when a machine is built,** as poles join in Factorio: too casual for
  the team; which way the power goes is the player's to choose.
- **Dragging with bare hands:** the left button already builds and works plans; a cable torn off by
  a stray press is a worse mistake than an extra key.
- **No cable tool, laying with an empty hand in the mode:** a press on a peg could not tell laying
  from moving, and cables of several kinds, rated for what they carry, are coming, to be picked as
  walls are by material.
- **A cable plugging in wherever on a machine it is let go:** a machine is one node, so the end
  would jump to wherever the drawing chose; one socket shows where it goes.
- **Supports as things built and paid for:** a wall already holds a cable; a support of its own is
  for when cables cross open space, and that waits.
- **A cable's cost by its length:** later, if long cables prove too cheap.

## Consequences

- The Remove tool keeps to what is built.
- A support moves freely within a cable's span of every cable on it, the way a belt is re-led.
