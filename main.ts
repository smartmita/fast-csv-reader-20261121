import { transcodeCasesFile } from './solve.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

transcodeCasesFile(`${INPUT_DIR}/cases.json`, `${OUTPUT_DIR}/answers.json`);
