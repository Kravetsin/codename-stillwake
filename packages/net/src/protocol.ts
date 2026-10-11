import type { Command } from '@stillwake/sim';

/** A peer asks the host to apply a command. */
export interface CommandMessage {
  readonly kind: 'command';
  readonly command: Command;
}

/** The host releases a tick: every peer applies these commands on it, in this order. */
export interface TickMessage {
  readonly kind: 'tick';
  readonly tick: number;
  readonly commands: readonly Command[];
}

/**
 * The host lets a peer in mid-session: its id, the host's build, and the world saved on the tick the
 * host releases next. Every tick after it follows; commands not yet released ride in the next one.
 */
export interface WelcomeMessage {
  readonly kind: 'welcome';
  readonly id: number;
  readonly build: string;
  readonly save: string;
}

/**
 * A peer's hero, as it moves on that peer: not a command, since heroes live outside the simulation
 * (0002). The host passes it to every other peer, stamped with the sender, and keeps nothing of it.
 */
export interface HeroMessage {
  readonly kind: 'hero';
  /** What the client says of its hero; net carries it without reading it. */
  readonly state: unknown;
}

/** Another peer's hero, as the host passed it on. */
export interface PeerHeroMessage {
  readonly kind: 'hero';
  readonly from: number;
  readonly state: unknown;
}

export type ToHost = CommandMessage | HeroMessage;
export type ToClient = TickMessage | WelcomeMessage | PeerHeroMessage;
