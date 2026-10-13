# 0023 — A furnace burns fuel, and the wreck starts without one

- Status: accepted
- Date: 2026-10-14

## Context

The furnace of P2-10 runs on power and draws its oxygen from a pipe; the wreck starts with one, and
with a crate. So fire costs nothing of its own, the start builds nothing, and the panel's network is
spent on smelting. The team wants the start built from what the hero catches, fire with a cost, and
mechanics players already know: Minecraft's and IC2's furnaces, which burn fuel.

## Decision

- **A furnace burns fuel.** Its slots are an input, a fuel slot and three outputs. Its fire lights
  only with salvage it can smelt in its input, fuel in its fuel slot and air in one of its cells;
  lighting takes one fuel (`items.consume`), worth that fuel's `burnTicks`. Lit, it burns down a tick
  a tick, smelting or not, and smelts a tick a tick. It breathes the room's air as a hero does
  (`atmosphere.breathe`, `FURNACE.breath` every `FURNACE.breathEvery` ticks); given less, its fire
  goes out and what was left of the fuel is lost. No power, no pipe.
- **Planks are the fuel,** from cargo crates: a kind of debris that opens when caught, its loot drawn
  by the world's PRNG when the grab applies. Supply pods open the same way.
- **The furnace is built from caught salvage** (scrap chunks and hull plates), never from what it
  smelts; the crate from planks and iron, so after the furnace. The wreck starts with neither.
- **A machine with slots draws power only while its first slot holds something:** one rule in
  `power` for every machine that works on what is put in it.

## Rejected

- **Burning salvage itself:** a chunk is what is smelted; fuel of its own makes cargo crates worth a
  trip.
- **Briquettes, a second fuel,** and an electric furnace: later tiers, when there is a reason to.
- **A fire that waits, unburnt, with nothing to smelt:** Minecraft burns it away; one plank is a
  small, readable cost.

## Consequences

- `atmosphere.draw`, `oxygenFor` and items' `oxygen` go: the furnace was their only caller.
- A furnace in a room without air does not burn; one in an aired room takes from what heroes breathe.
- Supersedes P2-10's power and pipe, and 0016's furnace on the wreck.
