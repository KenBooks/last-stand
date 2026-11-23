// A timer the browser doesn't slow in a hidden page (`hiddenBoot.ts`): a worker's timers keep their time there.
// Told `{ id, ms }`, it answers `id` once `ms` have passed.
self.onmessage = (event: MessageEvent<{ id: number; ms: number }>): void => {
  const { id, ms } = event.data;
  setTimeout(() => self.postMessage(id), ms);
};
