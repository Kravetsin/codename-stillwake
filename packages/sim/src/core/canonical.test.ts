import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState, hashText, plainCopy } from './canonical';

/** Writing past the end, as `levels[i] = x` with a too-large `i` does, leaves holes. */
function holed(): number[] {
  const a = [1];
  a[2] = 3;
  return a;
}

describe('canonicalJson', () => {
  it('gives equal text for equal data whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'] })).toBe(
      canonicalJson({ a: [true, null, 'x'], b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it.each([
    ['NaN', { n: NaN }, '$.n: NaN is not plain data'],
    ['Infinity', [Infinity], '$[0]: Infinity is not plain data'],
    ['a Map', { m: new Map() }, '$.m: Map is not plain data'],
    ['a class instance', { d: new (class Thing {})() }, '$.d: Thing is not plain data'],
    ['a function', { f: () => 0 }, '$.f: function is not plain data'],
    ['a hole in an array', { a: holed() }, '$.a[1]: a hole in an array is not plain data'],
    ['undefined in an object', { a: undefined }, '$.a: undefined is not plain data'],
  ])('rejects %s, naming where it is', (_name, value, message) => {
    expect(() => canonicalJson(value)).toThrow(message);
  });

  it('rejects one object in two places, which a load would turn into two', () => {
    const shared = { n: 1 };
    expect(() => canonicalJson({ a: shared, b: shared })).toThrow(
      '$.b: the same object appears twice in state',
    );
  });

  it('rejects a cycle instead of overflowing the stack', () => {
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(() => canonicalJson(loop)).toThrow('$.self: the same object appears twice in state');
  });
});

describe('plainCopy', () => {
  it('copies deeply', () => {
    const original = { a: { b: [1, 2] } };
    const copy = plainCopy(original);
    copy.a.b.push(3);
    expect(original.a.b).toEqual([1, 2]);
  });
});

describe('hashText', () => {
  it('is stable and tells different text apart', () => {
    expect(hashText('stillwake')).toBe(hashText('stillwake'));
    expect(hashText('stillwake')).not.toBe(hashText('stillwakf'));
    expect(hashText('')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('hashState', () => {
  it('agrees for the same data, whatever order its keys were written in', () => {
    expect(hashState({ b: 1, a: [true, null, 'x'] })).toBe(
      hashState({ a: [true, null, 'x'], b: 1 }),
    );
  });

  it('tells apart what canonicalJson tells apart', () => {
    const states = [
      { a: 1 },
      { a: 2 },
      { a: '1' },
      { a: [1] },
      { a: [1, 2] },
      { a: [[1], 2] },
      { a: [1, [2]] },
      { b: 1 },
      { a: { b: 1 } },
      { a: true },
      { a: null },
      { a: -1 },
      { a: 0.5 },
      { a: 1_099_511_627_776 },
      { a: 'ab', b: 'c' },
      { a: 'a', b: 'bc' },
    ];
    expect(new Set(states.map(hashState)).size).toBe(states.length);
  });

  it('refuses what is not plain data', () => {
    expect(() => hashState({ f: () => 1 })).toThrow('function is not plain data');
  });
});
