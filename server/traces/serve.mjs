// The traces service as its container runs it (traces.mjs; the tests start it on a port of their own).
import { start } from './traces.mjs';

await start();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
