/** Networks take these in turn in the overlay, so neighbours rarely share one. */
export const PALETTE = [
  0x4fc3f7, 0xffb74d, 0xba68c8, 0x81c784, 0xf06292, 0xfff176, 0x4db6ac, 0xa1887f,
];

/** The overlay colour of the `index`-th network in `networks()` order. */
export const colourOf = (index: number) => PALETTE[index % PALETTE.length] ?? 0xffffff;

/** The networks with a machine that `feeds` them oxygen: the pipes drawn lit. */
export function litNetworks<N extends { readonly machines: readonly number[] }>(
  networks: readonly N[],
  feeds: (machine: number) => boolean,
): N[] {
  return networks.filter((n) => n.machines.some(feeds));
}
