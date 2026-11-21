import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');
setFlagsFromString('--no-concurrent-recompilation');
setFlagsFromString('--no-concurrent-sweeping');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: { text: string; header: boolean }) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: { text: string; header: boolean };
}[];

const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i += 1) {
  const inp = cases[i]!.input;
  cases[i] = undefined as never;
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, JSON.stringify(run(inp)));
}
writeSync(fd, ']');
closeSync(fd);
