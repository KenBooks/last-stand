// A worn item's glow in its rarity's colour (#404): a Rare item and better glows faintly over its own colour and the
// hero's dye, most at its edges, wisps drifting slowly up it and breathing (`ITEM_GLOW` in core/materials.ts). No
// light and no program of its own: a glowing item's parts draw with copies of their kit materials (`kitCopy`), the
// same program as every kit material's, their glow a uniform's colour of their own. Every material a hero draws in
// is a switch for three, which sends all of its uniforms again (13 to 24 us each on a desktop, a draw in the material
// before's 2 to 4). So where the hero's looks draw from palettes (`palette.ts`, WebGL) a copy is a row of its
// original's palette, and costs nothing; elsewhere (WebGPU, a part no palette holds) an item that doesn't glow
// (under Rare, or the setting off) draws in the kit's own materials.
import * as THREE from 'three';
import { gearGlow, ITEM_GLOW, kitCopy, ownAura } from '../../core/materials';
import { RARITIES } from '../../data/items';
import type { Gear, GlowSlot, RarityId } from '../../types';
import { PALETTES } from './palette';

/** the lowest rarity that glows (from play: "if green or above") */
const FROM: RarityId = 'rare';
const ORDER: RarityId[] = ['common', 'magic', 'rare', 'epic', 'legendary'];

/** how strongly each glowing rarity glows against the rest (its colour times this and `ITEM_GLOW.strength`): the rarer
 *  a little more */
export const GLOW_STRENGTH: Partial<Record<RarityId, number>> = { rare: 1, epic: 1.15, legendary: 1.35 };

/** The colour (linear) an item of `rarity` glows, black for none. */
export function glowOf(rarity: RarityId | undefined, out: THREE.Color): THREE.Color {
  if (!rarity || ORDER.indexOf(rarity) < ORDER.indexOf(FROM)) return out.setRGB(0, 0, 0);
  return out.set(RARITIES.find((r) => r.id === rarity)!.color).multiplyScalar(GLOW_STRENGTH[rarity] ?? 1);
}

/** how `ItemGlows.add` takes an item's parts */
interface GlowParts {
  inPlace?: boolean;
  only?: (mesh: THREE.Mesh) => boolean;
}

/** Whether `mesh` is drawn in one of `materials`, or a copy of one sharing its hook (a skinned part's, `Sculpt.build`;
 *  not a hand's, whose hook wraps it). */
export function drawnIn(mesh: THREE.Mesh, materials: THREE.Material[]): boolean {
  return [mesh.material].flat().some((m) => materials.some((x) => x === m || x.onBeforeCompile === m.onBeforeCompile));
}

/** A part of an item's drawn in a kit material (`at`: which of its materials, of several): `own` while the item
 *  doesn't glow, `copy` while it does. */
interface Worn { mesh: THREE.Mesh; at: number; own: THREE.Material; copy: THREE.Material }

/** `mesh`'s material (its `at`th, of several) made `material`. */
function draw(mesh: THREE.Mesh, at: number, material: THREE.Material): void {
  if (Array.isArray(mesh.material)) mesh.material[at] = material;
  else mesh.material = material;
}

export class ItemGlows {
  private readonly auras = new Map<GlowSlot, THREE.Color[]>();
  private readonly worn = new Map<GlowSlot, Worn[]>();

  /** `kitMats`: the kit's materials, which the copies join (disposed with them; on WebGPU a merged hero's parts are
   *  told apart by them, `drawAsOne.ts`) */
  constructor(private readonly kitMats: THREE.Material[]) {}

  /**
   * The meshes under `parts` glow as `slot`'s item. Each kit material among them is copied once for the slot, so the
   * rest of the hero in that material doesn't glow, and drawn in while the item glows (`set`); `inPlace`, it keeps its
   * material and is given a glow of its own
   * (a material already the item's alone, whose hook a wrapper calls with that material: the hands' copies,
   * `hands.ts`). `only`: of the meshes under `parts`, these alone (a coat's among the body's). Call as the model is
   * built, before it's first drawn: an `inPlace` glow's uniform is taken as its material compiles.
   */
  add(slot: GlowSlot, parts: Iterable<THREE.Object3D>, { inPlace = false, only }: GlowParts = {}): this {
    const copies = new Map<THREE.Material, THREE.Material>();
    const auras = this.auras.get(slot) ?? [];
    this.auras.set(slot, auras);
    const worn = this.worn.get(slot) ?? [];
    this.worn.set(slot, worn);
    for (const part of parts) {
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (only && !only(mesh))) return;
        const mine = (material: THREE.Material, at: number): void => {
          if (!(material as { kitLooks?: unknown }).kitLooks) return;
          let copy = copies.get(material);
          if (!copy && inPlace) {
            copies.set(material, material);
            const aura = ownAura(material);
            if (aura) auras.push(aura);
            return;
          }
          if (!copy) {
            copy = kitCopy(material);
            copies.set(material, copy);
            this.kitMats.push(copy);
            auras.push((copy as unknown as { kitLooks: { aura: { value: THREE.Color } } }).kitLooks.aura.value);
          }
          if (copy === material) return;
          // (a palette's row from the start: `drawFromPalettes` finds the part in its copy)
          if (PALETTES) draw(mesh, at, copy);
          else worn.push({ mesh, at, own: material, copy });
        };
        [mesh.material].flat().forEach(mine);
      });
    }
    return this;
  }

  /** Each slot's parts glow as the rarity of the item worn there has it (`Gear.rarity`), drawn in their copies while
   *  it glows and the setting has gear glow, else in the kit's own materials (the same program: nothing compiles). */
  set(gear: Gear): void {
    for (const [slot, auras] of this.auras) {
      const rarity = gear.rarity[slot];
      const scale = slot === 'weapon' ? ITEM_GLOW.weapon : 1;
      for (const aura of auras) glowOf(rarity, aura).multiplyScalar(scale);
      const glows = gearGlow() && auras.some((aura) => aura.r + aura.g + aura.b > 0);
      for (const { mesh, at, own, copy } of this.worn.get(slot) ?? []) draw(mesh, at, glows ? copy : own);
    }
  }
}
