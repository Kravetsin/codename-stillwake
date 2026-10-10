// Compile-time guarantees of the module system. Each `@ts-expect-error` fails `pnpm typecheck`
// the day the mistake under it stops being a type error.
import { describe, expect, it } from 'vitest';
import { defineModule, event, withFuzz } from './module';
import { command, defineSim } from './sim';
import { crew, tanks, type Tanks, TWO_TANKS } from './test-modules';

describe('module types', () => {
  it('gives a module only the dependencies it declared, and only their public API', () => {
    const probe = defineModule<[Tanks]>()({
      id: 'probe',
      dependsOn: ['tanks'],
      events: { pinged: event<{ at: number }>() },
      init: () => ({ notes: [] as number[] }),
      commands: {
        note: {
          validate(ctx, p: { value: number }) {
            void p;
            // @ts-expect-error validation reads the world; it cannot change it
            ctx.state.notes[0] = 1;
            // @ts-expect-error validation cannot reach a dependency's operations
            void ctx.deps.tanks.op;
          },
          apply(ctx, p: { value: number }) {
            ctx.state.notes.push(p.value);
          },
        },
      },
      systems: [
        {
          phase: 'simulation',
          run(ctx) {
            ctx.deps.tanks.op.draw(0, 1);
            // @ts-expect-error 'crew' is not in dependsOn
            void ctx.deps.crew;
            // @ts-expect-error a dependency's state is not reachable, only its API
            void ctx.deps.tanks.state;
            // @ts-expect-error no such query on tanks
            void ctx.deps.tanks.query.pressure;
            // @ts-expect-error operations take the arguments they declare
            ctx.deps.tanks.op.draw('0', 1);
            ctx.emit('pinged', { at: 1 });
            // @ts-expect-error the module declares no such event
            ctx.emit('ponged', { at: 0 });
            // @ts-expect-error event payloads are checked
            ctx.emit('pinged', { at: 'now' });
          },
        },
      ],
    });
    expect(probe.id).toBe('probe');
  });

  it('checks fuzz generators against the module’s commands', () => {
    const bumper = defineModule()({
      id: 'bumper',
      dependsOn: [],
      init: () => ({ n: 0 }),
      commands: { bump: { apply: (ctx, p: { by: number }) => void (ctx.state.n += p.by) } },
    });
    // @ts-expect-error the module has no 'drop' command
    withFuzz(bumper, () => ({ type: 'drop', payload: { by: 1 } }));
    // @ts-expect-error 'by' is a number
    withFuzz(bumper, () => ({ type: 'bump', payload: { by: 'one' } }));
    // @ts-expect-error the generator sees its state read-only
    withFuzz(bumper, (state) => ({ type: 'bump', payload: { by: (state.n = 1) } }));
    expect(withFuzz(bumper, () => ({ type: 'bump', payload: { by: 1 } })).fuzz).toBeTypeOf(
      'function',
    );
  });

  it('requires dependsOn to match the declared dependencies', () => {
    const missing = defineModule<[Tanks]>()({
      id: 'missing',
      // @ts-expect-error dependsOn must name 'tanks'
      dependsOn: [],
      init: () => ({}),
    });
    expect(missing.id).toBe('missing');
  });

  it('types commands and queries for the client', () => {
    const sim = defineSim([crew, tanks]).create(1, TWO_TANKS);
    const level: number = sim.query(tanks).level(0);
    expect(level).toBe(0);

    // @ts-expect-error a fill needs an amount
    command(tanks, 'fill', { cell: 0 });
    // @ts-expect-error tanks has no such command
    command(tanks, 'drain', {});
    // @ts-expect-error queries take the arguments they declare
    sim.query(tanks).level('first');
  });
});
