/** How often a hidden page's time is moved on: as often as the host releases ticks. */
export const BEAT_MS = 50;

/** A steady beat that a hidden page still gets: a dedicated worker's timer, or a test's own. */
export interface Beats {
  start(everyMs: number, beat: () => void): void;
  stop(): void;
  destroy(): void;
}

/** What `keepTime` needs of the document: whether it is hidden, and word when that changes. */
export interface Page {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * A worker that posts a beat every so often. Browsers stop a hidden page's frames and slow its own
 * timers to once a second, then once a minute; a worker's are left alone (0013). Made from a Blob,
 * so it starts on the desktop shell's `file:` page too.
 */
export function workerBeats(): Beats {
  const source =
    'let t; onmessage = (e) => { clearInterval(t); if (e.data > 0) t = setInterval(() => postMessage(0), e.data); };';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return {
    start(everyMs, beat) {
      worker.onmessage = () => beat();
      worker.postMessage(everyMs);
    },
    stop() {
      worker.postMessage(0);
      worker.onmessage = null;
    },
    destroy() {
      worker.terminate();
    },
  };
}

/**
 * Moves the game's time on from the page's frames while it is shown, and from `beats` while it is
 * hidden, so a hidden host keeps releasing ticks and a hidden peer keeps running them. Both measure
 * from one mark, so no time is counted twice or lost at a switch. `run` gets the time passed.
 */
export function keepTime(
  run: (elapsedMs: number) => void,
  page: Page,
  beats: Beats = workerBeats(),
  now: () => number = () => performance.now(),
) {
  let last = now();
  const elapse = () => {
    const at = now();
    const elapsed = at - last;
    last = at;
    run(elapsed);
  };
  const switchOver = () => {
    if (page.hidden) beats.start(BEAT_MS, elapse);
    else beats.stop();
  };
  page.addEventListener('visibilitychange', switchOver);
  switchOver();
  return {
    /** Called on every frame the page draws. */
    frame: elapse,
    destroy() {
      page.removeEventListener('visibilitychange', switchOver);
      beats.destroy();
    },
  };
}
