import { ITEMS, MATERIALS, type ItemId, type MachineKind } from '@stillwake/content';
import { BACK, CONDUIT, STRUCTURE } from '@stillwake/sim';
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { createFigure } from '../features/crew/figure';
import { SUITS } from '../features/crew/suits';
import { FIRE_AT, fireTexture } from '../features/furnace/art';
import { itemPicture } from '../render/item-art';
import { machineTexture } from '../render/ship-art';
import { drawBack, drawConduit, drawStructure, type Cells } from '../features/grid/draw';
import { CELL } from '../render/camera';

/**
 * A ship showing every tile: `#` scrap and `%` iron walls, `=` floor, `H` ladder, `D` and `d` doors
 * shut and open, `-` pipe, `v` and `x` valves open and shut, `.` back wall, ` ` space.
 */
const SHIP = [
  '                                ',
  '                                ',
  '################################',
  '#..............................#',
  '#..............................#',
  '#.........H....................D',
  '#.........H....................D',
  '#.........H....................D',
  '%%%%%%%%==H==%%%%%%%%%%%%%%%%%%%',
  '%.........H.........d..........%',
  '%.........H.........d..........%',
  '%-----v---H----x----d----------%',
  '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%',
  '                                ',
  ' ##########  %%%%%%%%%%         ',
  ' ##########  %%%%%%%%%%         ',
  ' ##########  %%%%%%%%%%         ',
  ' ##########  %%%%%%%%%%         ',
];

const MACHINES_SHOWN: readonly { kind: MachineKind; x: number; y: number }[] = [
  { kind: 'solarPanel', x: 4, y: 1 },
  { kind: 'solarPanel', x: 20, y: 1 },
  { kind: 'lamp', x: 6, y: 3 },
  { kind: 'lamp', x: 24, y: 3 },
  { kind: 'lamp', x: 15, y: 9 },
  { kind: 'crate', x: 2, y: 7 },
  { kind: 'tank', x: 1, y: 10 },
  { kind: 'generator', x: 4, y: 10 },
  { kind: 'vent', x: 8, y: 11 },
  { kind: 'furnace', x: 12, y: 10 },
  { kind: 'crate', x: 26, y: 11 },
];

const CODES: Record<string, { structure?: number; conduit?: number; material?: number }> = {
  '#': { structure: STRUCTURE.wall, material: MATERIALS.scrap.code },
  '%': { structure: STRUCTURE.wall, material: MATERIALS.iron.code },
  '=': { structure: STRUCTURE.floor },
  H: { structure: STRUCTURE.ladder },
  D: { structure: STRUCTURE.doorClosed },
  d: { structure: STRUCTURE.doorOpen },
  '-': { conduit: CONDUIT.pipe },
  v: { conduit: CONDUIT.valveOpen },
  x: { conduit: CONDUIT.valveClosed },
};

/** Rows of `SHIP` above this one are backed in scrap, the rest in iron. */
const BACKED_IN_SCRAP = 8;

function cellsOf(rows: readonly string[]): Cells {
  const chars = rows.flatMap((row) => [...row]);
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    structure: chars.map((c) => CODES[c]?.structure ?? STRUCTURE.empty),
    material: chars.map((c) => CODES[c]?.material ?? 0),
    conduit: chars.map((c) => CODES[c]?.conduit ?? CONDUIT.none),
    back: chars.map((c) => (c === ' ' ? BACK.none : BACK.wall)),
    // The upper deck backed in scrap, the lower in iron.
    backMaterial: chars.map((c, i) =>
      c === ' '
        ? 0
        : MATERIALS[i < BACKED_IN_SCRAP * (rows[0]?.length ?? 0) ? 'scrap' : 'iron'].code,
    ),
  };
}

/**
 * Every tile and machine of the ship in pixel art, unlit, a furnace at work and a hero for scale,
 * for judging the art by eye (`?art` in development).
 */
export function ArtGallery() {
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(3);
  const scale = useRef(zoom);
  scale.current = zoom;

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let ready = false;
    void app.init({ resizeTo: window, preference: 'webgl', background: '#0b0f17' }).then(() => {
      if (disposed) return app.destroy(true);
      ready = true;
      host.current?.appendChild(app.canvas);
      const ship = new Container();
      const cells = cellsOf(SHIP);
      const layers = [new Graphics(), new Graphics(), new Graphics()] as const;
      for (let cell = 0; cell < cells.width * cells.height; cell++) {
        drawBack(layers[0], cells, cell);
        drawConduit(layers[1], cells, cell);
        drawStructure(layers[2], cells, cell);
      }
      ship.addChild(...layers);
      for (const m of MACHINES_SHOWN) {
        const machine = new Sprite(machineTexture(m.kind));
        machine.position.set(m.x * CELL, m.y * CELL);
        ship.addChild(machine);
      }
      const furnace = MACHINES_SHOWN.find((m) => m.kind === 'furnace');
      const fire = new Sprite(fireTexture(0));
      if (furnace) {
        fire.position.set(furnace.x * CELL + FIRE_AT.x, furnace.y * CELL + FIRE_AT.y);
        ship.addChild(fire);
      }
      const hero = createFigure(SUITS[0] ?? 0xffffff);
      hero.show({ x: 0, y: 0, vx: 0, vy: 0, climbing: false, facing: 1, look: 0 }, 'stand', 16);
      hero.view.position.set(17 * CELL, 8 * CELL);
      ship.addChild(hero.view);
      app.stage.addChild(ship);
      let ms = 0;
      app.ticker.add((ticker) => {
        ms += ticker.deltaMS;
        fire.texture = fireTexture(Math.floor(ms / 110));
        ship.scale.set(scale.current);
        ship.position.set(20, 40);
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
          zoom
          <input
            type="range"
            min={1}
            max={6}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          ×{zoom}
        </label>
      </div>
      <div className="fixed bottom-2 left-2 flex gap-2 rounded bg-slate-900/90 p-2">
        {(Object.keys(ITEMS) as ItemId[]).map((item) => (
          <img
            key={item}
            src={itemPicture(item)}
            alt={item}
            title={item}
            className="h-16 w-16"
            style={{ imageRendering: 'pixelated' }}
          />
        ))}
      </div>
    </>
  );
}
