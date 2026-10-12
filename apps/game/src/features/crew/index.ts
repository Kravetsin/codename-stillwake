import { HERO } from '@stillwake/content';
import { crew, grid, type Sim } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import { grabbing, predictedGrid } from '../../session/predicted';
import { aimedPiece, buildMode, openCrate } from '../../session/ui';
import type { Feature } from '../feature';
import { CrewPanel } from './CrewPanel';
import { aimAt, crateInReach, usesOf, type Aim } from './aim';
import { createFigure, lookOf, type Figure } from './figure';
import { bodyCell, heroAt, shipOf, STEP_MS, stepHero, UNIT, type Hero, type Ship } from './hero';
import { createKeys } from './keys';
import { createHeroSender, createRemoteHeroes, type SentHero } from './remote';
import { poseOf } from './pose';
import { promptOf, samePrompt, shownPrompt } from './prompt';
import { reportOf } from './report';
import { suitOf } from './suits';

const AIM_READY = 0x7fe08a;
const AIM_REFUSED = 0xe05555;

/**
 * Outlines what E would work under the pointer within reach, a machine's whole footprint: green, or
 * red when the sim would refuse. Nothing else: no square follows the pointer, and a piece of debris
 * is outlined by `debris`, around its own shape.
 */
function drawAim(g: Graphics, sim: Sim, aim: Aim | undefined, refused: boolean) {
  g.clear();
  if (aim?.piece !== undefined) return;
  if (!aim?.inReach || (!aim.press && !aim.work && aim.crate === undefined)) return;
  const q = sim.query(grid);
  const { width } = q.size();
  const machine = aim.work ? undefined : q.machineAt(aim.cell);
  const cells = (machine && q.footprint(machine.kind, machine.cell)) ?? [aim.cell];
  const xs = cells.map((c) => c % width);
  const ys = cells.map((c) => Math.floor(c / width));
  const x = Math.min(...xs) * CELL;
  const y = Math.min(...ys) * CELL;
  const w = (Math.max(...xs) + 1) * CELL - x;
  const h = (Math.max(...ys) + 1) * CELL - y;
  g.rect(x + 1, y + 1, w - 2, h - 2).stroke({ width: 2, color: refused ? AIM_REFUSED : AIM_READY });
}

/** A hero's figure and the suit colour it was drawn in. */
interface Worn {
  readonly figure: Figure;
  readonly colour: number;
}

/**
 * `worn` in `colour`: the same figure while its colour holds, else a new one in its place in
 * `parent`, since a figure's colours are drawn into it.
 */
function wear(worn: Worn | undefined, colour: number, parent: Container): Worn {
  if (worn?.colour === colour) return worn;
  const figure = createFigure(colour);
  if (worn) {
    parent.addChildAt(figure.view, parent.getChildIndex(worn.figure.view));
    worn.figure.view.destroy({ children: true });
  } else parent.addChild(figure.view);
  return { figure, colour };
}

/** Within this many cells of the body's middle the pointer turns nobody: no flicker over the hero. */
const FACE_DEADZONE = 0.25;

/** The side of `hero` the pointer is on, in cells; none without a pointer or right over the hero. */
function faceOf(pointer: { x: number } | undefined, hero: Hero): -1 | 1 | undefined {
  if (!pointer) return undefined;
  const dx = pointer.x - hero.x / UNIT;
  if (Math.abs(dx) < FACE_DEADZONE) return hero.facing;
  return dx < 0 ? -1 : 1;
}

/** Shows `hero` as `figure`, posed by how it moves, where its body is and whether it is out. */
function show(figure: Figure, hero: Hero, ship: Ship, out: boolean, elapsedMs: number) {
  const inSpace = ship.space(bodyCell(hero, ship.width));
  figure.show(hero, poseOf(hero, inSpace, out), elapsedMs);
}

/**
 * Other players' heroes, as their peers send them through the host, drawn a little behind so they
 * move smoothly between sends; and this machine's hero: moved by the keyboard against the ship's
 * cells, outside the sim, and followed by the camera. E under the pointer, within reach, toggles a
 * door or valve, loads a tank, catches a piece or opens a crate when pressed, and works a plan while
 * held: one `work` command for every tick the host releases. With no build tool out, what E would
 * work is outlined, and a prompt says what E does.
 */
