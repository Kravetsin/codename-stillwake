import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A slot is a plain name: it becomes a file name, so nothing may climb out of the saves folder. */
const SLOT = /^[a-z0-9-]+$/;

/** Save files in `dir`, one `<slot>.json` each: the game's saves on the desktop. */
export function createSaves(dir: string) {
  const file = (slot: string) => {
    if (!SLOT.test(slot)) throw new Error(`'${slot}' is not a save slot name.`);
    return path.join(dir, `${slot}.json`);
  };
  // Writes to one slot run one after another: a second save clicked mid-write waits its turn.
  const queues = new Map<string, Promise<void>>();
  let written = 0;

  const writeNow = async (slot: string, text: string) => {
    await mkdir(dir, { recursive: true });
    // Written aside, then renamed over: a crash mid-write leaves the last save whole.
    const target = file(slot);
    const aside = `${target}.${++written}.tmp`;
    await writeFile(aside, text, 'utf8');
    await rename(aside, target);
  };

  return {
    async read(slot: string): Promise<string | undefined> {
      try {
        return await readFile(file(slot), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    write(slot: string, text: string): Promise<void> {
      file(slot);
      const next = (queues.get(slot) ?? Promise.resolve()).then(
        () => writeNow(slot, text),
        () => writeNow(slot, text),
      );
      queues.set(slot, next);
      return next;
    },
  };
}
