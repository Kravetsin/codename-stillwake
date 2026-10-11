import { HERO } from '@stillwake/content';
import { crew, grid, type Sim } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import { buildMode, openCrate } from '../../session/ui';
import type { Feature } from '../feature';
import { CrewPanel } from './CrewPanel';
import { aimAt, crateInReach, usesOf, type Aim } from './aim';
import { createFigure, type Figure } from './figure';
import { bodyCell, heroAt, shipOf, STEP_MS, stepHero, UNIT, type Hero, type Ship } from './hero';
import { createKeys } from './keys';
import { createHeroSender, createRemoteHeroes } from './remote';
import { poseOf } from './pose';
import { promptOf, samePrompt, shownPrompt } from './prompt';
import { reportOf } from './report';

const BODY = 0xe8b04a;
/** Other players' heroes, so a player tells their own apart at a glance. */
const OTHER = 0x5fc8c0;
const AIM_READY = 0x7fe08a;
const AIM_REFUSED = 0xe05555;

/**
 * Outlines what E would work under the pointer within reach, a machine's whole footprint: green, or
 * red when the sim would refuse. Nothing else: no square follows the pointer.
 */
function drawAim(g: Graphics, sim: Sim, aim: Aim | undefined, refused: boolean) {
  g.clear();
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
    const own = createFigure(BODY);
    const others = new Container();
    const shownOthers = new Map<number, Figure>();
    const remote = createRemoteHeroes();
    let clockMs = 0;
    let sendTo: { sendHero(state: unknown): void } | undefined;
    const sender = createHeroSender((hero) => sendTo?.sendHero(hero));
    const aimView = new Graphics();
    const view = new Container();
    view.addChild(aimView, others, own.view);

    const keys = createKeys(window);
    const clock = createClock(STEP_MS);
    let hero: { previous: Hero; current: Hero } | undefined;
    let workedOnTick = -1;
    let wasOut = false;

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        const ship = shipOf(sim);
        const spawn = sim.query(crew).spawn();
        const me = sim.query(crew).hero(game.client.id);
        const out = (me?.out ?? 0) > 0;
        // Waking from passing out, the sim has put the hero at the spawn: so does the client.
        if (!hero || (wasOut && !out)) {
          const woke = heroAt(ship, spawn);
          hero = { previous: woke, current: woke };
        }
        wasOut = out;
        for (let due = clock.advance(elapsedMs); due > 0; due--) {
          // Passed out, the hero takes no orders and only falls; keys pressed meanwhile are spent.
          const taken = keys.take();
          const input = out ? ({ x: 0, y: 0, jump: false } as const) : taken;
          hero = { previous: hero.current, current: stepHero(hero.current, input, ship) };
        }
        const { previous, current } = hero;

        const report = reportOf(sim, game.client.id, current);
        if (report) game.client.send(report);

        // Others' heroes in, this one out: through the host, never through the simulation.
        clockMs += elapsedMs;
        sendTo = game.client;
        sender.step(elapsedMs, current);
        for (const { from, state } of game.client.takeHeroes())
          remote.add(from, state as Hero, clockMs);
        const heard = remote.at(clockMs);
        for (const [id, shown] of shownOthers) shown.view.visible = heard.some((h) => h.id === id);
        for (const { id, hero: other } of heard) {
          let shown = shownOthers.get(id);
          if (!shown) {
            shown = createFigure(OTHER);
            shownOthers.set(id, shown);
            others.addChild(shown.view);
          }
          shown.view.visible = true;
          const otherOut = (sim.query(crew).hero(id)?.out ?? 0) > 0;
          show(shown, other, ship, otherOut, elapsedMs);
        }

        // Drawn between the last two steps, so the hero moves smoothly at any refresh rate.
        const between = clock.progress();
        const x = previous.x + (current.x - previous.x) * between;
        const y = previous.y + (current.y - previous.y) * between;
        show(own, { ...current, x, y }, ship, out, elapsedMs);
        camera.follow({ x: x / UNIT, y: (y - HERO.height / 2) / UNIT }, screen);

        // Aimed after following, so the pointer is read where the camera now is.
        const pointer = camera.pointer();
        const aim = pointer && aimAt(sim, game.client.id, current, pointer);
        // With a build tool out the building layer shows the pointer's cell and its own reasons.
        const prompt = out || buildMode.get() ? undefined : promptOf(sim, aim);
        drawAim(aimView, sim, prompt && aim, prompt?.problem !== undefined);
        if (!samePrompt(prompt, shownPrompt.get())) shownPrompt.set(prompt);

        // The press is taken every frame, so one made out of reach is spent rather than kept.
        // Passed out, E does nothing: a press is spent, a hold works no plan.
        const pressed = keys.takeUse();
        const e = out ? { pressed: false, held: false } : { pressed, held: keys.holdsUse() };
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
      },
    };
  },
};
