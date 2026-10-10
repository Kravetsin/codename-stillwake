import { describe, expect, it } from 'vitest';
import { crew, dice, first, second, tanks } from './test-modules';
import { defineModule, event, type AnyModule } from './module';
import { command, defineSim, orderModules } from './sim';

const air = defineSim([crew, tanks]);

describe('commands', () => {
  it('applies a valid command', () => {
    const sim = air.create(1);
    const report = sim.step([command(tanks, 'fill', { tank: 0, amount: 4 })]);
    expect(report.refused).toEqual([]);
    expect(sim.query(tanks).level(0)).toBe(4);
  });

  it('refuses with the reason the module gives, and changes nothing', () => {
    const sim = air.create(1);
    const before = sim.hash();
    const over = command(tanks, 'fill', { tank: 0, amount: 11 });
    const missing = command(tanks, 'fill', { tank: 7, amount: 1 });

    const report = sim.step([over, missing]);

    expect(report.refused).toEqual([
      { command: over, reason: 'tanks.overCapacity' },
      { command: missing, reason: 'tanks.noSuchTank' },
    ]);
    expect(sim.query(tanks).total()).toBe(0);
    // Only the tick moved on.
    const unchanged = air.create(1);
    unchanged.step([]);
    expect(sim.hash()).toBe(unchanged.hash());
    expect(sim.hash()).not.toBe(before);
  });

  it('validates against the world as it is when the command applies', () => {
    const sim = air.create(1);
    // The fill applies first in the same tick, so the join sees air and is accepted.
    const report = sim.step([
      command(tanks, 'fill', { tank: 1, amount: 2 }),
      command(crew, 'join', { tank: 1 }),
    ]);
    expect(report.refused).toEqual([]);
    expect(sim.query(crew).air(0)).toBe(3);
  });

  it('refuses amounts that are not positive whole units', () => {
    const sim = air.create(1);
    const report = sim.step([
      command(tanks, 'fill', { tank: 0, amount: -3 }),
      command(tanks, 'fill', { tank: 0, amount: 0.5 }),
    ]);
    expect(report.refused.map((r) => r.reason)).toEqual(['tanks.badAmount', 'tanks.badAmount']);
    expect(sim.query(tanks).level(0)).toBe(0);
  });

  it('gives each sim its own copy of a command, as a remote peer gets', () => {
    const keeper = defineModule()({
      id: 'keeper',
      dependsOn: [],
      init: () => ({ kept: [] as { n: number }[] }),
      commands: {
        keep: { apply: (ctx, p: { n: number }) => void ctx.state.kept.push(p) },
      },
      systems: [{ phase: 'simulation', run: (ctx) => ctx.state.kept.forEach((k) => (k.n += 1)) }],
    });
    const def = defineSim([keeper]);
    const [host, local, remote] = [def.create(1), def.create(1), def.create(1)];
    const shared = command(keeper, 'keep', { n: 0 });
    host.step([shared]);
    local.step([shared]);
    remote.step([JSON.parse(JSON.stringify(shared)) as typeof shared]);
    expect(host.hash()).toBe(remote.hash());
    expect(local.hash()).toBe(remote.hash());
  });

  it('throws on a command no module knows, since peers share one build', () => {
    const sim = air.create(1);
    expect(() => sim.step([{ module: 'tanks', type: 'drain', payload: {} }])).toThrow(
      "Unknown command 'tanks.drain'.",
    );
  });
});

