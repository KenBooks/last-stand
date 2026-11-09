// A fire as a fluid, simulated once: a small grid of rising air whose flames are carried and curled by it, its frames
// made into a loop every fire then plays (world/fire.ts ray-marches them). The physics is after Fire Pro's
// (https://github.com/dgreenheck/threejs-fire-pro, MIT, Daniel Greenheck): buoyancy, vorticity confinement, a
// pressure projection and MacCormack transport of a flame's lifetime, on a velocity grid coarser than its scalars.
// There it runs on the GPU each frame, by WebGPU alone: here it runs in a worker once and is kept, so a frame pays for
// a texture's lookups, on any renderer. Noise is its own and seeded, so every boot bakes the same fire.

/** the scalars' grid, and how many of its cells a velocity cell is a side */
export const BAKE = { nx: 60, ny: 108, nz: 60, velocityEvery: 3 };
/** the loop's frames, how many sim steps a frame is (at 60 a second), and how many frames its ends are faded across */
export const LOOP = { frames: 60, stepsEach: 2, faded: 20 };
/** the grid's cells kept, from and to (to not kept), on each axis: where the flames go, and two empty cells round them
 *  (the grid's whole was kept once, 23 MB, 3% of it ever flame; `npm run fire-bake` says what falls outside) */
export const KEPT = { x: [5, 50], y: [0, 103], z: [7, 53] } as const;
/** the kept box's size in cells */
export const KEPT_SIZE = { x: KEPT.x[1] - KEPT.x[0], y: KEPT.y[1] - KEPT.y[0], z: KEPT.z[1] - KEPT.z[0] };
/** the flames' texture's slots, side by side: the two frames a fire draws now (frame f in slot f mod 2), each its kept
 *  box, its z the texture's depth */
export const TILES = { across: 2, down: 1 };
/** the grid's size in the fire it's made for (m): half of it across, and its height; and how high its flames stand */
export const DOMAIN = { half: 0.667, high: 2.4, flames: 1.4, bed: 0.5 };

/** a cell's side (m), the step (s), and the steps run before the first frame kept */
const DX = (DOMAIN.half * 2) / BAKE.nx;
const DT = 1 / 60;
const WARM_STEPS = 90;
/** how many cells a flame can be carried in a step, at the most, and a little over */
const FLAME_REACHES_A_STEP = 3;
/** how much of MacCormack's correction a flame's carried with (a half is all of it) */
const CORRECTED = 0.35;
/** how much of the grid's height the bed's gusts reach */
const STIRRED_SHARE = 0.4;

/** What the fire is made of, passed in by `lab fire-bake`, where a value can be tried in seconds. */
export interface FireTuning {
  /** how long a flame burns (s) */
  lifespan: number;
  /** how fast a flame lifts the air it's in (m/s² at full) */
  buoyancy: number;
  /** the air's drag (a share a second) */
  damping: number;
  /** how hard vortices are kept up: what curls a flame into licks */
  vorticity: number;
  /** how fast burning gas swells (a share of its volume a second): what spreads it into sheets */
  expansion: number;
  /** how far out the bed is fed (a share of its radius), and how high (m) */
  bedOut: number;
  feedHigh: number;
  /** the feed's patches: their size (m), how fast they change (a second), and how much of it stays dark */
  patch: number;
  patchSpeed: number;
  feedAbove: number;
  /** how hard the air low over the bed is stirred (m/s²), the size of its gusts (m) and how fast they change (a second):
   *  drawn in evenly over an even bed, the flames' foot stood as one smooth tent */
  stir: number;
  gust: number;
  gustSpeed: number;
  /** rounds of the pressure's solve a step */
  pressureRounds: number;
}

export const FIRE: FireTuning = {
  lifespan: 0.72,
  buoyancy: 18,
  damping: 0.1,
  vorticity: 5,
  expansion: 0.1,
  bedOut: 0.55,
  feedHigh: 0.25,
  patch: 0.05,
  patchSpeed: 1.2,
  feedAbove: 0.2,
  stir: 2.5,
  gust: 0.18,
  gustSpeed: 3,
  pressureRounds: 12,
};

