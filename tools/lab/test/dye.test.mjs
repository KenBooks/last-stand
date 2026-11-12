// Dye is a live uniform change, including skinned copies; restoring native colour must leave fittings alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Dye } from '../../../src/entities/models/dye.ts';
import { HERO_COLOURS } from '../../../src/data/heroColours.ts';

test('every colour dyes only registered materials and copies, without a shader version change', () => {
  const cloth = new THREE.MeshStandardMaterial({ color: 0x323c56 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4c8cf, metalness: 0.92 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x4e3222 });
  cloth.onBeforeCompile = () => {};
  metal.onBeforeCompile = () => {};
  const copy = metal.clone();
  copy.onBeforeCompile = metal.onBeforeCompile;
  const original = [cloth, metal, boots].map(material => material.color.getHex());
  const root = new THREE.Group();
  for (const material of [cloth, metal, copy, boots]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const dye = new Dye('blue').cloth(cloth).tint(metal);
  const versions = [cloth, metal, copy, boots].map(material => material.version);
  for (const { id } of HERO_COLOURS) {
    dye.apply(root, id);
    assert.equal(copy.color.getHex(), metal.color.getHex());
    assert.equal(boots.color.getHex(), original[2]);
    assert.deepEqual([cloth, metal, copy, boots].map(material => material.version), versions);
    assert.equal(metal.metalness, 0.92);
  }
  dye.apply(root, null);
  assert.deepEqual([cloth, metal, boots].map(material => material.color.getHex()), original);
  dye.apply(root, 'blue');
  assert.equal(cloth.color.getHex(), original[0]);
  assert.notEqual(metal.color.getHex(), original[1], 'an explicit native-blue pick must tint the added cuirass too');
});

test('the leather abdomen matches the torso cloth while legs and the original look stay independent', () => {
  const cloth = new THREE.MeshStandardMaterial({ color: 0x323c56 });
  const abdomen = new THREE.MeshStandardMaterial({ color: 0x2c1d14 });
  const legs = new THREE.MeshStandardMaterial({ color: 0x2c1d14 });
  cloth.onBeforeCompile = () => {};
  abdomen.onBeforeCompile = () => {};
  legs.onBeforeCompile = () => {};
  const root = new THREE.Group();
  for (const material of [cloth, abdomen, legs]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const original = abdomen.color.getHex();
  const dye = new Dye('blue').cloth(cloth).tintLike(cloth, abdomen);
  for (const colour of ['gold', 'red', 'teal', 'blue']) {
    dye.apply(root, colour);
    assert.equal(abdomen.color.getHex(), cloth.color.getHex());
    assert.equal(legs.color.getHex(), original);
  }
  dye.apply(root, null);
  assert.equal(abdomen.color.getHex(), original);
});
