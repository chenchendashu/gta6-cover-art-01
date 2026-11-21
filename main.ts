// Vice Frame — Leonida Cover Studio: the program that hands the entry in.
//
// The app itself is the static site under app/ (open app/index.html in a
// desktop browser; it runs fully offline and never uploads a photo). This
// program's one job is delivery: copy app/ and screenshots/ into the output
// directory and write the dossier the judge reads, using the kit's vendored
// buildDossier so the bytes match what the scorer rebuilds.
//
// Run it the way the kit prescribes, from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (In the grader's container the output directory is /output and
// MAKEFUN_OUTPUT_DIR is unset.)

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The dossier limits below are the scorer's own caps for this bounty: they
// shape the dossier text and refuse, here rather than at the gate, an entry
// the scorer would refuse anyway (too many or too heavy screenshots, an
// oversized app tree).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, DOSSIER_LIMITS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

const shots = readdirSync(join(outputDir, 'screenshots')).length;
console.log(`Vice Frame handed in: app/ + ${shots} screenshot(s) + dossier.json (${dossier.length} bytes) -> ${outputDir}`);