/** How burning gas looks, the ray-march's (world/fire.ts) and `lab fire-bake`'s: how thick a metre of it is at full, how
 *  bright, its glow against its lifetime (full from this share of its life on), and a blackbody's colour and radiance at
 *  a flame's life (1 just lit), linear, by its temperature's curve from about 1000 K as it dies to 2600 K lit. */
export const FLAME_LOOK = {
  thickPerMetre: 24,
  glow: 1.5,
  glowFullLife: 0.2,
  /** the flame's lives between which it comes to hold back what's behind it: gas any cooler only adds its light (held back
   *  as much as it gives, by day a flame's edge was a dark brown smear and its body an opaque tan, a review's worst) */
  holdsFrom: 0.15,
  holdsFully: 0.5,
  /** the strands: the loop read again finer, how many times finer across and up, and how much of a flame's life they
   *  take (the grid's cells, 2 cm across, smooth to soft folds what's close to the camera) */
  strandsAcross: 2.7,
  strandsUp: 1,
  strandsTake: 0.85,
  /** the height (a share of the box's) under which it fades into its bed: cut there, its foot was a hard hem */
  footFade: 0.05,
  /** the share of the box's radius past which it fades out, where gusts laid it against the grid's wall in a straight edge */
  sideFade: 0.7,
  /** the same at its foot, up to `footNarrows` of the box's height: spread along the floor, it stood in a skirt with a rim */
  sideFadeFoot: 0.32,
  footNarrows: 0.22,
  blackbody: [
    [0, 1, 0.12, 0.002, 0.02],
    [0.25, 1, 0.2, 0.012, 0.2],
    [0.5, 1, 0.33, 0.045, 0.7],
    [0.75, 1, 0.44, 0.07, 1.7],
    [1, 1, 0.64, 0.2, 3.2],
  ] as [number, number, number, number, number][],
};

/** Value noise in three dimensions, between 0 and 1, seeded: where the bed burns as time passes. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const ease = (f: number): number => f * f * (3 - 2 * f);
  const fx = ease(x - ix);
  const fy = ease(y - iy);
  const fz = ease(z - iz);
  const at = (dx: number, dy: number, dz: number): number => {
    let h = Math.imul(ix + dx, 374761393) ^ Math.imul(iy + dy, 668265263) ^ Math.imul(iz + dz, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const row = (dy: number, dz: number): number => at(0, dy, dz) + (at(1, dy, dz) - at(0, dy, dz)) * fx;
  const plane = (dz: number): number => row(0, dz) + (row(1, dz) - row(0, dz)) * fy;
  return plane(0) + (plane(1) - plane(0)) * fz;
}

/** A grid's sizes and how to read a place in it by trilinear interpolation. */
class Grid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly stride: number;

  constructor(nx: number, ny: number, nz: number) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.stride = nx * ny;
  }

  field(): Float32Array {
    return new Float32Array(this.nx * this.ny * this.nz);
  }

  /** `field` at (x, y, z) in cells, a cell's value at its middle, held at the grid's edges. */
  read(field: Float32Array, x: number, y: number, z: number): number {
    const { nx, ny, nz, stride } = this;
    const cx = Math.min(nx - 1.001, Math.max(0, x));
    const cy = Math.min(ny - 1.001, Math.max(0, y));
    const cz = Math.min(nz - 1.001, Math.max(0, z));
    const ix = cx | 0;
    const iy = cy | 0;
    const iz = cz | 0;
    const fx = cx - ix;
    const fy = cy - iy;
    const fz = cz - iz;
    const i = ix + iy * nx + iz * stride;
    const a = field[i] + (field[i + 1] - field[i]) * fx;
    const b = field[i + nx] + (field[i + nx + 1] - field[i + nx]) * fx;
    const c = field[i + stride] + (field[i + stride + 1] - field[i + stride]) * fx;
    const d = field[i + stride + nx] + (field[i + stride + nx + 1] - field[i + stride + nx]) * fx;
    const near = a + (b - a) * fy;
    const far = c + (d - c) * fy;
    return near + (far - near) * fz;
  }
}

