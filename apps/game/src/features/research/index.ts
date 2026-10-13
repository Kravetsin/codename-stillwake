import type { Feature } from '../feature';
import { Learned } from './Learned';

/**
 * Knowledge (ADR 0024) without a word but its title: the pictures of what the world has just learned.
 * An analyzer is worked as a crate is, through `items`; the build menu shows only what is known.
 */
export const researchFeature: Feature = {
  id: 'research',
  Panel: Learned,
};
