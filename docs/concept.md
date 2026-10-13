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
  survive: one small room a weak oxygen generator holds, a breached room beside it, a furnace and
  an empty crate. Everything else is caught as debris and smelted in the furnace, which burns power
  and oxygen ([0016](decisions/0016-breathe-where-the-air-is.md)).
- **Spacewalks:** on a tether from the hull at first; a jetpack later frees the hero from it.
- **Dangers:** yes — the game can hurt you. Which ones is open.
- **Time runs only while the game runs.** Nothing happens offline and there is no offline progress,
  unlike the Factory in Tossit.
- **Characters** are assembled from parts with simple keyframed movement; the parts exist mainly for
  customization ([0003](decisions/0003-character-rig.md)).
- **Pixel art,** a pixel of art a pixel of the world, sixteen to a cell, on trial until the team
  settles the style: doors, pipes and machines are tiles and pictures drawn as text in
  `features/grid/art.ts`; a wall is cut from its material's one picture where it stands, so walls
  side by side make one surface; the hero's parts are pictures too, moved and turned smoothly by
  its rig. `?art` in development shows them all.
- **Look: simple textures carried by light.** Light also tells the ship's state: an unpowered room is
  dark but for helmet lamps, a venting room flashes red, starlight comes in through windows.
- **Oxygen works like a power grid.** A pipe network holds one pool of oxygen; a vent of a network
  with oxygen in it fills its room cell by cell, a unit of oxygen a cell, outward from the vent. A
  room is a space closed by walls and closed doors around it and back walls behind it, recomputed
  only when something is built, broken or a door moves; a cell holds air or not, and a room's air
  gathers around its vents and stays where it is ([0011](decisions/0011-air-lies-around-the-vents.md)).
  A hero breathes room air standing where it is, and the suit refills there; the tanks behind
  the room's vents pay for each breath, and without them the breath takes a cell from the patch's
  far edge. A breach or a door left open to space makes a room vent: its air goes and its network
  drains fast until a valve cuts the room off or the hole is patched. A door opened onto an empty
  room joins the two, and the vents fill the rest through the doorway. A room leaks a little all the
  time through what its air touches, the back wall behind each of its cells and every outer hull cell,
  each as its material decides ([0020](decisions/0020-walls-of-materials-front-and-back.md)), paid like a breath: from the tanks,
  or from the room's own air without them. Growth is held back by the fill, the leak and breathing. Without air a hero breathes from the suit tank.
- **Power runs on cables** laid point to point between machines and anchors, hanging inside the
  ship and taut out in space; a network short of power slows everything on it alike. Solar panels
  work only outside; the oxygen generator is the first thing that needs power
  ([0017](decisions/0017-power-runs-on-cables.md)).
- **Building is cell by cell, in layers.** Structure: hull walls of different materials, floors,
  ladders, doors, airlocks. Back walls, of the same materials: behind every cell of a room, or it is
  open to space.
  Conduits: pipes and wires run through walls, one of each per cell. Machines stand on floors and
  connect to conduits. Materials differ in strength against meteors, air leaks and cost. Overlays
  show air, pipes and power. The hands do one thing at a time: with the plan taken out (B) the
  player lays blueprints and marks what to take apart; with it put away, the left button held
  delivers to them and builds them by hand. Crafted tools will build faster than bare hands; drones
  come later.
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
