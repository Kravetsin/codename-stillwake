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

export type ToHost = CommandMessage;
export type ToClient = TickMessage;
