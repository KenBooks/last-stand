// The engine's pipelines that share a compile asked for one after another. A browser compiles a shader module's
// stage whole for its entry point and constants, and a pipeline of the same stage asked for after it is answered from
// what it kept in a millisecond or two (`lab programs --cost`: the lit shader's 24 pipelines 6.7 s salted one by one,
// 0.8 s sharing one module). Asked for all at once, as the engine asks under a loading screen, none had been kept
// yet and each compiled the whole stage on the GPU's process's threads: with a game's looks joined into one module
// (Bulwark's `join_shaders`) a first visit's compiles were 102 s of those threads against 82 s a module a look, the
// lobby shown 4 s later (`npm run stalls -- --scenario boot`). So the first pipeline of a stage is asked for at once
// and every other of it after that one is made; stages apart still compile side by side.

/** A pipeline's stage, as this reads its descriptor. */
interface Stage { module?: object; entryPoint?: string; constants?: Record<string, number> }

/** Each module's stages being compiled or compiled, by entry point and constants: the first pipeline asked for of
 *  each, settled (made or refused) once it's done. */
const firsts = new WeakMap<object, Map<string, Promise<unknown>>>();

/** A stage's key within its module: its entry point and constants. */
function keyOf(stage: Stage): string {
  const constants = Object.entries(stage.constants ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${stage.entryPoint ?? ''} ${JSON.stringify(constants)}`;
}

/**
 * `ask` (a pipeline's compile, of `fragment`'s stage) asked for once the first pipeline asked for of the same stage
 * is done, or at once where it's the first (and so where it has no fragment stage: a shadow's, compiled in a breath).
 */
export function afterItsFirst<T>(fragment: Stage | undefined, ask: () => Promise<T>): Promise<T> {
  if (!fragment?.module) return ask();
  let ofModule = firsts.get(fragment.module);
  if (!ofModule) {
    ofModule = new Map();
    firsts.set(fragment.module, ofModule);
  }
  const key = keyOf(fragment);
  const first = ofModule.get(key);
  if (first) return first.then(ask, ask);
  const asked = ask();
  ofModule.set(key, asked);
  return asked;
}
