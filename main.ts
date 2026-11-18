// Mirador Bay — the entry program for make.fun bounty gta6-01.
//
// Node 22, standard library only. The game itself is game/: plain static files
// that a desktop browser loads offline from game/index.html. This program hands
// the entry in: it copies game/ and screenshots/ into the output directory and
// writes dossier.json, the summary the judge reads, using the kit's builder.
//
// Run locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// then open out/game/index.html (or run `node serve.ts` for the dev server).
// Two runs with the same inputs produce identical bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps. Only text_max_bytes shapes the dossier's bytes; the rest
// refuse an entry the scorer would refuse, so we mirror them exactly.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });

// Fail early with a clear message if the hand-in is incomplete, rather than
// writing a dossier the scorer would reject.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: the entry is a browser game');
}
if (!existsSync(join(here, 'screenshots'))) {
  throw new Error('screenshots/ is missing: hand in real renders of the game');
}

// The game is the authored entry; every file under game/ belongs to it.
cpSync(join(here, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots are real renders of this game; the first by name is the cover.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, CAPS),
);

console.log(`Mirador Bay entry written to ${outputDir}`);
