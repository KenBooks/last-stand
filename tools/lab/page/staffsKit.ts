// What `staffs`' parts share (page/staffs.ts, page/staffsThread.ts): a part's findings, a point before the hero and
// his skill as his gear has it.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { SkillDef } from '../../../src/types';

/** What a part found: its lines, its problems and its pictures. */
export interface Found {
  lines: string[];
  problems: string[];
  moments: Pictured[];
}

/** A part's findings, none yet. */
export const emptyFound = (): Found => ({ lines: [], problems: [], moments: [] });

/** The point `metres` ahead of the hero and `right` to his right. */
export function ahead(lab: Lab, metres: number, right = 0): THREE.Vector3 {
  const { pos, facing } = lab.player;
  return new THREE.Vector3(
    pos.x + Math.sin(facing) * metres - Math.cos(facing) * right,
    0,
    pos.z + Math.cos(facing) * metres + Math.sin(facing) * right,
  );
}

/** The hero's skill of behaviour `impl`, as his gear has it. */
export function skillOf(lab: Lab, impl: string): SkillDef {
  const known = lab.player.known.get(impl);
  if (!known) throw new Error(`lab: staffs: the ${lab.player.cls.id} has no ${impl}`);
  return known.def;
}
