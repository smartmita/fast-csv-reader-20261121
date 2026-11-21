import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run, transcodeCasesToWriter } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: { text: string; header: boolean }) => unknown;
  transcodeCasesToWriter: (rawBuf: Buffer, writeChunk: (chunk: Uint8Array) => void) => boolean;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const rawBuf = readFileSync(join(INPUT_DIR, 'cases.json'));
const outPath = join(OUTPUT_DIR, 'answers.json');
const fd = openSync(outPath, 'w');
const ok = transcodeCasesToWriter(rawBuf, (chunk) => {
  writeSync(fd, chunk);
});
if (!ok) {
  const cases = JSON.parse(rawBuf.toString('utf8')) as {
    id: string;
    input: { text: string; header: boolean };
  }[];
  writeSync(fd, '[');
  for (let i = 0; i < cases.length; i += 1) {
    const inp = cases[i]!.input;
    cases[i] = undefined as never;
    if (i > 0) writeSync(fd, ',');
    writeSync(fd, JSON.stringify(run(inp)));
  }
  writeSync(fd, ']');
}
closeSync(fd);
