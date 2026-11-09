// A worn item's glow in its rarity's colour (#404): a Rare item and better glows faintly over its own colour and the
// hero's dye, most at its edges, wisps drifting slowly up it and breathing (`ITEM_GLOW` in core/materials.ts). No
// light and no program of its own: each item's parts draw with copies of their kit materials (`kitCopy`), the same
// program as every kit material's, their glow a uniform's colour of their own.
import * as THREE from 'three';
import { kitCopy, ownAura } from '../../core/materials';
import { RARITIES } from '../../data/items';
import type { Gear, GlowSlot, RarityId } from '../../types';

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

export class ItemGlows {
  private readonly auras = new Map<GlowSlot, THREE.Color[]>();

  /** `kitMats`: the kit's materials, which the copies join (disposed with them; on WebGPU a merged hero's parts are
   *  told apart by them, `drawAsOne.ts`) */
  constructor(private readonly kitMats: THREE.Material[]) {}

  /**
   * The meshes under `parts` glow as `slot`'s item. Each kit material among them is copied once for the slot, so the
   * rest of the hero in that material doesn't glow; `inPlace`, it keeps its material and is given a glow of its own
   * (a material already the item's alone, whose hook a wrapper calls with that material: the hands' copies,
   * `hands.ts`). `only`: of the meshes under `parts`, these alone (a coat's among the body's). Call as the model is
   * built, before it's first drawn: the glow's uniform is taken as it compiles.
   */
  add(slot: GlowSlot, parts: Iterable<THREE.Object3D>, { inPlace = false, only }: GlowParts = {}): this {
    const copies = new Map<THREE.Material, THREE.Material>();
    const auras = this.auras.get(slot) ?? [];
    this.auras.set(slot, auras);
    for (const part of parts) {
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (only && !only(mesh))) return;
        const mine = (material: THREE.Material): THREE.Material => {
          if (!(material as { kitLooks?: unknown }).kitLooks) return material;
          let copy = copies.get(material);
          if (copy) return copy;
          if (inPlace) {
            copies.set(material, material);
            const aura = ownAura(material);
            if (aura) auras.push(aura);
            return material;
          }
          copy = kitCopy(material);
          copies.set(material, copy);
          this.kitMats.push(copy);
          auras.push((copy as unknown as { kitLooks: { aura: { value: THREE.Color } } }).kitLooks.aura.value);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(mine) : mine(mesh.material);
      });
    }
    return this;
  }

  /** Each slot's parts glow as the rarity of the item worn there has it (`Gear.rarity`). */
  set(gear: Gear): void {
    for (const [slot, auras] of this.auras) {
      const rarity = gear.rarity[slot];
      for (const aura of auras) glowOf(rarity, aura);
    }
  }
}
