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

export type ToHost = CommandMessage;
export type ToClient = TickMessage | WelcomeMessage;
