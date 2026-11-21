import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: { text: string; header: boolean }) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: { text: string; header: boolean };
}[];

const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i += 1) {
  answers[i] = run(cases[i]!.input);
}

writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
