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
- **Oxygen works like a power grid.** A pipe network holds one pool of oxygen; a vent of a network
  with oxygen in it fills its room cell by cell, a unit of oxygen a cell, outward from the vent. A
  room is a space closed by walls and closed doors around it and back walls behind it, recomputed
  only when something is built, broken or a door moves; a cell holds air or not, and a room's air
  always lies in one patch around its vents ([0011](decisions/0011-air-lies-around-the-vents.md)).
  A hero breathes room air in any room holding some, and the suit refills there; the tanks behind
  the room's vents pay for each breath, and without them the breath takes a cell from the patch's
  far edge. A breach or a door left open to space makes a room vent: its air goes and its network
  drains fast until a valve cuts the room off or the hole is patched. A door opened onto an empty
  room joins the two: their air spreads over both and the vents fill the rest. Growth is held back by
  the fill, a leak through every outer hull cell (its material decides how much), paid from the
  tanks, and breathing. Without air a hero breathes from the suit tank. Power and wires run on the
  same network system.
- **Building is cell by cell, in layers.** Structure: hull walls of different materials, floors,
  ladders, doors, airlocks. Back walls: behind every cell of a room, or it is open to space.
  Conduits: pipes and wires run through walls, one of each per cell. Machines stand on floors and
  connect to conduits. Materials differ in strength against meteors, air leaks and cost. Overlays
  show air, pipes and power. The player places plans and the hero builds them by hand; drones come
  later.
- **The screen speaks without words.** What is always on screen shows the ship's state by colour
  and motion: a room losing air pulses red, pipes carrying oxygen glow, a low suit reddens the
  screen's edges, air escaping through the hull is seen leaving. Text is on demand, in overlays and by
  the pointer.
- **Light comes from sources, air has a view of its own.** Lamps on the power network, helmet lamps
  and starlight through windows light the ship; a dark room means no light, never no air. Air is
  seen in its own view, as in Oxygen Not Included: the air overlay, cell by cell.
- **Meteors belong to places.** The starting space is calm; meteors come where the ship goes, such as
  the rings around a planet. A place throws meteors of some power, and a hull cell breaks only if the
  power reaches its material's strength: a strong hull is safe early and gives way in harder places,
  which asks for a better one.

## Open

- Which dangers besides meteors, how often, how they are telegraphed; a peaceful mode as in Raft?
- Co-op start: one shared wreck, or separate wrecks that dock later?
- Art direction: style and mood; where sprites and character parts come from (drawn or rendered from
  3D).
- Which customization is cosmetic and which comes with equipment.
- What the hero catches and with what: hands on a tether first; a hook or harpoon from the deck; drones
  later?
- Planets: what landing gives and how it works.
- Parallel activities for 4+ players on one ship.
