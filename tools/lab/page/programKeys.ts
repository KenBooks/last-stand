// A three.js program's cache key read by field, and the programs of each kind set apart by what differs (tools/lab,
// `lab programs`). three r187 joins a program's key from its shader (an id, or a custom shader's two), each define's
// name and value, then for every material but a raw shader 53 parameters, two masks of flags and the output colour
// space, and last the material's own key (`WebGLPrograms.js` `getProgramCacheKey`); `test/programKeys.test.mjs`
// holds these names to the installed three's source, so a three that moves them fails there.

/** the parameters in a key, in its order (`getProgramCacheKeyParameters`) */
export const PARAMETERS = [
  'precision', 'outputColorSpace', 'envMapMode', 'envMapPMREM', 'envMapMaxLod', 'envMapSize', 'mapUv', 'alphaMapUv',
  'lightMapUv', 'aoMapUv', 'bumpMapUv', 'normalMapUv', 'displacementMapUv', 'emissiveMapUv', 'metalnessMapUv',
  'roughnessMapUv', 'anisotropyMapUv', 'clearcoatMapUv', 'clearcoatNormalMapUv', 'clearcoatRoughnessMapUv',
  'diffuseRoughnessMapUv', 'iridescenceMapUv', 'iridescenceThicknessMapUv', 'sheenColorMapUv', 'sheenRoughnessMapUv',
  'specularMapUv', 'specularColorMapUv', 'specularIntensityMapUv', 'transmissionMapUv', 'thicknessMapUv', 'combine',
  'fogExp2', 'sizeAttenuation', 'morphTargetsCount', 'numSunLights', 'numDirLights', 'numPointLights', 'numSpotLights',
  'numSpotLightMaps', 'numHemiLights', 'numRectAreaLights', 'numSunLightShadows', 'numDirLightShadows',
  'numPointLightShadows', 'numSpotLightShadows', 'numSpotLightShadowsWithMaps', 'numLightProbes', 'numLightProbeGrids',
  'shadowMapType', 'toneMapping', 'numClippingPlanes', 'numClipIntersection', 'depthPacking',
];

/** the flags of each mask, by bit (`getProgramCacheKeyBooleans`; the second's bit 22 is `numLightProbeGrids > 0`) */
export const FLAGS = [
  [
    'instancing', 'instancingColor', 'instancingMorph', 'matcap', 'envMap', 'normalMapObjectSpace',
    'normalMapTangentSpace', 'clearcoat', 'iridescence', 'alphaTest', 'vertexColors', 'vertexAlphas', 'vertexUv1s',
    'vertexUv2s', 'vertexUv3s', 'vertexTangents', 'anisotropy', 'alphaHash', 'batching', 'dispersion',
    'batchingColor', 'gradientMap', 'packedNormalMap', 'vertexNormals', 'retroreflection', 'diffuseRoughness',
  ],
  [
    'fog', 'useFog', 'flatShading', 'logarithmicDepthBuffer', 'reversedDepthBuffer', 'skinning', 'morphTargets',
    'morphNormals', 'morphColors', 'premultipliedAlpha', 'shadowMapEnabled', 'doubleSided', 'flipSided',
    'useDepthPacking', 'dithering', 'transmission', 'sheen', 'opaque', 'pointsUvs', 'decodeVideoTexture',
    'decodeVideoTextureEmissive', 'alphaToCoverage', 'lightProbeGrids', 'hasPositionAttribute',
  ],
];

/** what follows the parameters: the masks, the output colour space and the material's own key */
const TAIL = FLAGS.length + 2;

/** A program's kind: its material's type and the shader it was made from (three's id for it, or a custom shader's
 *  number). */
export const kindOf = (type: string, key: string): string => `${type} (${key.split(',')[0]})`;

/** the material's own key three gives one that keys nothing (`Material.customProgramCacheKey`: its
 *  `onBeforeCompile` written out, which a material that keys more adds to) */
const NO_KEY = 'onBeforeCompile() {}';

/** A material's own key as written, three's default left out (`none` if that was all). */
const ownKey = (custom: string): string => custom.replace(NO_KEY, '') || 'none';

/**
 * A key's fields by name: `shader` (the shader and its defines, as written), each parameter, each flag set (`on`),
 * `output` and `custom` (the material's own key). A raw shader's key has no parameters: its `shader` and `custom`
 * alone.
 */
export function fieldsOf(key: string): Map<string, string> {
  const parts = key.split(',');
  const fields = new Map<string, string>();
  const headLength = parts.length - PARAMETERS.length - TAIL;
  if (headLength < 1) {
    fields.set('shader', parts.slice(0, -1).join(','));
    fields.set('custom', ownKey(parts[parts.length - 1]));
    return fields;
  }
  fields.set('shader', parts.slice(0, headLength).join(','));
  PARAMETERS.forEach((name, index) => fields.set(name, parts[headLength + index]));
  FLAGS.forEach((names, mask) => {
    const bits = Number(parts[headLength + PARAMETERS.length + mask]);
    names.forEach((name, bit) => {
      if (bits & (1 << bit)) fields.set(`flag ${name}`, 'on');
    });
  });
  fields.set('output', parts[parts.length - 2]);
  fields.set('custom', ownKey(parts[parts.length - 1]));
  return fields;
}

/** A program as the listing reads it: its kind and its key's fields. */
export interface Keyed {
  kind: string;
  fields: Map<string, string>;
}

/** One field that differs among a kind's programs: each value it takes, with how many take it, the most first. */
export interface Apart {
  field: string;
  values: { value: string; count: number }[];
}

/** A kind of program: how many, and the fields that set them apart (those with more than one value; a flag set on
 *  some, off on the others). */
export interface KindApart {
  kind: string;
  count: number;
  apart: Apart[];
}

/** Each field's values among `programs`, a flag missing read as `off`. */
function valuesOf(programs: Keyed[]): Map<string, Map<string, number>> {
  const names = new Set(programs.flatMap((program) => [...program.fields.keys()]));
  const values = new Map<string, Map<string, number>>();
  for (const name of names) {
    const counts = new Map<string, number>();
    for (const program of programs) {
      const value = program.fields.get(name) ?? (name.startsWith('flag ') ? 'off' : '-');
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    values.set(name, counts);
  }
  return values;
}

/** The programs by kind, the most first, each with the fields that set them apart, the most varied first. */
export function kindsApart(programs: Keyed[]): KindApart[] {
  const byKind = new Map<string, Keyed[]>();
  for (const program of programs) {
    if (!byKind.has(program.kind)) byKind.set(program.kind, []);
    byKind.get(program.kind)!.push(program);
  }
  const kinds = [...byKind].map(([kind, ofKind]) => {
    const apart = [...valuesOf(ofKind)]
      .filter(([, counts]) => counts.size > 1)
      .map(([field, counts]) => ({
        field,
        values: [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.values.length - a.values.length || a.field.localeCompare(b.field));
    return { kind, count: ofKind.length, apart };
  });
  return kinds.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** A field apart as a line's piece: `custom (entityfx 30, entityfx-near 20)`. */
export const apartText = ({ field, values }: Apart): string => {
  return `${field} (${values.map(({ value, count }) => `${value || '""'} ${count}`).join(', ')})`;
};