export const crewFeature: Feature = {
  id: 'crew',
  Panel: CrewPanel,
  layer() {
    const ownView = new Container();
    const others = new Container();
    let own: Worn | undefined;
    const shownOthers = new Map<number, Worn>();
    const remote = createRemoteHeroes();
    let clockMs = 0;
    let sendTo: { sendHero(state: unknown): void } | undefined;
    const sender = createHeroSender((hero) => sendTo?.sendHero(hero));
    const aimView = new Graphics();
    const view = new Container();
    view.addChild(aimView, others, ownView);

    const keys = createKeys(window);
    const clock = createClock(STEP_MS);
    let hero: { previous: Hero; current: Hero } | undefined;
    let workedOnTick = -1;
    let steps = 0;
    let wasOut = false;

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        // Doors as this peer shows them: its own toggles still in flight already open or shut.
        const shown = predictedGrid(game.client);
        const ship = shipOf(sim, shown.structure);
        const spawn = sim.query(crew).spawn();
        const me = sim.query(crew).hero(game.client.id);
        const out = (me?.out ?? 0) > 0;
        // Waking from passing out, the sim has put the hero at the spawn: so does the client.
        if (!hero || (wasOut && !out)) {
          const woke = heroAt(ship, spawn);
          hero = { previous: woke, current: woke };
        }
        wasOut = out;
        // The hero faces the pointer's side and looks at it, read where the camera was last frame.
        const pointed = camera.pointer();
        const face = faceOf(pointed, hero.current);
        for (let due = clock.advance(elapsedMs); due > 0; due--) {
          // Passed out, the hero takes no orders and only falls; keys pressed meanwhile are spent.
          const taken = keys.take();
          const input = out ? ({ x: 0, y: 0, jump: false } as const) : { ...taken, face };
          hero = { previous: hero.current, current: stepHero(hero.current, input, ship) };
          steps += 1;
        }
        const { previous } = hero;
        const current = { ...hero.current, look: out ? 0 : lookOf(hero.current, pointed) };

        const report = reportOf(sim, game.client.id, current);
        if (report) game.client.send(report);

        // Others' heroes in, this one out: through the host, never through the simulation.
        clockMs += elapsedMs;
        sendTo = game.client;
        // Stamped with its step's time, so others place it by when it was there, not when it came.
        sender.step(elapsedMs, current, steps * STEP_MS);
        for (const { from, state } of game.client.takeHeroes())
          remote.add(from, state as SentHero, clockMs);
        const heard = remote.at(clockMs);
        for (const [id, shown] of shownOthers) {
          shown.figure.view.visible = heard.some((h) => h.id === id);
        }
        for (const { id, hero: other } of heard) {
          const shown = wear(shownOthers.get(id), suitOf(sim, id), others);
          shownOthers.set(id, shown);
          shown.figure.view.visible = true;
          const otherOut = (sim.query(crew).hero(id)?.out ?? 0) > 0;
          show(shown.figure, other, ship, otherOut, elapsedMs);
        }

        // Drawn between the last two steps, so the hero moves smoothly at any refresh rate.
        const between = clock.progress();
        const x = previous.x + (current.x - previous.x) * between;
        const y = previous.y + (current.y - previous.y) * between;
        camera.follow({ x: x / UNIT, y: (y - HERO.height / 2) / UNIT }, screen);

        // Aimed after following, so the pointer is read where the camera now is.
        const pointer = camera.pointer();
        own = wear(own, suitOf(sim, game.client.id), ownView);
        show(own.figure, { ...current, x, y }, ship, out, elapsedMs);
        const aim = pointer && aimAt(sim, game.client.id, current, pointer, grabbing(game.client));
        // With a build tool out the building layer shows the pointer's cell and its own reasons.
        const prompt = out || buildMode.get() ? undefined : promptOf(sim, aim, shown);
        drawAim(aimView, sim, prompt && aim, prompt?.problem !== undefined);
        if (!samePrompt(prompt, shownPrompt.get())) shownPrompt.set(prompt);
        const piece =
          prompt && aim?.piece !== undefined
            ? { id: aim.piece, refused: prompt.problem !== undefined }
            : undefined;
        const aimed = aimedPiece.get();
        if (piece?.id !== aimed?.id || piece?.refused !== aimed?.refused) aimedPiece.set(piece);

        // The press is taken every frame, so one made out of reach is spent rather than kept.
        // Passed out, E does nothing: a press is spent, a hold works no plan.
        const pressed = keys.takeUse();
        // The left button grabs debris too: out in space, with WASD held and the mouse aiming, E is
        // a stretch. With a build tool out it is the tool's.
        const grab = keys.takeClick() && !buildMode.get() && aim?.piece !== undefined;
        const e = out
          ? { pressed: false, held: false }
          : { pressed: pressed || grab, held: keys.holdsUse() };
        const uses = usesOf(aim, e, sim.world.tick, workedOnTick);
        workedOnTick = uses.workedOnTick;
        for (const c of uses.commands) game.client.send(c);
        if (uses.open !== undefined) openCrate.set(uses.open);
        // A crate stays open while the hero can reach it, awake.
        const open = openCrate.get();
        if (open !== undefined && (out || !crateInReach(sim, current, open))) {
          openCrate.set(undefined);
        }
      },
      destroy() {
        keys.destroy();
        openCrate.set(undefined);
        shownPrompt.set(undefined);
        aimedPiece.set(undefined);
      },
    };
  },
};
