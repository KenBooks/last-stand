// `lab ui`'s `perfGraph` state (`../uiKit.ts` `Steps`): the overlay's frame rate and graph scale over its first 5 s
// (`../uiPerfGraph.ts`).
import { closePerfGraph, openPerfGraph, PERF_GRAPH_CANARY, perfGraphChecked } from '../uiPerfGraph';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 360,
  inRun: true,
  open: openPerfGraph,
  close: closePerfGraph,
  check: (canary, lab) => perfGraphChecked(lab, canary),
  canary: caught(PERF_GRAPH_CANARY),
};
export default STATE;