/** The fluid's state: the air on its coarse grid, in m/s, and the flames' lifetime on the fine one (1 just lit). */
class Fluid {
  readonly air = new Grid(BAKE.nx / BAKE.velocityEvery, BAKE.ny / BAKE.velocityEvery, BAKE.nz / BAKE.velocityEvery);
  readonly fine = new Grid(BAKE.nx, BAKE.ny, BAKE.nz);
  vx = this.air.field();
  vy = this.air.field();
  vz = this.air.field();
  private readonly nextX = this.air.field();
  private readonly nextY = this.air.field();
  private readonly nextZ = this.air.field();
  private readonly pressure = this.air.field();
  private readonly divergence = this.air.field();
  private readonly curlX = this.air.field();
  private readonly curlY = this.air.field();
  private readonly curlZ = this.air.field();
  life = this.fine.field();
  private readonly forth = this.fine.field();
  private readonly madeLife = this.fine.field();
  private readonly stepX = this.fine.field();
  private readonly stepY = this.fine.field();
  private readonly stepZ = this.fine.field();
  private readonly flameInAir = this.air.field();
  private time = 0;
  private readonly fire: FireTuning;

  constructor(fire: FireTuning) {
    this.fire = fire;
  }

  /** One step of the fire. */
  step(): void {
    this.feed();
    this.moveAir();
    this.lift();
    this.keepVortices();
    this.project();
    this.moveFlames();
    this.time += DT;
  }

