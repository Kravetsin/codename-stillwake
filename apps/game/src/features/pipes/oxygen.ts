/** Networks take these in turn, so neighbours rarely share one; the panel and overlay agree. */
export const PALETTE = [
  0x4fc3f7, 0xffb74d, 0xba68c8, 0x81c784, 0xf06292, 0xfff176, 0x4db6ac, 0xa1887f,
];

/** The colour of the `index`-th network in `networks()` order. */
export const colourOf = (index: number) => PALETTE[index % PALETTE.length] ?? 0xffffff;

/**
 * The oxygen on each network that has a tank, in `networks()` order with its colour: the sum of what
 * its tanks hold, as `oxygenIn` reports them.
 */
export function networksOxygen(
  networks: readonly { readonly machines: readonly number[] }[],
  isTank: (machine: number) => boolean,
  oxygenIn: (tank: number) => number,
): { colour: number; tanks: number; oxygen: number }[] {
  return networks.flatMap((network, i) => {
    const tanks = network.machines.filter(isTank);
    if (tanks.length === 0) return [];
    const oxygen = tanks.reduce((sum, tank) => sum + oxygenIn(tank), 0);
    return [{ colour: colourOf(i), tanks: tanks.length, oxygen }];
  });
}
