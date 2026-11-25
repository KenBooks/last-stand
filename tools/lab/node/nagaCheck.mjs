// `lab naga`'s Node side: the page's shader modules written to a folder and checked by `tools/lab/naga`, a Rust
// program of naga's (wgpu's shader compiler, Firefox's), built here by cargo the first time and when it changes. Chrome
// compiles WGSL with Tint, so what naga refuses is seen in no page the lab boots (tools/lab/commands/naga.md).
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { labError } from './errors.mjs';
import { OUT, REPO } from './paths.mjs';

const run = promisify(execFile);

/** the checker's crate, and where cargo builds it (the lab's own output, ignored by git) */
const CRATE = join(REPO, 'tools/lab/naga');
const TARGET = join(OUT, 'naga', 'target');
const CHECKER = join(TARGET, 'release', process.platform === 'win32' ? 'lab-naga.exe' : 'lab-naga');
/** the module the checker must refuse (`--canary` in name only: it's always checked) */
export const CANARY = join(CRATE, 'canary.wgsl');
export const CANARY_LABEL = 'the canary (tools/lab/naga/canary.wgsl), which naga must refuse';
/** the most bytes of output read back from cargo or the checker */
const OUTPUT_MOST = 64 * 1024 * 1024;

/** A stage naga refused: the module's label, the entry point, the constants, the step and what naga said. */
export class NagaFault {
  constructor(label, entry, constants, step, said) {
    this.label = label;
    this.entry = entry;
    this.constants = constants;
    this.step = step;
    this.said = said;
  }
}

/** The checker built, if cargo has anything to do: cargo's own check is quick once it's built. */
async function buildChecker() {
  const args = ['build', '--release', '--quiet', '--manifest-path', join(CRATE, 'Cargo.toml')];
  const env = { ...process.env, CARGO_TARGET_DIR: TARGET };
  try {
    await run('cargo', args, { env, maxBuffer: OUTPUT_MOST });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw labError('lab naga needs Rust\'s cargo on the PATH to build its checker (https://rustup.rs)');
    }
    throw labError(`lab naga's checker didn't build:\n${error.stderr ?? error.message}`);
  }
}

/** `modules` (the page's, each `{ label, code, sets }`) and the canary written into `folder` as the checker reads
 *  it. */
function writeModules(folder, modules, canaryCode) {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const all = [...modules, { label: CANARY_LABEL, code: canaryCode, sets: ['LAYER_PART=1'] }];
  const lines = all.map((module, index) => {
    const file = String(index).padStart(3, '0');
    writeFileSync(join(folder, `${file}.wgsl`), module.code);
    writeFileSync(join(folder, `${file}.sets`), module.sets.join('\n'));
    const label = module.label.replace(/[\t\n]/g, ' ');
    return `${file}\t${label}`;
  });
  writeFileSync(join(folder, 'list.txt'), `${lines.join('\n')}\n`);
}

/** The checker's output read: its faults, and how many modules and stages it checked. */
export function readChecked(output) {
  const faults = [];
  let modules = 0;
  let stages = 0;
  for (const line of output.split(/\r?\n/)) {
    const [kind, ...fields] = line.split('\t');
    if (kind === 'fault') faults.push(new NagaFault(...fields));
    if (kind === 'checked') {
      modules = Number(fields[0]);
      stages = Number(fields[1]);
    }
  }
  return { faults, modules, stages };
}

/** `modules` checked by naga as Firefox's WebGPU takes each stage, in `folder` (written afresh), with the canary. */
export async function checkModules(folder, modules, canaryCode) {
  writeModules(folder, modules, canaryCode);
  await buildChecker();
  try {
    const { stdout } = await run(CHECKER, [folder], { maxBuffer: OUTPUT_MOST });
    return readChecked(stdout);
  } catch (error) {
    throw labError(`lab naga's checker stopped:\n${error.stderr ?? error.message}`);
  }
}