  /** The bed lights its patches, each coming and going. */
  private feed(): void {
    const { nx, nz, stride } = this.fine;
    const { bedOut, patch: size, patchSpeed, feedAbove, feedHigh } = this.fire;
    const scale = DX / size;
    const high = Math.round(feedHigh / DX);
    const out = (DOMAIN.bed * bedOut) / DX;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const dx = x + 0.5 - nx / 2;
        const dz = z + 0.5 - nz / 2;
        const from = Math.hypot(dx, dz) / out;
        if (from >= 1) continue;
        const patch = noise3(x * scale, this.time * patchSpeed, z * scale);
        if (patch < feedAbove + from * from * 0.3) continue;
        const here = Math.ceil(high * (1 - from * from));
        for (let y = 0; y < here; y++) this.life[x + y * nx + z * stride] = 1;
      }
    }
  }

  /** Flames lift the air they're in, and the air drags. */
  private lift(): void {
    const { nx, ny, nz, stride } = this.air;
    const every = BAKE.velocityEvery;
    const keep = Math.exp(-this.fire.damping * DT);
    const lift = this.fire.buoyancy * DT;
    const stirredUpTo = ny * STIRRED_SHARE;
    const stir = this.fire.stir * DT;
    const gustScale = (DX * every) / this.fire.gust;
    const { gustSpeed } = this.fire;
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = x + y * nx + z * stride;
          const flame = this.fine.read(this.life, (x + 0.5) * every - 0.5, (y + 0.5) * every - 0.5, (z + 0.5) * every - 0.5);
          this.flameInAir[i] = flame;
          if (y < stirredUpTo) {
            const low = 1 - y / stirredUpTo;
            const gx = x * gustScale;
            const gz = z * gustScale;
            this.vx[i] += (noise3(gx, this.time * gustSpeed, gz) - 0.5) * stir * low;
            this.vz[i] += (noise3(gx + 37, this.time * gustSpeed, gz + 11) - 0.5) * stir * low;
          }
          this.vy[i] = (this.vy[i] + lift * flame) * keep;
          this.vx[i] *= keep;
          this.vz[i] *= keep;
        }
      }
    }
  }

  /** Vortices kept up, as a coarse grid and its numerical loss would lose them: what curls a flame into licks. */
  private keepVortices(): void {
    const { nx, ny, nz, stride } = this.air;
    const h = DX * BAKE.velocityEvery;
    const { vx, vy, vz, curlX, curlY, curlZ } = this;
    for (let z = 1; z < nz - 1; z++) {
      for (let y = 1; y < ny - 1; y++) {
        for (let x = 1; x < nx - 1; x++) {
          const i = x + y * nx + z * stride;
          curlX[i] = ((vz[i + nx] - vz[i - nx]) - (vy[i + stride] - vy[i - stride])) / (2 * h);
          curlY[i] = ((vx[i + stride] - vx[i - stride]) - (vz[i + 1] - vz[i - 1])) / (2 * h);
          curlZ[i] = ((vy[i + 1] - vy[i - 1]) - (vx[i + nx] - vx[i - nx])) / (2 * h);
        }
      }
    }
    const size = (i: number): number => Math.hypot(curlX[i], curlY[i], curlZ[i]);
    for (let z = 2; z < nz - 2; z++) {
      for (let y = 2; y < ny - 2; y++) {
        for (let x = 2; x < nx - 2; x++) {
          const i = x + y * nx + z * stride;
          const gx = size(i + 1) - size(i - 1);
          const gy = size(i + nx) - size(i - nx);
          const gz = size(i + stride) - size(i - stride);
          const long = Math.hypot(gx, gy, gz) + 1e-5;
          const k = (this.fire.vorticity * h * DT) / long;
          vx[i] += k * (gy * curlZ[i] - gz * curlY[i]);
          vy[i] += k * (gz * curlX[i] - gx * curlZ[i]);
          vz[i] += k * (gx * curlY[i] - gy * curlX[i]);
        }
      }
    }
  }

  /** The air made to neither gather nor thin: the pressure that does so solved in rounds of red and black cells, the
   *  floor and sides shut, the top open. */
  private project(): void {
    const { nx, ny, nz, stride } = this.air;
    const { vx, vy, vz, pressure, divergence, flameInAir } = this;
    const swell = this.fire.expansion * DX * BAKE.velocityEvery;
    for (let z = 1; z < nz - 1; z++) {
      for (let y = 1; y < ny - 1; y++) {
        for (let x = 1; x < nx - 1; x++) {
          const i = x + y * nx + z * stride;
          const gathers = vx[i + 1] - vx[i - 1] + vy[i + nx] - vy[i - nx] + vz[i + stride] - vz[i - stride];
          divergence[i] = 0.5 * gathers - swell * flameInAir[i];
        }
      }
    }
    for (let round = 0; round < this.fire.pressureRounds * 2; round++) {
      const colour = round & 1;
      for (let z = 1; z < nz - 1; z++) {
        for (let y = 1; y < ny - 1; y++) {
          const start = 1 + ((y + z + colour) & 1);
          for (let x = start; x < nx - 1; x += 2) {
            const i = x + y * nx + z * stride;
            pressure[i] = (pressure[i - 1] + pressure[i + 1] + pressure[i - nx] + pressure[i + nx]
              + pressure[i - stride] + pressure[i + stride] - divergence[i]) / 6;
          }
        }
      }
    }
    for (let z = 1; z < nz - 1; z++) {
      for (let y = 1; y < ny - 1; y++) {
        for (let x = 1; x < nx - 1; x++) {
          const i = x + y * nx + z * stride;
          vx[i] -= 0.5 * (pressure[i + 1] - pressure[i - 1]);
          vy[i] -= 0.5 * (pressure[i + nx] - pressure[i - nx]);
          vz[i] -= 0.5 * (pressure[i + stride] - pressure[i - stride]);
        }
      }
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) vy[x + z * stride] = 0;
  }

  /** The air carried along by itself. */
  private moveAir(): void {
    const grid = this.air;
    const { nx, ny, nz, stride } = grid;
    const cells = DT / (DX * BAKE.velocityEvery);
    const { vx, vy, vz, nextX, nextY, nextZ } = this;
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = x + y * nx + z * stride;
          const fromX = x - vx[i] * cells;
          const fromY = y - vy[i] * cells;
          const fromZ = z - vz[i] * cells;
          nextX[i] = grid.read(vx, fromX, fromY, fromZ);
          nextY[i] = grid.read(vy, fromX, fromY, fromZ);
          nextZ[i] = grid.read(vz, fromX, fromY, fromZ);
        }
      }
    }
    vx.set(nextX);
    vy.set(nextY);
    vz.set(nextZ);
  }

  /** The box round what burns, a few cells over: the rest of the grid is air with nothing to carry, most of a step. */
  private burningBox(): [number, number, number, number, number, number] {
    const { nx, ny, nz, stride } = this.fine;
    let [x0, y0, z0, x1, y1, z1] = [nx, ny, nz, 0, 0, 0];
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        const row = y * nx + z * stride;
        for (let x = 0; x < nx; x++) {
          if (this.life[x + row] <= 0) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          z0 = Math.min(z0, z);
          z1 = Math.max(z1, z);
        }
      }
    }
    const round = FLAME_REACHES_A_STEP;
    return [Math.max(1, x0 - round), Math.max(1, y0 - round), Math.max(1, z0 - round),
      Math.min(nx - 2, x1 + round), Math.min(ny - 2, y1 + round), Math.min(nz - 2, z1 + round)];
  }

  /** The flames carried by the air, by MacCormack's steps there and back (their edges stay sharp, what a semi-Lagrangian
   *  step alone blurs into a glow), burning down as they go. */
  private moveFlames(): void {
    const { nx, ny, nz, stride } = this.fine;
    const fine = this.fine;
    const air = this.air;
    const every = BAKE.velocityEvery;
    const cells = DT / DX;
    const { vx, vy, vz, life, forth, madeLife, stepX, stepY, stepZ } = this;
    const burned = DT / this.fire.lifespan;
    const [x0, y0, z0, x1, y1, z1] = this.burningBox();
    madeLife.fill(0);
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = x + y * nx + z * stride;
          const ax = (x + 0.5) / every - 0.5;
          const ay = (y + 0.5) / every - 0.5;
          const az = (z + 0.5) / every - 0.5;
          const ux = air.read(vx, ax, ay, az) * cells;
          const uy = air.read(vy, ax, ay, az) * cells;
          const uz = air.read(vz, ax, ay, az) * cells;
          forth[i] = fine.read(life, x - ux, y - uy, z - uz);
          stepX[i] = ux;
          stepY[i] = uy;
          stepZ[i] = uz;
        }
      }
    }
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = x + y * nx + z * stride;
          const came = forth[i];
          if (came <= 0 && life[i] <= 0) continue;
          const ux = stepX[i];
          const uy = stepY[i];
          const uz = stepZ[i];
          // (the error of going there and back taken off, held within what's round where it came from; some of it left, as
          // all of it taken off drew thin dark scribbles through the flames)
          const again = fine.read(forth, x + ux, y + uy, z + uz);
          const at = Math.min(nx - 2, Math.max(1, Math.round(x - ux)))
            + Math.min(ny - 2, Math.max(1, Math.round(y - uy))) * nx
            + Math.min(nz - 2, Math.max(1, Math.round(z - uz))) * stride;
          let low = life[at];
          let high = low;
          for (const near of [life[at - 1], life[at + 1], life[at - nx], life[at + nx], life[at - stride], life[at + stride]]) {
            if (near < low) low = near;
            if (near > high) high = near;
          }
          const made = Math.min(high, Math.max(low, came + CORRECTED * (life[i] - again)));
          madeLife[i] = Math.max(0, made - burned);
        }
      }
    }
    life.set(madeLife);
  }
}

