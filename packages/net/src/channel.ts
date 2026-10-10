/** One end of a two-way link: sends `Out`, receives `In`. Messages are plain data. */
export interface Channel<In, Out> {
  send(message: Out): void;
  /** Sets the receiver; anything that arrived before it is delivered at once, in order. */
  onMessage(handler: (message: In) => void): void;
}

/**
 * Two ends of an in-process link, used by single-player and by tests. Every message arrives as a
 * copy, as it would over a network, so no peer can hold an object another peer also holds.
 */
export function loopback<AtoB, BtoA>(): [a: Channel<BtoA, AtoB>, b: Channel<AtoB, BtoA>] {
  const a = inbox<BtoA>();
  const b = inbox<AtoB>();
  return [
    { send: (message) => b.deliver(copy(message)), onMessage: a.listen },
    { send: (message) => a.deliver(copy(message)), onMessage: b.listen },
  ];
}

function inbox<T>() {
  let handler: ((message: T) => void) | undefined;
  const waiting: T[] = [];
  return {
    deliver: (message: T) => {
      if (handler) handler(message);
      else waiting.push(message);
    },
    listen: (next: (message: T) => void) => {
      handler = next;
      for (const message of waiting.splice(0)) next(message);
    },
  };
}

function copy<T>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}
