/** How often the readout changes, in milliseconds. */
const EVERY_MS = 500;

/**
 * What light costs a frame, in a line at the screen's corner: for development only, so its cost
 * can be watched on any machine. Shows the slowest frame of each half second.
 */
export function createReadout() {
  const line = document.createElement('div');
  Object.assign(line.style, {
    position: 'fixed',
    right: '8px',
    bottom: '28px',
    font: '11px monospace',
    color: '#9fb4c8',
    pointerEvents: 'none',
    zIndex: '50',
  });
  document.body.appendChild(line);
  let sinceMs = 0;
  let worstMs = 0;
  return {
    /** Counts a frame of light that took `costMs`, over `cells` cells. */
    show(cells: string, costMs: number, elapsedMs: number) {
      worstMs = Math.max(worstMs, costMs);
      sinceMs += elapsedMs;
      if (sinceMs < EVERY_MS) return;
      line.textContent = `light ${cells} cells · cpu ${worstMs.toFixed(2)} ms`;
      sinceMs = 0;
      worstMs = 0;
    },
    destroy() {
      line.remove();
    },
  };
}
