// `lab programs --cost`: what each of the boot's programs costs to compile. Each is compiled again from the GLSL three
// gave it (the ledger's, `watchPrograms`), alone, salted so no cache can answer (the browser's, ANGLE's, the GPU
// driver's), and timed from its source to its link: on Windows that is ANGLE turning it into HLSL and the D3D compiler
// making it, the CPU a first visit spends on it (a return finds it in the cache). One at a time, the time is the
// program's own, not shared with others compiling beside it. Summed by kind and by what uses the programs, the
// longest listed with their fragment shader's size and the point lights it is lit by (three writes the lights' loop
// out once a light). Its canary is the cache: the longest program compiled again with its salt must come back far
// sooner (the cache answering), and with a new salt as long as before.
import * as THREE from 'three';
import { realWait } from './lab';
import { programsMade, type ProgramMade } from '../../../src/core/shaders';

export interface ProgramCost {
  entry: ProgramMade;
  ms: number;
}

/** the longest programs listed */
const LONGEST_SHOWN = 10;
/** the browser's time given to the page between two compiles, ms (the page stays live over a minute of them) */
const BREATH_MS = 5;
/** the canary: the cached compile must take under this share of the cold one, a new salt's over the second */
const CACHED_SHARE = 0.25;
const AFRESH_SHARE = 0.5;

/** A salt no earlier run used: the lab's own `Math.random` is seeded, the same every boot. */
function freshSalt(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000;
}

/**
 * `source` with `salt` written into what it computes, so it translates to other HLSL than any program before it
 * (a comment would be stripped before any cache's key is taken): its `main` renamed and called from a new one, the
 * fragment's discarding below the screen's edge and the vertex's moving by nothing seen.
 */
function salted(source: string, salt: number, stage: 'vertex' | 'fragment'): string {
  const main = /\bvoid\s+main\s*\(\s*(void)?\s*\)/;
  if (!main.test(source)) throw new Error(`lab: programs --cost: a ${stage} shader with no main`);
  const renamed = source.replace(main, 'void labCostMain()');
  const wrapper = stage === 'fragment'
    ? `void main() { if (gl_FragCoord.x < -float(${salt})) discard; labCostMain(); }`
    : `void main() { labCostMain(); gl_Position.x += float(${salt}) * 1e-20; }`;
  return `${renamed}\n${wrapper}\n`;
}

/** The ms from `vertex` and `fragment` handed to the GPU to their program linked, waited for (a link's status is
 *  only known once it's done); a program that failed to link is an error. */
function compileTime(gl: WebGL2RenderingContext, vertex: string, fragment: string): number {
  const start = window.__labClock.realNow();
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  const ms = window.__labClock.realNow() - start;
  const log = linked ? '' : gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  if (!linked) throw new Error(`lab: programs --cost: a salted program didn't link: ${log?.slice(0, 200)}`);
  return ms;
}

/** `entry` compiled again with `salt`, ms. */
function costWith(gl: WebGL2RenderingContext, entry: ProgramMade, salt: number): number {
  return compileTime(gl, salted(entry.vertex, salt, 'vertex'), salted(entry.fragment, salt, 'fragment'));
}

/** Every one of `made` compiled again alone, each with a salt of its own. */
export async function costs(gl: WebGL2RenderingContext, made: ProgramMade[]): Promise<ProgramCost[]> {
  const salt = freshSalt();
  const measured: ProgramCost[] = [];
  for (const [i, entry] of made.entries()) {
    measured.push({ entry, ms: costWith(gl, entry, salt + i) });
    await realWait(BREATH_MS);
  }
  return measured;
}

