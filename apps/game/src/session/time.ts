/** How often the beat moves time on, whatever the frames do: as often as the host releases ticks. */
export const BEAT_MS = 50;

/** A steady beat that a hidden or covered page still gets: a dedicated worker's timer, or a test's. */
export interface Beats {
  start(everyMs: number, beat: () => void): void;
  destroy(): void;
}

/**
 * A worker that posts a beat every so often. Chrome slows a background page's frames to about one a
 * second, often without telling the page it is hidden, and its timers with them; a worker's timers
 * are left alone (0013). Made from a Blob, so it starts on the desktop shell's `file:` page too.
 */
export function workerBeats(): Beats {
  const source =
    'let t; onmessage = (e) => { clearInterval(t); t = setInterval(() => postMessage(0), e.data); };';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return {
    start(everyMs, beat) {
      worker.onmessage = () => beat();
      worker.postMessage(everyMs);
    },
    destroy() {
      worker.terminate();
    },
  };
}

/**
 * Moves the game's time on from the page's frames and from `beats` both, each from the same mark,
 * so no time is counted twice and no gap grows past a beat: one longer than the clock's catch-up
 * would be dropped, and a page drawing once a second would run its world at a quarter of the pace.
 * `run` gets the time passed.
 */
export function keepTime(
  run: (elapsedMs: number) => void,
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
  beats.start(BEAT_MS, elapse);
  return {
    /** Called on every frame the page draws. */
    frame: elapse,
    destroy: () => beats.destroy(),
  };
}
