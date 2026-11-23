// Triplanar texturing for a sculpted surface with no unwrapping of its own (models/handShape.ts): its colour, normal
// and roughness maps each read three times, flat along each axis of the space it was sculpted in, and blended by how
// squarely the surface faces each. Read where it lay as it was sculpted (its vertices' own places, before skinning),
// the grain stays on the skin as it bends. (Read flat along the one axis each vertex faced most, the glove's leather
// broke into streaks down the hand's sides wherever the axis changed.)
import * as THREE from 'three';

/** how sharply the planes give way to one another (higher: a narrower blend where the surface turns between them) */
const SHARPNESS = 4;

const VERTEX_DECLARATIONS = /* glsl */ `
#include <common>
varying vec3 vTriPlace;
varying vec3 vTriFacing;
`;

const VERTEX_PLACE = /* glsl */ `
#include <begin_vertex>
vTriPlace = position;
vTriFacing = normal;
`;

/** the fragment's declarations: the place and facing, each plane's place on the maps (`perMetre` tiles a metre) and
 *  its share */
const fragmentDeclarations = (perMetre: number) => /* glsl */ `
#include <common>
varying vec3 vTriPlace;
varying vec3 vTriFacing;
vec3 triShares() {
  vec3 share = pow( abs( normalize( vTriFacing ) ), vec3( ${SHARPNESS.toFixed(1)} ) );
  return share / ( share.x + share.y + share.z );
}
vec2 triAlongX() { return vTriPlace.zy * ${perMetre.toFixed(4)}; }
vec2 triAlongY() { return vTriPlace.xz * ${perMetre.toFixed(4)}; }
vec2 triAlongZ() { return vTriPlace.xy * ${perMetre.toFixed(4)}; }
`;

const MAP = /* glsl */ `
#ifdef USE_MAP
  {
    vec3 share = triShares();
    vec4 sampled = texture2D( map, triAlongX() ) * share.x + texture2D( map, triAlongY() ) * share.y
      + texture2D( map, triAlongZ() ) * share.z;
    diffuseColor *= sampled;
  }
#endif
`;

const ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  {
    vec3 share = triShares();
    roughnessFactor *= texture2D( roughnessMap, triAlongX() ).g * share.x
      + texture2D( roughnessMap, triAlongY() ).g * share.y + texture2D( roughnessMap, triAlongZ() ).g * share.z;
  }
#endif
`;

// (each plane's normal from its own tangents, found from how its place on the map changes across the screen, as
// three finds them for a surface without tangents of its own)
const NORMAL = /* glsl */ `
#if defined( USE_NORMALMAP_TANGENTSPACE ) && ! defined( USE_TANGENT )
  {
    vec3 share = triShares();
    vec2 along[ 3 ] = vec2[ 3 ]( triAlongX(), triAlongY(), triAlongZ() );
    vec3 blended = vec3( 0.0 );
    for ( int plane = 0; plane < 3; plane++ ) {
      mat3 frame = getTangentFrame( - vViewPosition, normal, along[ plane ] );
      #if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
        frame[ 0 ] *= faceDirection;
        frame[ 1 ] *= faceDirection;
      #endif
      vec3 mapN = texture2D( normalMap, along[ plane ] ).xyz * 2.0 - 1.0;
      #if defined( USE_PACKED_NORMALMAP )
        mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
      #endif
      mapN.xy *= normalScale;
      blended += frame * mapN * share[ plane ];
    }
    normal = normalize( blended );
  }
#else
  #include <normal_fragment_maps>
#endif
`;

/** `material`'s maps read triplanar, a tile each `tile` (m) of the space its surface was sculpted in, after what its
 *  own `onBeforeCompile` does; it's returned. (Its program's key is read before the hook goes on, as
 *  models/dualQuaternion.ts says why.) */
export function triplanar<T extends THREE.Material>(material: T, tile: number): T {
  const own = material.onBeforeCompile;
  const key = `${material.customProgramCacheKey()}-triplanar${tile}`;
  // (for a renderer with no hook of three's: the Rust engine's kit look reads it, engine/looks/kit.ts)
  material.userData.triplanar = tile;
  material.onBeforeCompile = (shader, renderer) => {
    own.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <begin_vertex>', VERTEX_PLACE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', fragmentDeclarations(1 / tile))
      .replace('#include <map_fragment>', MAP)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS)
      .replace('#include <normal_fragment_maps>', NORMAL);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