/** The point lights `fragment` is lit by: the highest light three wrote its loop out for, plus one. */
function pointLightsOf(fragment: string): number {
  let most = -1;
  for (const match of fragment.matchAll(/pointLights\[\s*(\d+)\s*\]/g)) most = Math.max(most, Number(match[1]));
  return most + 1;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** `measured` summed by `keyOf`, the costliest first, `listed` of them as `name count: time`. */
export function summedText(measured: ProgramCost[], keyOf: (entry: ProgramMade) => string, listed: number): string {
  const sums = new Map<string, { count: number; ms: number }>();
  for (const { entry, ms } of measured) {
    const sum = sums.get(keyOf(entry)) ?? { count: 0, ms: 0 };
    sum.count++;
    sum.ms += ms;
    sums.set(keyOf(entry), sum);
  }
  const sorted = [...sums].sort((a, b) => b[1].ms - a[1].ms);
  const shown = sorted.slice(0, listed).map(([name, { count, ms }]) => `${name} ${count}: ${seconds(ms)}`);
  const left = sorted.length - shown.length;
  return `${shown.join('; ')}${left > 0 ? `; and ${left} more` : ''}`;
}

/** The longest of `measured`, each with its fragment shader's size and point lights. */
export function longestText(measured: ProgramCost[], groupOf: (entry: ProgramMade) => string): string[] {
  const longest = [...measured].sort((a, b) => b.ms - a.ms).slice(0, LONGEST_SHOWN);
  return longest.map(({ entry, ms }) => {
    const size = `fragment ${(entry.fragment.length / 1024).toFixed(0)} kB`;
    const lights = `${pointLightsOf(entry.fragment)} point lights`;
    return `    ${(ms / 1000).toFixed(2)} s: ${groupOf(entry)}, ${size}, ${lights}, for ${entry.owner}`;
  });
}

/** The point lights the programs are lit by, counted: `15 point lights 92; 0 point lights 54`. */
export function lightsText(measured: ProgramCost[]): string {
  return summedText(measured, (entry) => `${pointLightsOf(entry.fragment)} point lights`, LONGEST_SHOWN);
}

/** A part of what lights a material, taken away (and given back by what it returns). */
interface Part {
  name: string;
  without: (scene: THREE.Scene, renderer: THREE.WebGLRenderer) => () => void;
}

/** the parts of a lit program's cost measured: each taken away from the scene's lighting in turn */
const PARTS: Part[] = [
  { name: 'as the scene lights it', without: () => () => {} },
  {
    name: 'without its point lights',
    without: (scene) => {
      const lit: THREE.PointLight[] = [];
      scene.traverseVisible((object) => {
        if ((object as THREE.PointLight).isPointLight) lit.push(object as THREE.PointLight);
      });
      for (const light of lit) light.visible = false;
      return () => {
        for (const light of lit) light.visible = true;
      };
    },
  },
  {
    name: 'without the environment map',
    without: (scene) => {
      const environment = scene.environment;
      scene.environment = null;
      return () => {
        scene.environment = environment;
      };
    },
  },
  {
    name: 'without shadows',
    without: (_scene, renderer) => {
      const enabled = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      return () => {
        renderer.shadowMap.enabled = enabled;
      };
    },
  },
  {
    name: 'without fog',
    without: (scene) => {
      const fog = scene.fog;
      scene.fog = null;
      return () => {
        scene.fog = fog;
      };
    },
  },
];
/** A part of a lit program's source taken away: its fragment shader as the scene lights it, edited (null where the
 *  shader hasn't that part: a commit before the village's lamps). */
interface SourcePart {
  name: string;
  edit: (fragment: string) => string | null;
}

/** the lamps' code in a lit shader (`core/lamps.ts`), read from the source itself (an A/B runs this module on commits
 *  without the lamps, where an import of them would fail): lit in the point lights' loop, its bound with them; or (as
 *  the lamps were first lit) in a block of their own after it, from its first line to its `#endif` */
const LAMPS_JOINED = 'i < NUM_POINT_LIGHTS + LAMPS_MOST;';
const LAMPS_BEGIN = '#if defined( RE_Direct )\n\t{\n\t\tvec3 seen = transpose( mat3( viewMatrix ) )';
/** the lamps' shadow read, and their shadow's four blended tests (`lampShadowAt`) and one */
const LAMP_SHADOW_READ = /lampLit = lampShadowAt\([^;]*\);/;
const LAMP_SHADOW_FOUR = /return 0\.25 \* \( lampLitNear[\s\S]*?\);/;
const LAMP_SHADOW_ONE = 'return lampLitNear( at, far );';

/** `fragment` without its lamps (their turns of the loop, or their block), or null where it has none. */
function withoutLamps(fragment: string): string | null {
  if (fragment.includes(LAMPS_JOINED)) return fragment.replace(LAMPS_JOINED, 'i < NUM_POINT_LIGHTS;');
  const from = fragment.indexOf(LAMPS_BEGIN);
  if (from < 0) return null;
  const to = fragment.indexOf('#endif', fragment.indexOf('lampShadowAt(', from));
  if (to < 0) throw new Error('lab: programs --cost: the lamps\' block has no end');
  return fragment.slice(0, from) + fragment.slice(to + '#endif'.length);
}

/** `fragment` made over by `edit` where it reads the lamps' shadows, else null. */
function withLamps(fragment: string, edit: (fragment: string) => string): string | null {
  return LAMP_SHADOW_READ.test(fragment) ? edit(fragment) : null;
}

/** the lamps' code in every lit shader taken out, their shadows unread, or read by one test (`npm run lab --
 *  programs --cost`: lit in a loop of their own, every lit shader took about a third longer to compile; their lighting
 *  call taken out of it, or their loop's bound one the compiler can't know, each left most of that) */
const SOURCE_PARTS: SourcePart[] = [
  { name: 'without the lamps', edit: withoutLamps },
  {
    name: 'its lamps unshadowed (their map never read)',
    edit: (fragment) => withLamps(fragment, (all) => all.replace(LAMP_SHADOW_READ, 'lampLit = 1.0;')),
  },
  {
    name: 'its lamps\' shadows by one test of four texels (not four)',
    edit: (fragment) => withLamps(fragment, (all) => all.replace(LAMP_SHADOW_FOUR, LAMP_SHADOW_ONE)),
  },
];

/** each part's compile timed this many times (the middle one taken) */
const PART_TIMES = 5;

/** A plain lit material's program as `scene` lights it (a ledger entry: `watchPrograms` records its GLSL). */
function plainLit(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): ProgramMade {
  const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.receiveShadow = true;
  try {
    renderer.compile(mesh, camera, scene);
    const program = (renderer.properties.get(material) as { currentProgram?: object }).currentProgram;
    const entry = programsMade.find((made) => made.program === program);
    if (!entry) throw new Error('lab: programs --cost: a plain lit material\'s program isn\'t in the ledger');
    return entry;
  } finally {
    mesh.geometry.dispose();
    material.dispose();
  }
}

/** What a plain lit material's compile costs as the scene lights it, and with each part of that taken away. */
export async function partsText(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<string> {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const variants: { name: string; entry: ProgramMade | null }[] = [];
  for (const part of PARTS) {
    const giveBack = part.without(scene, renderer);
    try {
      variants.push({ name: part.name, entry: plainLit(renderer, scene, camera) });
    } finally {
      giveBack();
    }
  }
  const lit = plainLit(renderer, scene, camera);
  for (const part of SOURCE_PARTS) {
    const fragment = part.edit(lit.fragment);
    variants.push({ name: part.name, entry: fragment === null ? null : { ...lit, fragment } });
  }
  const fastest = await fastestInTurns(gl, variants.map(({ entry }) => entry));
  const pieces = variants.map(({ name, entry }, i) => {
    if (!entry) return `none ${name}`;
    return `${(fastest[i] / 1000).toFixed(2)} s ${name} (fragment ${(entry.fragment.length / 1024).toFixed(0)} kB)`;
  });
  return `  a plain lit material, each its fastest of ${PART_TIMES} compiled in turns: ${pieces.join('; ')}`;
}

/**
 * Each of `entries` compiled `PART_TIMES` times, a round of one each in turn, each its fastest time (ms; none where an
 * entry is null). The machine's load comes and goes: timed one variant after another, a variant timed under another
 * session's work read slower than the whole it was taken from, and its fastest in turns reads what each costs alone.
 */
async function fastestInTurns(gl: WebGL2RenderingContext, entries: (ProgramMade | null)[]): Promise<number[]> {
  const salt = freshSalt();
  const fastest = entries.map(() => Infinity);
  for (let round = 0; round < PART_TIMES; round++) {
    for (const [i, entry] of entries.entries()) {
      if (!entry) continue;
      fastest[i] = Math.min(fastest[i], costWith(gl, entry, salt + round * entries.length + i));
      await realWait(BREATH_MS);
    }
  }
  return fastest;
}

/** The canary: the longest program compiled again with its own salt (the cache must answer) and with a new one (it
 *  must take as long as it did). */
export function cacheCanary(gl: WebGL2RenderingContext, measured: ProgramCost[]): { text: string; problems: string[] } {
  const longest = [...measured].sort((a, b) => b.ms - a.ms)[0];
  if (!longest) return { text: 'the canary: no program to compile', problems: ['programs --cost: nothing measured'] };
  const salt = freshSalt();
  const cold = costWith(gl, longest.entry, salt);
  const cached = costWith(gl, longest.entry, salt);
  const afresh = costWith(gl, longest.entry, salt + 1);
  const problems: string[] = [];
  if (!(cached < cold * CACHED_SHARE)) {
    problems.push(`programs --cost: the same salt compiled again took ${cached.toFixed(0)} ms of ${cold.toFixed(0)}: `
      + 'no cache answered, so the measure can\'t tell a compile from a cache\'s answer');
  }
  if (!(afresh > cold * AFRESH_SHARE)) {
    problems.push(`programs --cost: a new salt took ${afresh.toFixed(0)} ms of ${cold.toFixed(0)}: a cache answered `
      + 'the salted source, so the costs measured a cache');
  }
  const caught = problems.length ? 'missed' : 'caught';
  const text = `  the canary, the longest compiled again: ${cold.toFixed(0)} ms salted anew, `
    + `${cached.toFixed(0)} ms with the same salt (the cache's answer), `
    + `${afresh.toFixed(0)} ms with another (${caught})`;
  return { text, problems };
}
