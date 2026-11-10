// A hero's cloth dyed in a player's colour (data/heroColours.ts): the colour of each material a model names, and of
// its rim light, set again; nothing else. A colour is a material's value, never a variant of its shader, so a dye
// compiles nothing (root AGENTS.md: shaders compile at load), and on WebGPU the merged meshes read it live off their
// base material (`standInFor` in drawAsOne.ts).
import * as THREE from 'three';
import { heroColour, type HeroColourId } from '../../data/heroColours';
import type { KitLooks } from '../../core/materials';
import { looksOn } from './palette';

interface Dyed {
  material: THREE.Material & { color: THREE.Color };
  /** its colour and its rim's as built */
  color: THREE.Color;
  rim: THREE.Color | null;
  rimBuilt: THREE.Color | null;
}

const _hsl = { h: 0, s: 0, l: 0 };

export class Dye {
  private readonly dyed: Dyed[] = [];
  /** the main cloth's colour as built (HSL): every dyed colour keeps its shade against it */
  private readonly main = { h: 0, s: 0, l: 0 };

  /** `native`: the colour the hero is built in (that colour leaves him as he is) */
  constructor(readonly native: HeroColourId) {}

  /** Cloth dyed with the rest, the main cloth first. */
  cloth(...materials: THREE.Material[]): this {
    for (const material of materials) {
      const m = material as Dyed['material'];
      const rim = (material as { kitLooks?: KitLooks }).kitLooks?.rim.value ?? null;
      if (!this.dyed.length) m.color.getHSL(this.main, THREE.SRGBColorSpace);
      this.dyed.push({ material: m, color: m.color.clone(), rim, rimBuilt: rim?.clone() ?? null });
    }
    return this;
  }

  /** The main cloth's colour as it's drawn now (hex, sRGB): what a harness reads to see a dye shown. */
  get shown(): number {
    return this.dyed[0]?.material.color.getHex() ?? 0;
  }

  /**
   * `built` as the colour `id` dyes it into `out`: the colour's own hue, and its saturation and lightness by `built`'s
   * against the main cloth's. (The hue too was kept against the main cloth's at first: the ranger's felt sits 0.03
   * greener than his coat, nothing in green, but in gold it turned olive and in red brown, the hat another cloth.)
   */
  private shade(built: THREE.Color, id: HeroColourId, out: THREE.Color): void {
    const [h, s, l] = heroColour(id)!.hsl;
    built.getHSL(_hsl, THREE.SRGBColorSpace);
    const sat = this.main.s > 0.01 ? (_hsl.s * s) / this.main.s : s;
    const light = this.main.l > 0.01 ? (_hsl.l * l) / this.main.l : l;
    out.setHSL(h, Math.min(1, sat), Math.min(0.92, light), THREE.SRGBColorSpace);
  }

  /**
   * Dyes the hero under `root` in colour `id` (null, or his own: as built). A skinned part keeps a copy of its
   * material (`Sculpt.build`), found by the shader patch it shares with its kit's.
   */
  apply(root: THREE.Object3D, id: HeroColourId | null): void {
    const own = !id || id === this.native || !heroColour(id);
    const copies = new Map<Dyed, Dyed['material'][]>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of looksOn(mesh)) {
        const patch = material.onBeforeCompile;
        const d = this.dyed.find((x) => x.material !== material && x.material.onBeforeCompile === patch);
        if (d) copies.set(d, [...(copies.get(d) ?? []), material as Dyed['material']]);
      }
    });
    for (const d of this.dyed) {
      if (own) d.material.color.copy(d.color);
      else this.shade(d.color, id, d.material.color);
      for (const copy of copies.get(d) ?? []) copy.color.copy(d.material.color);
      if (d.rim && d.rimBuilt) {
        if (own) d.rim.copy(d.rimBuilt);
        else this.shade(d.rimBuilt, id, d.rim);
      }
    }
  }
}