describe('operations and events', () => {
  it('lets a module change another only through its operations, and reports events', () => {
    const sim = air.create(1);
    sim.step([command(tanks, 'fill', { tank: 0, amount: 2 }), command(crew, 'join', { tank: 0 })]);
    // The join applied in tick 0, so the hero breathed once that tick: one unit left.
    expect(sim.query(tanks).level(0)).toBe(1);

    const emptying = sim.step([]);
    expect(emptying.events).toEqual([{ module: 'tanks', type: 'emptied', payload: { tank: 0 } }]);

    const gasping = sim.step([]);
    expect(gasping.events).toEqual([{ module: 'crew', type: 'gasping', payload: { hero: 0 } }]);
    expect(sim.query(crew).air(0)).toBe(2);
  });

  it('reports a copy of an event, so holding it cannot reach into the module', () => {
    const beacon = defineModule()({
      id: 'beacon',
      dependsOn: [],
      events: { moved: event<{ pos: { x: number } }>() },
      init: () => ({ pos: { x: 1 } }),
      queries: { x: (ctx) => ctx.state.pos.x },
      systems: [{ phase: 'simulation', run: (ctx) => ctx.emit('moved', { pos: ctx.state.pos }) }],
    });
    const sim = defineSim([beacon]).create(1);
    const [moved] = sim.step([]).events as unknown as [{ payload: { pos: { x: number } } }];
    moved.payload.pos.x = 99;
    expect(sim.query(beacon).x()).toBe(1);
  });

  it('keeps events to the tick that emitted them', () => {
    const sim = air.create(1);
    sim.step([command(tanks, 'fill', { tank: 0, amount: 1 }), command(crew, 'join', { tank: 0 })]);
    const later = sim.step([]);
    expect(later.events.filter((e) => e.type === 'emptied')).toEqual([]);
  });
});

describe('phases', () => {
  it('runs every phase in order, and within a phase each module after its dependencies', () => {
    const sim = defineSim([second, first]).create(1);
    sim.step([]);
    expect(sim.world.slices['second']).toEqual({
      log: [
        'construction:construction',
        'derivation:derivation',
        'simulation:simulation',
        'events:events',
      ],
    });
  });
});

describe('registry', () => {
  it('orders modules after their dependencies, keeping registration order otherwise', () => {
    expect(orderModules([crew, dice, tanks]).map((m) => m.id)).toEqual(['tanks', 'crew', 'dice']);
  });

  it('rejects a cycle and names it', () => {
    // The typed API cannot express a cycle; hand-built definitions can, so the registry still checks.
    const a = { id: 'a', dependsOn: ['b'], init: () => ({}) } as AnyModule;
    const b = { id: 'b', dependsOn: ['a'], init: () => ({}) } as AnyModule;
    expect(() => orderModules([a, b])).toThrow('Modules depend on each other: a → b → a.');
  });

  it('rejects an unregistered dependency and a duplicate id', () => {
    expect(() => orderModules([crew])).toThrow(
      "Module 'crew' depends on 'tanks', which is not registered.",
    );
    expect(() => orderModules([tanks, tanks])).toThrow("Module 'tanks' is registered twice.");
  });

  it('refuses to query a module the sim does not hold', () => {
    expect(() => defineSim([tanks]).create(1).query(crew)).toThrow(
      "Module 'crew' is not registered in this sim.",
    );
  });
});

describe('determinism', () => {
  const run = (seed: number) => {
    const sim = defineSim([crew, tanks, dice]).create(seed);
    sim.step([command(tanks, 'fill', { tank: 0, amount: 5 }), command(crew, 'join', { tank: 0 })]);
    for (let i = 0; i < 50; i++) sim.step([]);
    return sim;
  };

  it('gives the same world and hash for the same seed and commands', () => {
    const [a, b] = [run(42), run(42)];
    expect(a.hash()).toBe(b.hash());
    expect(a.world).toEqual(b.world);
  });

  it('gives a different world for a different seed', () => {
    expect(run(42).hash()).not.toBe(run(43).hash());
  });

  it('draws dice within range', () => {
    const rolls = (run(7).world.slices['dice'] as { rolls: number[] }).rolls;
    expect(rolls).toHaveLength(51);
    expect(rolls.every((r) => r >= 1 && r <= 6)).toBe(true);
    expect(new Set(rolls).size).toBe(6);
  });
});
