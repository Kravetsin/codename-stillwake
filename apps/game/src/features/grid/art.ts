import { MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';
import type { Texture } from 'pixi.js';
import { pixelTexture, shade, type Palette } from '../../render/pixel-art';

/**
 * The ship drawn as pixel art, a pixel of art a pixel of the world, a cell sixteen pixels across.
 * Walls, floors, ladders, doors, back walls and pipes are tiles a cell each; a machine is one picture
 * over its whole footprint. A wall's tile is outlined on each side that faces no wall, and rounded
 * where two such sides meet, so a hull reads as one solid shape.
 */

/**
 * Wall plating in a few looks, one picked by the cell: `l` lit, `m` its own, `d` shade, `o` seam,
 * `x` rivet, `r` and `R` rust.
 */
const WALL: Record<MaterialId, readonly (readonly string[])[]> = {
  scrap: [
    [
      'lllllllmollllllm',
      'lxmmmmxdolxmmmxd',
      'lmmmmmmdolmmmmmd',
      'lmmrRmmdolmmmmmd',
      'lmrRRrmdolmmmmmd',
      'lmmrmmmdolmdmmmd',
      'mdddddddolmdmmmd',
      'ooooooooolmmmmmd',
      'lllllllmolxmmmxd',
      'lxmmmmmdomdddddd',
      'lmmmmmmdoooooooo',
      'lmmmmmmdollllllm',
      'lmmmmrmdolmmmmxd',
      'lmmmrRrdolmmmmmd',
      'lmmmmmxdolmmmmmd',
      'mdddddddomdddddd',
    ],
    [
      'lllllllmollllllm',
      'lxmmmmxdolxmmmxd',
      'lmmmmmmdolmrRmmd',
      'lmmmmmmdolrRRrmd',
      'lmmmmmmdolmrmmmd',
      'lmmmmmmdolmdmmmd',
      'mdddddddolmdmmmd',
      'ooooooooolmmmmmd',
      'lllllllmolxmmmxd',
      'lxmmmmmdomdddddd',
      'lmmmmmmdoooooooo',
      'lmmmmmmdollllllm',
      'lmmmmmmdolmmmmxd',
      'lmmmmmmdolmmrRmd',
      'lmmmmmxdolmmmrmd',
      'mdddddddomdddddd',
    ],
    [
      'lllllllmollllllm',
      'lxmmmmxdolxmmmxd',
      'lmmmmmmdolmmmmmd',
      'lmmmmmmdolmmmmmd',
      'lmmmmmmdolmmmmmd',
      'lmmmmmmdolmdmmmd',
      'mdddddddolmdmmmd',
      'ooooooooolmmmmmd',
      'lllllllmolxmmmxd',
      'lxmmmmmdomdddddd',
      'lmmmmmmdoooooooo',
      'lmmmmmmdollllllm',
      'lmmmmmmdolmmmmxd',
      'lmmmmmmdolmmmmmd',
      'lmmmmmxdolmmmmmd',
      'mdddddddomdddddd',
    ],
  ],
  steel: [
    [
      'lllllllllllllllm',
      'lxmmmmmmmmmmmmxd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmoooooooooooomd',
      'lmllllllllllllmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lmmmmmmmmmmmmmmd',
      'lxmmmmmmmmmmmmxd',
      'mddddddddddddddd',
    ],
  ],
};

const MATERIAL_COLOUR: Record<MaterialId, number> = { scrap: 0x5b6170, steel: 0x8f99ad };
const RUST = { r: 0x8a5a3a, R: 0x6a4430 };

/** The wall behind a cell: darker than any wall, so walls stand out from it in any light. */
const BACK_PANEL = 0x2f3646;

/** Back wall panels; one in every few has a grille, so a long wall does not repeat. */
const BACK = {
  plain: [
    'lllllllllllllllo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'ldddddddddddddoo',
    'oooooooooooooooo',
  ],
  grille: [
    'lllllllllllllllo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'ldddddddddddddoo',
    'oooooooooooooooo',
  ],
};

/** A catwalk along the top of its cell. */
const FLOOR = ['llllllllllllllll', 'mmmmmmmmmmmmmmmm', 'dodddodddodddodd', 'oooooooooooooooo'];

const LADDER = [
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....llllll.....',
  '.....dddddd.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....llllll.....',
  '.....dddddd.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
];

/** A door shut, with a window and hazard stripes, and open, slid up into its frame. */
const DOOR = {
  closed: [
    '...oooooooooo...',
    '...olllllllmo...',
    '...olmmmmmmdo...',
    '...olmkkkkmdo...',
    '...olmkggkmdo...',
    '...olmkgkkmdo...',
    '...olmkkkkmdo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...oddddddddo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...oyykkyykko...',
    '...oykkyykkyo...',
    '...okkyykkyyo...',
    '...oooooooooo...',
  ],
  open: [
    '...oooooooooo...',
    '...oyykkyykko...',
    '...oooooooooo...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...oo......oo...',
  ],
};

/** A valve's wheel, ten pixels across, in its state's colour `c`. */
const VALVE = [
  '...OOOO...',
  '..OccccO..',
  '.OcOOOOcO.',
  'OcO.cc.OcO',
  'OcOcOOcOcO',
  'OcOcOOcOcO',
  'OcO.cc.OcO',
  '.OcOOOOcO.',
  '..OccccO..',
  '...OOOO...',
];

/** Where a conduit joins a machine: a socket, eight pixels across. */
const PORT = [
  '..PPPP..',
  '.PKKKKP.',
  'PKssssKP',
  'PKssssKP',
  'PKssssKP',
  'PKssssKP',
  '.PKKKKP.',
  '..PPPP..',
];

const PIPE = 0x56606e;
const VALVE_COLOUR = { open: 0x4caf6a, closed: 0xd05050 };

/** Colours shared by every machine. */
export const GEAR: Palette = {
  K: 0x1a1e25,
  k: 0x2a3d4f,
  n: 0x3a536a,
  e: 0x5f86a8,
  h: 0x9fbfda,
  c: 0x9fd8ff,
  s: 0x10161d,
  P: 0xd8e6f2,
  w: 0xe8f2ff,
  y: 0xe8c547,
  z: 0x2a2f3a,
  q: 0x4f8fa0,
  Q: 0x356a78,
  p: 0x86c3d1,
  f: 0x6b4a3a,
  F: 0x4a3226,
  r: 0x3a1a12,
  R: 0x5a2a18,
  g: 0x22262c,
  b: 0x24477f,
  B: 0x4f7fc8,
  u: 0xfff1c8,
};

/** Each machine over its whole footprint, a cell sixteen pixels. */
export const MACHINE_ART: Record<MachineKind, readonly string[]> = {
  tank: [
    '................................',
    '.........KKKKKKKKKKKKKK.........',
    '......KKqppqqqqqqqqqqQQQKK......',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KeeeeeeeeeeeeeeennnnnK.....',
    '.....KKKKKKKKKKKKKKKKKKKKKK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqKKKKKKqqQQQQQK.....',
    '.....KqqppqqqKhhhhKqqQQQQQK.....',
    '.....KqqppqqqKwwKwKqqQQQQQK.....',
    '.....KqqppqqqKwKwwKqqQQQQQK.....',
    '.....KqqppqqqKwwwwKqqQQQQQK.....',
    '.....KqqppqqqKKKKKKqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KeeeeeeeeeeeeeeennnnnK.....',
    '.....KKKKKKKKKKKKKKKKKKKKKK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
    '...KeeeeeeeeeeeeeeeeeeeeeeeeK...',
    '...KkkkkkkkkkkkkkkkkkkkkkkkkK...',
    '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
  ],
  generator: [
    '.....KnnK..............KnnK.....',
    '.....KnnK..............KnnK.....',
    '.....KnnK..............KnnK.....',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeeeeeeeeeeeeeeeeeK.',
    '.KennnnnKKKKKKnnnnnnnnnnnnnnnkK.',
    '.KennnKKeeeeeeKKnnnnnKKKKKKKnkK.',
    '.KennKKcekkkkecKKnnnnkkkkkkknkK.',
    '.KenKKekckkkkckeKKnnnnnnnnnnnkK.',
    '.KenKekkcckkcckkeKnnnKKKKKKKnkK.',
    '.KeKeekkkckkckkkeeKnnkkkkkkknkK.',
    '.KeKekkkkhhhhkkkkeKnnnnnnnnnnkK.',
    '.KeKekkkkhKKhkkkkeKnnKKKKKKKnkK.',
    '.KeKecccchKKhkccccKnnkkkkkkknkK.',
    '.KeKekkkkhhhhkkkkeKnnnnnnnnnnkK.',
    '.KeKeekkkckkckkkeeKnnKKKKKKKnkK.',
    '.KenKekkcckkcckkeKnnnkkkkkkknkK.',
    '.KenKKekckkkkckeKKnnnnnnnnnnnkK.',
    '.KennKKeckkkkecKKnnnnKKKKKKKnkK.',
    '.KennnKKeeeeeeKKnnnnnkkkkkkknkK.',
    '.KennnnnKKKKKKnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnzzyyzzyyzzyyzznkK.',
    '.KennnnnnnnnnnzzyyzzyyzzyyzznkK.',
    '.KkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '..KKKK....................KKKK..',
    '..KKKK....................KKKK..',
  ],
  furnace: [
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeeeeeeeeeeeeeeeeeK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFFFFFFFFFFFFFFFFFFFFFFFFFFFFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KFFFFFFFFFFFFFFFFFFFFFFFFFFFFK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFfffffFffffKKKKKKKKKKKKfFfffK.',
    '.KFfffffFffffKRRRRRRRRRRKfFfffK.',
    '.KFFFFFFFFFFFKRRRRRRRRRRKFFFFFK.',
    '.KfffFfffffFfKrrrrrrrrrrKffffFK.',
    '.KfffFfffffFfKrrrrrrrrrrKffffFK.',
    '.KfffFfffffFfKggggggggggKffffFK.',
    '.KFFFFFFFFFFFKrgrgrgrgrgKFFFFFK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFFFFFFFFFFFKrgrgrgrgrgKFFFFFK.',
    '.KfffFfffffFfKrgrgrgrgrgKffffFK.',
    '.KfffFfffffFKKKKKKKKKKKKKKfffFK.',
    '.KfffFfffffFnnnnnnnnnnnnnnfffFK.',
    '.KFFFFFFFFFFnnnnnnnnnnnnnnFFFFK.',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
  ],
  solarPanel: [
    '................................................',
    '................................................',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeK',
    'KBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbK',
    'KBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbK',
    'KBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    '......................KnnK......................',
    '......................KnnK......................',
    '......................KnnK......................',
  ],
  vent: [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KkkkkkkkkkkkkK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  crate: [
    '................................',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KyyyeeeeeeeeeeeKKeeeeeeeeeeeyyyK',
    'KyyykkkkkkkkkkkKKkkkkkkkkkkkyyyK',
    'KekknkkkkkkkkkkKKkkkkkkkkkknkkkK',
    'KekkknkkkkkkkkkKKkkkkkkkkknkkkkK',
    'KekkkknkkkkkkKKKKKKkkkkkknkkkkkK',
    'KekkkkknkkkkkKyyyyKkkkkknkkkkkkK',
    'KekkkkkknkkkkKyyyyKkkkknkkkkkkkK',
    'KekkkkkkknkkkKKKKKKkkknkkkkkkkkK',
    'KekkkkkkkknkkkkKKkkkknkkkkkkkkkK',
    'KekkkkkkkkknkkkKKkkknkkkkkkkkkkK',
    'KekkkkkkkkkknkkKKkknkkkkkkkkkkkK',
    'KekkkkkkkkkkknkKKknkkkkkkkkkkkkK',
    'KkkkkkkkkkkkkkkKKkkkkkkkkkkkkkkK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  ],
  lamp: [
    '...KeeeeeeeeK...',
    '...KeeeeeeeeK...',
    '...KKKKKKKKKK...',
    '.......KK.......',
    '.......KK.......',
    '.......KK.......',
    '.....KKKKKK.....',
    '.....KuuuuK.....',
    '....KuuwuuuK....',
    '....KuwwuuuK....',
    '....KuuuuuuK....',
    '.....KuuuuK.....',
    '.....KKKKKK.....',
    '................',
    '................',
    '................',
  ],
};

const DOOR_COLOUR = 0xc97a3a;
const LADDER_COLOUR = 0xb08d57;
const FLOOR_COLOUR = 0x9aa3b5;

/** The plain shades of `colour` a tile is drawn in. */
function shadesOf(colour: number): Palette {
  return { l: shade(colour, -0.22), m: colour, d: shade(colour, 0.78), o: shade(colour, 0.55) };
}

const MATERIAL_BY_CODE = new Map<number, MaterialId>(
  (Object.keys(MATERIALS) as MaterialId[]).map((id) => [MATERIALS[id].code, id]),
);

/**
 * `make` kept by a number: a chunk asks for a tile hundreds of times as it is drawn, and a string key
 * for each ask cost as much as drawing.
 */
function keptBy(make: (n: number) => Texture): (n: number) => Texture {
  const kept: Texture[] = [];
  return (n) => (kept[n] ??= make(n));
}

/** Which sides of a wall face no wall: up, right, down, left, a bit each. */
export const SIDE = { up: 1, right: 2, down: 4, left: 8 } as const;

/** `rows` outlined on each side in `open`, and rounded where two outlined sides meet. */
function edged(rows: readonly string[], open: number): string[] {
  const grid = rows.map((row) => [...row]);
  const last = grid.length - 1;
  const set = (x: number, y: number, c: string) => {
    const row = grid[y];
    if (row) row[x] = c;
  };
  for (let i = 0; i <= last; i++) {
    if (open & SIDE.up) set(i, 0, 'O');
    if (open & SIDE.down) set(i, last, 'O');
    if (open & SIDE.left) set(0, i, 'O');
    if (open & SIDE.right) set(last, i, 'O');
  }
  if (open & SIDE.up) for (let i = 1; i < last; i++) set(i, 1, 'L');
  const corner = (side: number, other: number, x: number, y: number, ix: number, iy: number) => {
    if ((open & side) === 0 || (open & other) === 0) return;
    set(x, y, '.');
    set(ix, iy, 'O');
  };
  corner(SIDE.up, SIDE.left, 0, 0, 1, 1);
  corner(SIDE.up, SIDE.right, last, 0, last - 1, 1);
  corner(SIDE.down, SIDE.left, 0, last, 1, last - 1);
  corner(SIDE.down, SIDE.right, last, last, last - 1, last - 1);
  return grid.map((row) => row.join(''));
}

/** A number for `cell` that looks random, the same every time: which look a tile takes there. */
function hashOf(cell: number): number {
  let h = Math.imul(cell ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The wall at `cell`, of the material coded `code` (scrap for a code unknown), outlined on the
 * `open` sides.
 */
export function wallTexture(code: number, open: number, cell: number): Texture {
  const looks = WALL[MATERIAL_BY_CODE.get(code) ?? 'scrap'].length;
  return walls((code * 4 + (hashOf(cell) % looks)) * 16 + open);
}

const walls = keptBy((n) => {
  const code = Math.floor(n / 64);
  const look = Math.floor(n / 16) % 4;
  const open = n % 16;
  const id = MATERIAL_BY_CODE.get(code) ?? 'scrap';
  const colour = MATERIAL_COLOUR[id];
  const rows = WALL[id][look] ?? WALL[id][0] ?? [];
  return pixelTexture(`wall:${id}:${look}:${open}`, edged(rows, open), {
    ...shadesOf(colour),
    x: shade(colour, -0.45),
    O: shade(colour, 0.3),
    L: shade(colour, -0.35),
    ...RUST,
  });
});

/** The back wall of `cell`: a panel, a grille in about one cell of seven. */
export function backTexture(cell: number): Texture {
  return backs(hashOf(cell) % 7 === 0 ? 1 : 0);
}

const backs = keptBy((grille) => {
  const look = grille ? 'grille' : 'plain';
  return pixelTexture(`back:${look}`, BACK[look], shadesOf(BACK_PANEL));
});

export function floorTexture(): Texture {
  return pixelTexture('floor', FLOOR, shadesOf(FLOOR_COLOUR));
}

export function ladderTexture(): Texture {
  return pixelTexture('ladder', LADDER, shadesOf(LADDER_COLOUR));
}

/**
 * A door's cell, joined to the door's cells above and below in `linked` (`SIDE`'s bits): a door
 * several cells tall is one door, its frame and window at the top, its stripes at the bottom.
 */
export function doorTexture(closed: boolean, linked: number): Texture {
  return doors((closed ? 16 : 0) + linked);
}

const doors = keptBy((n) => {
  const closed = n >= 16;
  const linked = n % 16;
  const look = closed ? 'closed' : 'open';
  const rows = [...DOOR[look]];
  const plain = closed ? '...olmmmmmmdo...' : '...o........o...';
  const clear = (from: number, to: number) => rows.fill(plain, from, to);
  if (linked & SIDE.up) clear(0, closed ? 7 : 3);
  if (linked & SIDE.down) clear(closed ? 12 : 15, 16);
  return pixelTexture(`door:${look}:${linked}`, rows, {
    ...shadesOf(DOOR_COLOUR),
    o: shade(DOOR_COLOUR, 0.4),
    k: GEAR.z ?? 0,
    g: 0x8fb6d6,
    y: GEAR.y ?? 0,
  });
});

/** A pipe's tile reaching toward the sides in `linked`, which use `SIDE`'s bits. */
export function pipeTexture(linked: number): Texture {
  return pipes(linked);
}

const pipes = keptBy((linked) => {
  const grid = Array.from({ length: 16 }, () => [...'................']);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j]![i] = c;
  };
  // Four pixels across, lit along the top or left: outline, light, shade, outline.
  const across = (x: number, w: number) => {
    rect(x, 6, w, 1, 'o');
    rect(x, 7, w, 1, 'l');
    rect(x, 8, w, 1, 'd');
    rect(x, 9, w, 1, 'o');
  };
  const down = (y: number, h: number) => {
    rect(6, y, 1, h, 'o');
    rect(7, y, 1, h, 'l');
    rect(8, y, 1, h, 'd');
    rect(9, y, 1, h, 'o');
  };
  if (linked & SIDE.left) across(0, 8);
  if (linked & SIDE.right) across(8, 8);
  if (linked & SIDE.up) down(0, 8);
  if (linked & SIDE.down) down(8, 8);
  // A flange where the runs meet.
  rect(5, 5, 6, 6, 'o');
  rect(6, 6, 4, 4, 'm');
  rect(6, 6, 4, 1, 'l');
  const rows = grid.map((row) => row.join(''));
  return pixelTexture(`pipe:${linked}`, rows, shadesOf(PIPE));
});

export function valveTexture(open: boolean): Texture {
  const colour = open ? VALVE_COLOUR.open : VALVE_COLOUR.closed;
  return pixelTexture(`valve:${open}`, VALVE, { c: colour, O: shade(colour, 0.35) });
}

export function portTexture(): Texture {
  return pixelTexture('port', PORT, GEAR);
}

export function machineTexture(kind: MachineKind): Texture {
  return pixelTexture(`machine:${kind}`, MACHINE_ART[kind], GEAR);
}
