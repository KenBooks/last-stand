// The saves service as its container runs it (saves.mjs; the tests start it on a port of their own).
import { start } from './saves.mjs';

await start();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
