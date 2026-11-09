// A focused co-op regression using the permanent lab's paired clocks and delayed transport.
import { Pair, callPage } from './coop.mjs';

/** Play Training grounds as host and guest with deliberately different unlocks. */
export async function runTrainingCoop(side, options) {
  const guest = await side.openPartner(side.heroClass);
  const pages = [side.page, guest];
  const problems = [];
  const lines = [];
  const checkPages = async (step) => {
    const reports = await Promise.all(pages.map((page, index) => (
      callPage(page, 'coopTraining', { step, host: index === 0 })
    )));
    reports.forEach((report, index) => {
      problems.push(...report.problems.map((problem) => `${index === 0 ? 'host' : 'guest'}: ${problem}`));
    });
  };
  try {
    const frameMs = await side.page.evaluate(() => window.__labClock.frame);
    const link = { ping: 100, jitter: 20 };
    const pair = new Pair({ pages, frameMs, ...link });
    await checkPages('prepare');
    const code = await callPage(side.page, 'coopOpen', { role: 'host', ...link });
    await callPage(guest, 'coopOpen', { role: 'guest', code, ...link });
    await pair.until((host, other) => host.partners === 1 && other.status === 'joined', 600, 'training room');
    await pair.run(30);
    await checkPages('lobby');
    await callPage(side.page, 'coopStart');
    await pair.until((host, other) => host.mode === 'run' && other.mode === 'run', 600, 'training starts');
    await checkPages('fight');
    if (options.canary) await checkPages('canary');
    const spawned = await callPage(side.page, 'coopTraining', { step: 'spawn', host: true });
    problems.push(...spawned.problems);
    await pair.run(120);
    await checkPages('fight');
    await Promise.all(pages.map((page) => callPage(page, 'coopClearWave')));
    await pair.until((host, other) => host.phase === 'cleared' && other.phase === 'cleared', 600, 'training clear');
    await checkPages('repeat');
    await pair.run(40);
    await checkPages('fight');
    await Promise.all(pages.map((page) => callPage(page, 'coopClearWave')));
    await pair.until((host, other) => host.phase === 'cleared' && other.phase === 'cleared', 600, 'repeat clear');
    await checkPages('leave');
    await pair.until((host, other) => host.mode === 'menu' && other.mode === 'menu', 600, 'training return');
    await checkPages('finished');
    lines.push('100 ms link: guest with wave 1 follows host training at reached wave 4');
    lines.push('both peers: no damage, loot, score or profile changes; repeat and leave checked');
    return { text: lines.join('\n'), problems };
  } finally {
    await side.closePartner();
  }
}
