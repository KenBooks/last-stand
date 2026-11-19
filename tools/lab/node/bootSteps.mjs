// A boot's time step by step (the server ready, the page loaded, its loading screen gone, its warm-ups done, the lab
// installed), so "booted the ranger (43.2 s)" says where those seconds went.

/** One boot's steps as they end, each timed from the step before. */
export class BootSteps {
  constructor() {
    this.started = Date.now();
    this.last = this.started;
    /** each step's name and its seconds */
    this.steps = [];
  }

  /** The step `name` ended now. */
  done(name) {
    const now = Date.now();
    this.steps.push({ name, seconds: (now - this.last) / 1000 });
    this.last = now;
  }

  /** The steps as a line: `the server 0.1, the page 2.3, ...`; '' with none. */
  text() {
    return this.steps.map((step) => `${step.name} ${step.seconds.toFixed(1)}`).join(', ');
  }
}
