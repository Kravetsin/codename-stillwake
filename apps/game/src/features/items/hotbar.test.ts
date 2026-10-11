import { describe, expect, it } from 'vitest';
import { ROW, wheelSlot } from './hotbar';

describe('the wheel on the hotbar', () => {
  it('turns to the next slot down and the one before up, round the row', () => {
    expect(wheelSlot(0, 100)).toBe(1);
    expect(wheelSlot(ROW - 1, 3)).toBe(0);
    expect(wheelSlot(0, -100)).toBe(ROW - 1);
    expect(wheelSlot(4, -1)).toBe(3);
    expect(wheelSlot(4, 0)).toBe(4);
  });
});