/** The loop as it's kept: each frame's kept box (`KEPT`, x fastest, then y, then z) as runs (`encodeFrame`), one after
 *  another in `data`, frame f from `starts[f]` to `starts[f + 1]`; and the share of its flame that fell outside the
 *  box. */
export interface BakedFlames {
  data: Uint8Array;
  starts: Uint32Array;
  outside: number;
}

/** the cells of a frame's kept box */
export const FRAME_CELLS = KEPT_SIZE.x * KEPT_SIZE.y * KEPT_SIZE.z;
/** a life the ray-march never draws (`flameLife` returns none at 0.004 and under: a byte of 1 or 0), stored as none */
const UNSEEN = 1;
/** the longest run of empty cells one pair of bytes says */
const LONGEST_RUN = 255;

/** Whether a grid cell is in the kept box. */
const kept = (x: number, y: number, z: number): boolean => x >= KEPT.x[0] && x < KEPT.x[1]
  && y >= KEPT.y[0] && y < KEPT.y[1] && z >= KEPT.z[0] && z < KEPT.z[1];

/** A frame's box as bytes: a 0 and how many empty cells follow it (as most of the box is air round the flames: 94%),
 *  else a cell's life itself (never 0 or 1). */
function encodeFrame(cells: Uint8Array, into: number[]): void {
  let run = 0;
  const endRun = (): void => {
    if (run === 0) return;
    into.push(0, run);
    run = 0;
  };
  for (const value of cells) {
    if (value > UNSEEN) {
      endRun();
      into.push(value);
      continue;
    }
    run++;
    if (run === LONGEST_RUN) endRun();
  }
  endRun();
}

