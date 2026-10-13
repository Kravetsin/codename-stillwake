import { HERO } from '@stillwake/content';
import { Application, Container, Text } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { createFigure } from '../features/crew/figure';
import { STEP_MS, type Hero } from '../features/crew/hero';
import type { Pose } from '../features/crew/pose';
import { SUITS } from '../features/crew/suits';
import { particles } from '../render/particles';

/** One loop of the gallery: what the hero does `ms` into it, moving as the controller would. */
interface Scene {
  readonly label: string;
  at(ms: number): { readonly hero: Partial<Hero>; readonly pose: Pose };
}

/** Thousandths of a cell moved in `ms` at `speed`, the controller's thousandths per step. */
const moved = (ms: number, speed: number) => (ms / STEP_MS) * speed;

const JUMP_MS = 1700;

const SCENES: readonly Scene[] = [
  { label: 'stand', at: () => ({ hero: {}, pose: 'stand' }) },
  {
    label: 'walk',
    at: (ms) => ({ hero: { x: moved(ms, HERO.walk), vx: HERO.walk }, pose: 'walk' }),
  },
  {
    label: 'jump and land',
    at: (ms) => {
      const t = ms % JUMP_MS;
      if (t < 450) return { hero: {}, pose: 'stand' };
      if (t < 800) return { hero: { vy: -300 }, pose: 'air' };
      if (t < 1100) return { hero: { vy: 300 }, pose: 'air' };
      return { hero: {}, pose: 'stand' };
    },
  },
  {
    label: 'climb',
    at: (ms) => ({ hero: { y: -moved(ms, HERO.climb), climbing: true }, pose: 'climb' }),
  },
  { label: 'float', at: () => ({ hero: {}, pose: 'float' }) },
  {
    label: 'swim',
    at: (ms) => ({ hero: { x: moved(ms, HERO.swim), vx: HERO.swim }, pose: 'float' }),
  },
  { label: 'plan', at: () => ({ hero: { holds: 'plan' }, pose: 'stand' }) },
  {
    label: 'plan, walking',
    at: (ms) => ({
      hero: { x: moved(ms, HERO.walk), vx: HERO.walk, holds: 'plan' },
      pose: 'walk',
    }),
  },
  { label: 'plan, floating', at: () => ({ hero: { holds: 'plan' }, pose: 'float' }) },
  { label: 'passed out', at: () => ({ hero: {}, pose: 'lie' }) },
  { label: 'tumbling', at: () => ({ hero: {}, pose: 'tumble' }) },
];

/** Pixels between figures, and how much larger than in the game they are drawn. */
const SPACING = { x: 150, y: 190 };
const COLUMNS = 6;

/**
 * Every pose and motion of the hero side by side, looping, for tuning them by eye (`?poses` in
 * development): the head's turn, the speed and the suit are set from the bar at the top.
 */
export function PoseGallery() {
  const host = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(3);
  const [suit, setSuit] = useState(0);
  const settings = useRef({ look, speed, zoom, suit });
  settings.current = { look, speed, zoom, suit };

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let ready = false;
    void app
      .init({ resizeTo: window, preference: 'webgl', background: '#0b0f17', antialias: true })
      .then(() => {
        if (disposed) return app.destroy(true);
        ready = true;
        host.current?.appendChild(app.canvas);
        const stage = new Container();
        app.stage.addChild(stage);
        let worn = -1;
        let figures: ReturnType<typeof createFigure>[] = [];
        const dress = (colour: number) => {
          stage.removeChildren();
          figures = SCENES.map((scene, i) => {
            const figure = createFigure(colour);
            const cell = new Container();
            cell.position.set(
              (i % COLUMNS) * SPACING.x + SPACING.x / 2,
              Math.floor(i / COLUMNS) * SPACING.y + SPACING.y - 40,
            );
            const label = new Text({
              text: scene.label,
              style: { fontFamily: 'monospace', fontSize: 12, fill: 0x9fb4c8 },
            });
            label.anchor.set(0.5, 0);
            label.position.set(0, 10);
            cell.addChild(figure.view, label);
            stage.addChild(cell);
            return figure;
          });
        };
        let ms = 0;
        app.ticker.add((ticker) => {
          const { look: turned, speed: rate, zoom: scale, suit: picked } = settings.current;
          if (picked !== worn) {
            worn = picked;
            dress(SUITS[picked] ?? SUITS[0]);
          }
          const elapsed = ticker.deltaMS * rate;
          // Figures here stand apart from where they say they are: their dust is not drawn.
          particles.clear();
          ms += elapsed;
          stage.position.set(20, 50);
          SCENES.forEach((scene, i) => {
            const figure = figures[i];
            if (!figure) return;
            const { hero, pose } = scene.at(ms);
            const awake = { look: turned, ...hero };
            figure.show(
              { x: 0, y: 0, vx: 0, vy: 0, climbing: false, facing: 1, ...awake },
              pose,
              elapsed,
            );
            // Moving, the figure would leave its place: it stays, scaled, where its label is.
            figure.view.position.set(0, 0);
            figure.view.scale.set(scale, scale);
          });
        });
      });
    return () => {
      disposed = true;
      if (ready) app.destroy(true);
    };
  }, []);

  return (
    <>
      <div ref={host} className="fixed inset-0" />
      <div className="fixed top-2 left-2 flex items-center gap-4 rounded bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-300">
        <label className="flex items-center gap-2">
          look
          <input
            type="range"
            min={-0.6}
            max={0.5}
            step={0.05}
            value={look}
            onChange={(e) => setLook(Number(e.target.value))}
          />
          {look.toFixed(2)}
        </label>
        <label className="flex items-center gap-2">
          speed
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          ×{speed.toFixed(1)}
        </label>
        <label className="flex items-center gap-2">
          zoom
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          ×{zoom}
        </label>
        <span className="flex items-center gap-1">
          suit
          {SUITS.map((colour, i) => (
            <button
              key={colour}
              aria-label={`suit ${i + 1}`}
              className={`h-4 w-4 rounded-sm border ${i === suit ? 'border-white' : 'border-transparent'}`}
              style={{ background: `#${colour.toString(16).padStart(6, '0')}` }}
              onClick={() => setSuit(i)}
            />
          ))}
        </span>
      </div>
    </>
  );
}
