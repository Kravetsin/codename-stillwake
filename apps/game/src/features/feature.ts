import type { ComponentType } from 'react';
import type { Container } from 'pixi.js';
import type { Game } from '../session/game';

/** What a layer sees each frame. */
export interface Frame {
  readonly game: Game;
  readonly screen: { readonly width: number; readonly height: number };
}

/** Something drawn into the world: created once, updated every frame, destroyed with the game. */
export interface Layer {
  readonly view: Container;
  update(frame: Frame): void;
}

/**
 * A client feature: what one sim module shows and offers. Features never import each other; they
 * read the sim through its queries and change it only by sending commands through `game.client`.
 */
export interface Feature {
  readonly id: string;
  /** Layers are stacked in the order of FEATURES. */
  readonly layer?: () => Layer;
  readonly Panel?: ComponentType<{ readonly game: Game }>;
}
