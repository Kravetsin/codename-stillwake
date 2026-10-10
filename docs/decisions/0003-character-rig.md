# 0003 — Characters: modular cutout with keyframed animation

- Status: accepted
- Date: 2026-10-10

## Context

Side view, direct control of one hero up close, 4+ players who need to tell each other apart, and a
team without an animator. Physically driven (ragdoll) animation was considered and dropped: it takes long
tuning to stop looking floppy. Parts exist mainly for customization; movements stay simple.

## Decision

- **Rig.** A hero is about ten parts — helmet, torso, backpack, upper arms, forearms with gloves,
  thighs, shins with boots — each a sprite with a pivot at its joint, nested as Pixi containers
  (torso → upper arm → forearm).
- **Keyframed animation as data.** An animation is a few keyframes of part angles and small offsets,
  eased between in code; the files are plain JSON in the repo. Facing left mirrors the rig.
- **Two layers.** The legs play locomotion (idle, walk, climb, fall, float); the upper body can play an
  action on top (carry, use, pull the tether), so combinations need no animations of their own.
- **Cheap live touches, no physics:** the tool arm and the head turn toward the target, a squash on
  landing, a little backpack lag.
- **Pose editor.** A dev page shows the rig, lets you drag joints and saves keyframes, so animations
  are made without code.
- **Customization by slot.** Every part slot has variants, and all variants of a slot share one
  template (pivot and size envelope). Colour comes from a white paint layer per part tinted with the
  player's colours (Pixi `tint`), so one drawing serves every colour. Functional equipment (jetpack,
  tether reel, the tool in hand) is always visible: teammates read it.
- **Animation is cosmetic and local.** Nothing about animation goes over the network: each client
  animates every hero from the hero state that is synced anyway (position, velocity, ladder or space,
  held item, aim). Appearance is sent once on join. Gameplay collision uses the hero's box, never the
  parts.

## Alternatives considered

- **Physically driven ragdoll (Barotrauma):** best in zero-g, but long tuning.
- **Frame-by-frame or pre-rendered sprite sheets:** every outfit multiplies the frames to draw or
  render, while customization by part is the point here.
- **Spine:** a mature editor with an official Pixi runtime, paid per seat. The fallback if animations
  outgrow our system — the rig model is the same.

## Consequences

- Parts can come from any art source, drawn or rendered from 3D, as long as they follow the slot
  templates. The art style is decided separately.
- A small in-house system to build and own: rig, keyframes, layers, pose editor.