/** Frame `frame`'s kept box into `out` (`FRAME_CELLS` long), as `encodeFrame` wrote it. */
export function decodeFrame(baked: BakedFlames, frame: number, out: Uint8Array): Uint8Array {
  const { data, starts } = baked;
  const end = starts[frame + 1];
  let at = 0;
  for (let read = starts[frame]; read < end; read++) {
    const value = data[read];
    if (value !== 0) {
      out[at++] = value;
      continue;
    }
    const run = data[++read];
    out.fill(0, at, at + run);
    at += run;
  }
  if (at !== FRAME_CELLS) throw new Error(`fire: frame ${frame} decoded to ${at} cells, not ${FRAME_CELLS}`);
  return out;
}

/** What the fire may take (KB), as the game's own download is about 3 MB (the loop whole on the GPU was 23 MB, and
 *  passed two reviews unmeasured): its loop as it's kept in memory and across visits, and its frames on the GPU.
 *  `npm run fire-bake` and `lab:test` hold it to them. */
export const BUDGET_KB = { kept: 1200, gpu: 640 };

/** The loop's sizes (KB): kept, and its two slots on the GPU. */
export function loopSizesKb(baked: BakedFlames): { kept: number; gpu: number } {
  return {
    kept: (baked.data.length + baked.starts.byteLength) / 1024,
    gpu: (FRAME_CELLS * TILES.across * TILES.down) / 1024,
  };
}

/** A grid cell's life (a byte) in a frame's box as `decodeFrame` gave it, 0 outside the box. */
export function keptCell(cells: Uint8Array, x: number, y: number, z: number): number {
  if (!kept(x, y, z)) return 0;
  const across = x - KEPT.x[0];
  const up = y - KEPT.y[0];
  const deep = z - KEPT.z[0];
  return cells[across + (up + deep * KEPT_SIZE.y) * KEPT_SIZE.x];
}

/** The loop's frames, simulated and kept as `BakedFlames`. */
export function bakeFlames(fire: FireTuning = FIRE): BakedFlames {
  const fluid = new Fluid(fire);
  for (let step = 0; step < WARM_STEPS; step++) fluid.step();
  const cells = BAKE.nx * BAKE.ny * BAKE.nz;
  const all = LOOP.frames + LOOP.faded;
  const frames = new Uint8Array(cells * all);
  for (let frame = 0; frame < all; frame++) {
    for (let step = 0; step < LOOP.stepsEach; step++) fluid.step();
    const start = frame * cells;
    for (let i = 0; i < cells; i++) frames[start + i] = Math.round(fluid.life[i] * 255);
  }
  const box = new Uint8Array(FRAME_CELLS);
  const runs: number[] = [];
  const starts = new Uint32Array(LOOP.frames + 1);
  let total = 0;
  let lost = 0;
  for (let frame = 0; frame < LOOP.frames; frame++) {
    // (its first frames faded from the frames that follow its last: the loop closes on no jump)
    const late = frame < LOOP.faded ? (frame + LOOP.frames) * cells : -1;
    const share = frame / LOOP.faded;
    let at = 0;
    for (let z = 0; z < BAKE.nz; z++) {
      for (let y = 0; y < BAKE.ny; y++) {
        for (let x = 0; x < BAKE.nx; x++) {
          const i = x + y * BAKE.nx + z * BAKE.nx * BAKE.ny;
          const here = frames[frame * cells + i];
          const value = Math.round(late < 0 ? here : frames[late + i] * (1 - share) + here * share);
          total += value;
          if (!kept(x, y, z)) {
            lost += value;
            continue;
          }
          box[at++] = value;
        }
      }
    }
    starts[frame] = runs.length;
    encodeFrame(box, runs);
  }
  starts[LOOP.frames] = runs.length;
  return { data: Uint8Array.from(runs), starts, outside: total > 0 ? lost / total : 0 };
}
