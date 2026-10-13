/** A range a particle's value is drawn from, evenly. */
type Range = readonly [number, number];

/**
 * How one kind of particle looks and moves, in pixels of the world and milliseconds: a square of
 * `colour` that fades out over its life, with a soft `glow` around it if it has one. `spread` is the
 * angle around its heading it may leave at; `gravity` pulls it down (up when negative) aboard and
 * never in space; `drag` is the share of its speed it loses a second.
 */
export interface Effect {
  readonly colour: number;
  readonly alpha: number;
  readonly size: Range;
  readonly lifeMs: Range;
  readonly speed: Range;
  readonly spread: number;
  readonly gravity: number;
  readonly drag: number;
  readonly glow?: { readonly colour: number; readonly size: number };
  /** Whether it flickers as it fades, as an ember does. */
  readonly flicker?: boolean;
}

/** Every effect, by what makes it. Headings are radians, screen-wise: 0 right, -π/2 up. */
export const EFFECTS = {
  /** Kicked up by a boot on the floor, settling again. */
  dust: {
    colour: 0xd4dae2,
    alpha: 0.8,
    size: [1.5, 3],
    lifeMs: [450, 900],
    speed: [14, 36],
    spread: 1.2,
    gravity: 18,
    drag: 2.5,
  },
  /** Flying off work on a plan, falling in an arc aboard. */
  spark: {
    colour: 0xfff3c4,
    alpha: 1,
    size: [1, 1.4],
    lifeMs: [250, 550],
    speed: [40, 110],
    spread: 2.2,
    gravity: 260,
    drag: 1,
    glow: { colour: 0xffa040, size: 6 },
  },
  /** Rising from a furnace at work, drifting and flickering out. */
  ember: {
    colour: 0xffe0a0,
    alpha: 1,
    size: [1, 1.6],
    lifeMs: [1200, 2200],
    speed: [6, 18],
    spread: 0.9,
    gravity: -8,
    drag: 0.4,
    glow: { colour: 0xff7a20, size: 7 },
    flicker: true,
  },
  /** Air streaming out of a room through its openings into space. */
  air: {
    colour: 0xcfeaff,
    alpha: 0.7,
    size: [1.5, 2.5],
    lifeMs: [500, 1000],
    speed: [40, 90],
    spread: 0.8,
    gravity: 0,
    drag: 0.5,
  },
} as const satisfies Record<string, Effect>;

/** One particle in flight. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  readonly lifeMs: number;
  readonly size: number;
  readonly gravity: number;
  readonly effect: Effect;
}

/** At most this many particles fly at once: a big breach thins out rather than costing frames. */
export const LIMIT = 2000;

/**
 * Particles: emitted in bursts, moved and aged each frame, gone at the end of their life. Purely
 * drawn, never part of the world: each peer emits its own, from what it sees. `random` is
 * `Math.random` but in tests.
 */
export function createParticles(limit: number, random: () => number = Math.random) {
  const live: Particle[] = [];
  const draw = (r: Range) => r[0] + (r[1] - r[0]) * random();
  return {
    live: live as readonly Particle[],
    /**
     * `count` particles of `effect` at `at`, heading around `heading`; past the limit, no more.
     * In space nothing pulls them.
     */
    emit(
      effect: Effect,
      at: { readonly x: number; readonly y: number },
      count: number,
      heading = -Math.PI / 2,
      inSpace = false,
    ) {
      for (let i = 0; i < count && live.length < limit; i++) {
        const angle = heading + (random() - 0.5) * effect.spread;
        const speed = draw(effect.speed);
        live.push({
          x: at.x,
          y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          ageMs: 0,
          lifeMs: draw(effect.lifeMs),
          size: draw(effect.size),
          gravity: inSpace ? 0 : effect.gravity,
          effect,
        });
      }
    },
    /** Moves every particle on by `elapsedMs` and lets go of those past their life. */
    step(elapsedMs: number) {
      const dt = elapsedMs / 1000;
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i] as Particle;
        p.ageMs += elapsedMs;
        if (p.ageMs >= p.lifeMs) {
          // Order does not matter: the last takes the place of the one gone.
          live[i] = live[live.length - 1] as Particle;
          live.pop();
          continue;
        }
        const keep = Math.max(0, 1 - p.effect.drag * dt);
        p.vx *= keep;
        p.vy = p.vy * keep + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    clear() {
      live.length = 0;
    },
  };
}

/** How opaque `p` is now: fading out over its life, an ember flickering as it goes. */
export function alphaOf(p: Particle): number {
  const left = 1 - p.ageMs / p.lifeMs;
  const flicker = p.effect.flicker ? 0.65 + 0.35 * Math.sin(p.ageMs / 37 + p.lifeMs) : 1;
  return p.effect.alpha * left * flicker;
}

/**
 * The game's particles, one set per page as the other session stores: features emit into it, the
 * `effects` layer moves and draws it.
 */
export const particles = createParticles(LIMIT);
