// The previews service as its container runs it (previews.mjs; the tests start it on a port of their own).
import { start } from './previews.mjs';

await start();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
