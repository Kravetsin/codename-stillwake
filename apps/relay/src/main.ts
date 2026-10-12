import { createPlaytestServer } from './server';

// Settings from the environment, as a container passes them.
const port = Number(process.env.PORT ?? 8080);
const gameDir = process.env.GAME_DIR ?? 'game';
const password = process.env.PLAYTEST_PASSWORD || undefined;

createPlaytestServer({ gameDir, password }).listen(port, () => {
  console.log(
    `Stillwake playtest server on :${port}, serving ${gameDir}${password ? ', behind a password' : ''}`,
  );
});
