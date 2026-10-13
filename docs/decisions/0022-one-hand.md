# 0022 — One hand

- Status: accepted
- Date: 2026-10-13
- Supersedes in part: [0021](0021-cables-by-hand-in-the-power-mode.md) (the power mode)

## Context

The plan (B: left places, right opens the menu) and the power mode (L: left drags pegs and plugs,
right cuts) could both be on, and a button did what the other said: with the cable card held, a
right click meant to cut a cable opened the menu. Builds were found by name, hard to scan. The right
and middle buttons did next to nothing. A plan was a blue box that said nothing of what it was.

Games with layers were looked at. Oxygen Not Included keeps overlays as views and locks its
deconstruct tool to the active overlay's layer. Starbound wires with one tool from a slot of its
own: left joins, right removes. Terraria shows wires only while a wiring item is held. Factorio and
Satisfactory pick a building under the pointer into the hand (Q, the middle button). What they
share: one thing in hand at a time, overlays that show, and removal and picking always on the
mouse.

## Decision

- **The hand holds one thing:** nothing or a hotbar item (`free`), the plan — out with a build card
  or none (`plan`) — or the cable card (`cable`). One store, `hand`, replaces `buildMode` and
  `cableInHand`. The wheel or 1–9 picks a hotbar slot and puts the plan away.
- **Overlays show and filter.** P, L and O change no button; they choose what removal and the
  pipette take: with none or O, machines, structure and back walls; with P, pipes and valves; with
  L, cables. A drag begun on a plan cancels plans whatever the overlay. The cable card turns L on
  and puts it back when put away, as a pipe card does P; turning L off puts the cable card away.
  Any other card works under any overlay. The menu opens on the overlay's tab.
- **The mouse:**
  - left: what the card does — places along a drag line; with the cable card, lays from a node or
    a peg and on past one cable's reach through pegs (0021). With an empty hand, as before: grabs
    debris, works a plan held on;
  - Shift + left with the cable card: moves a peg or a plug, its cables following (0021's `move`);
  - right, with the plan or the cable in hand: removes in the overlay's layer — a drag cancels
    plans or marks what is built; in L, a press cuts the nearest cable. With an empty hand, nothing:
    one hand, and a stray right click marks no door;
  - middle: the pipette — the card of what is under the pointer, in the overlay's layer, into the
    hand; in L, the cable card on a node a cable ends at;
  - B takes the plan out and puts it away, Esc puts it away too. The Remove card goes.
- **The menu is shown the whole while the plan is out,** so a card is swapped for another at a
  click: picking one keeps it open, and a card picked by the middle button takes the plan out. It is
  thumbnails, a grid per tab drawn from the ship's own pixel art, one per material; a tooltip says
  the name, cost (have / need) and what it does; a card short of materials is dim. Under the cards,
  what is in hand, its thumbnail, name and buttons. A menu folded away with a card still in hand was
  tried first: leaving the plan then took two presses.
- **Plans are drawn as blueprints:** each its own picture under a blue tint, so its outline says
  what it is and the tint that it is not built yet; pipes and doors join to the plans beside them.
  The ghost of a card is drawn the same way, green where it fits and red where it does not. Marks
  stay as they are.
- **The art the building feature draws moves to `render/`,** as features never import each other.
- **`building.clearAt(cell, layers)`** takes the layers to look in, by default all of them in its
  order: which layer goes next, and what is already marked, are the sim's rules.

## Rejected

- **An overlay as a mode of its own,** with its own buttons (0021's power mode): two modes on at once
  is what confused.
- **A separate "move" tool for pegs:** a tool for something done now and then; Shift tells moving
  from laying, which a press on a peg alone cannot (0021).
- **Removal on the middle button:** removing is done often and by dragging, awkward with the wheel
  held; picking is a click.
- **Removal with an empty hand:** the hand holds one thing; to take something away the plan is taken
  out first, with B.
- **Starbound's right button for the back layer:** back walls stay cards of their own; the right
  button removes.
- **A cable cut along a dragged line:** one press, one cable, as before, until long runs prove
  tedious.
- **Search and a row of recent builds:** fifteen builds read at a glance; the pipette is the recent
  row.

## Consequences

- Pipes are removed only with P on; with no overlay, removal leaves them, as wiring is left
  without L.
- A wheel turned, 1–9 or the inventory opened with a card in hand drops the card; Q drops nothing
  then, as no hotbar slot is shown chosen.
- A drag ends with the hand that began it: a card swapped or put away mid-drag sends nothing. The
  first button down has the drag; Shift counts as it was at the press. A pick on nothing picks
  nothing.
- 0021 stands for `move`, pegs, sockets and laying on through supports; its power mode, "the mode
  and the plan put each other away" and "Remove no longer cuts cables" are replaced here.
