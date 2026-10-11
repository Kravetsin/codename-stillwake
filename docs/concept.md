# Concept

A living document: what is decided about the game and what is still open. Technical decisions live in
[decisions/](decisions/).

## Pillars

- Raft in space: an always-moving ship salvages debris on its way.
- Factorio-style automation turns salvage into production that grows and upgrades the ship.
- Side view: the ship is seen in cross-section.
- Online co-op for 4+ players, a hero each, in host-owned worlds.
- A meditative pace with real dangers.

## Decided

- **Start:** the hero is left alive in a wreck, a fragment of a ship, and has to make it livable to
  survive.
- **Spacewalks:** on a tether from the hull at first; a jetpack later frees the hero from it.
- **Dangers:** yes — the game can hurt you. Which ones is open.
- **Time runs only while the game runs.** Nothing happens offline and there is no offline progress,
  unlike the Factory in Tossit.
- **Characters** are assembled from parts with simple keyframed movement; the parts exist mainly for
  customization ([0003](decisions/0003-character-rig.md)).
- **Graybox first.** Plain blocks without textures until the core mechanics are fun; art comes after.
- **Look: simple textures carried by light.** Light also tells the ship's state: an unpowered room is
  dark but for helmet lamps, a venting room flashes red, starlight comes in through windows.
- **Oxygen works like a power grid.** A pipe network holds one pool of oxygen, and a room has air when
  a vent of a network with oxygen in it stands inside. A room is a space closed by walls and closed
  doors, recomputed only when something is built, broken or a door moves; rooms hold a status (air,
  venting, vacuum), not amounts. A breach or a door left open to space makes a room vent: its network
  drains fast until a valve cuts the room off or the hole is patched. A door opened onto an empty room
  joins the two into one that has to be filled again. Growth is held back by a one-off
  fill per room by volume, a leak through every outer hull cell of an aired room (its material decides
  how much) and breathing. Without air a hero breathes from the suit tank. Power and wires run on the
  same network system.
- **Building is cell by cell, in layers.** Structure: hull walls of different materials, floors,
  ladders, doors, airlocks. Conduits: pipes and wires run through walls, one of each per cell. Machines
  stand on floors and connect to conduits. Materials differ in strength against meteors, air leaks and
  cost. Overlays show air, pipes and power. The player places plans and the hero builds them by hand;
  drones come later.

## Open

- Which dangers, how often, how they are telegraphed; a peaceful mode as in Raft?
- Co-op start: one shared wreck, or separate wrecks that dock later?
- Art direction: style and mood; where sprites and character parts come from (drawn or rendered from
  3D).
- Which customization is cosmetic and which comes with equipment.
- What the hero catches and with what: hands on a tether first; a hook or harpoon from the deck; drones
  later?
- Planets: what landing gives and how it works.
- Parallel activities for 4+ players on one ship.
