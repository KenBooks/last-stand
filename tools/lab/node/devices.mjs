// The devices players have reported a slow game on, played back on this machine (`perf --device`). No browser can slow
// its GPU (DevTools slows the CPU alone) and the shared PC's GPU must not be clocked down, so a device's GPU is played
// by this one drawing more pixels: the device's screen at `gpu` times its pixels makes this GPU's work a frame what
// the device's is at its own. A phone's or a laptop's integrated GPU is held up by its pixels (fill and bandwidth),
// so its time a frame grows with them; what doesn't grow with them (the shadow maps, the vertices) is played at the
// device's own cost, cheaper than its, which the factor makes up for on the scene it was set on. Each factor is set
// so the GPU's time read here is what the device's own reports read, on the owner's RTX 4070 Ti: another GPU needs
// its own. Every device here is held up by its GPU (its reports: the page's work a third or less of the frame),
// so its frame is the GPU's; the CPU is left at full speed, as a slowed one feeds the GPU late and its timer
// counts the wait (the phone's GPU read 24 ms with the CPU 1.5 times slower).

/**
 * Each device: what it is, its screen as its reports give it (css px and pixel ratio), how many times this GPU's
 * work it does a frame (`gpu`), the page's work a frame its reports read (`pageWork`), the quality its Auto settles
 * on, and the reports its factors were set on.
 */
export const DEVICES = {
  phone: {
    what: 'the owner\'s phone (Galaxy S25 Edge, Adreno 830), the installed app, cool',
    screen: { width: 832, height: 384, ratio: 3.75 },
    gpu: 6,
    pageWork: '6 to 11 ms',
    quality: 'medium',
    setOn: 'trace 9JA7-BSSS (main 0e56078, Medium, forest lobby: 65 to 83 fps on its 120 Hz screen, 12 to 15 ms) and '
      + 'Z8GY-RHSN (0699bc6, Low: 76 to 85 fps)',
  },
  'phone-hot': {
    what: 'the same phone after minutes of play, its GPU slowed down as it heats up',
    screen: { width: 832, height: 384, ratio: 3.75 },
    gpu: 23,
    pageWork: '6 to 11 ms',
    quality: 'low',
    setOn: 'trace 6QSC-9SV5 (799853e, forest lobby: 74 to 84 fps on Medium, then 24 to 26 on Low from its 15th s '
      + 'on, a cheaper level slower: the phone, not the game; 17 read 34 fps)',
  },
  laptop: {
    what: 'a tester\'s laptop (AMD Radeon integrated graphics 0x15E7, Ryzen 5000) at 1440x900 and 200%',
    screen: { width: 1440, height: 731, ratio: 2 },
    gpu: 25,
    pageWork: '8 to 16 ms',
    quality: 'low',
    setOn: 'traces YR6T-PFQH and QCG4-V0ZJ (be4ba92, 57787c6, Low, forest lobby: the GPU 35 and 47 ms a frame)',
  },
};

/** The screen a device's GPU is played on here: its own, at `gpu` times its pixels. */
export function screenPlaying(device) {
  const { width, height, ratio } = device.screen;
  return { width, height, ratio: Number((ratio * Math.sqrt(device.gpu)).toFixed(2)) };
}
