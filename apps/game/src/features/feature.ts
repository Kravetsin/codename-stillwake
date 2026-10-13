import type { ComponentType } from 'react';
import type { Container } from 'pixi.js';
import type { Camera } from '../render/camera';
import type { Game } from '../session/game';

/** What a layer sees each frame. */
export interface Frame {
  readonly game: Game;
  readonly screen: { readonly width: number; readonly height: number };
  readonly camera: Camera;
  /** Real time since the last frame, whatever the game speed. */
  readonly elapsedMs: number;
}

/** Something drawn into the world: created once, updated every frame, destroyed with the game. */
export interface Layer {
  readonly view: Container;
  /**
   * Drawn behind the ship's structure, over its back walls: what runs behind walls and machines,
   * such as pipes and cables. Updated with `view`.
   */
  readonly behind?: Container;
  update(frame: Frame): void;
  /** Releases what the layer holds outside its view, such as input listeners. */
  destroy?(): void;
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
  /** A view of the ship this feature explains, drawn over everything while switched on. */
  readonly overlay?: Overlay;
}

/** One overlay: at most one is on at a time, switched by its key. */
export interface Overlay {
  /** An i18n key for its name on the overlay bar. */
  readonly name: string;
  /** The key that switches it on and off, as `KeyboardEvent.code`: the same on every layout. */
  readonly key: string;
  /** Created once; updated only while the overlay is on. */
  readonly layer: () => Layer;
}
