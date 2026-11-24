// A steady tick the browser doesn't slow in a hidden page (`backgroundTick.ts`): a dedicated worker's timers keep
// their time there, where the page's own are run once a second, and once a minute after five minutes hidden.
// Told the tick's length (ms), it posts a message every tick from then on.
let timer: ReturnType<typeof setInterval> | undefined;
self.onmessage = (event: MessageEvent<number>): void => {
  clearInterval(timer);
  timer = setInterval(() => self.postMessage(0), event.data);
};
