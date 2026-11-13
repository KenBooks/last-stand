// Lamps every lit surface is lit by, at any distance, as a renderer with clustered lights lights them (Unreal's
// forward shading lists the lights in a grid of cells and lights each pixel by its cell's): three's own point lights
// are as many as its programs were compiled for, and a light more compiles them all again, so the village's street
// lamps were lit by the pool's lights at the three nearest the hero alone, the rest drawn as painted pools that turned
// into lit ground as he walked up (from play: "I dont like when lights change from low quality to high quality when I
// come close, it looks lame"). These are a list in a uniform of three's own lit materials (`ShaderLib`), every lit
// shader's lights looping over it after three's point lights, by three's own falloff: the same light as a point light
// at that spot, and no light in the list changes a program. The list is one array of floats, shared by every material
// (three clones each material's uniforms from `ShaderLib`'s, vectors and arrays of them too, but keeps a typed array as
// it is), so a lamp set here is set for all.
//
// Each lamp casts the shadows of what stands still round it, from a map of them all drawn once (`world/lampAtlas.ts`:
// six faces a lamp, the distance to the nearest thing it meets in each texel, as a point light's cube holds it), as
// lamps and what stands round them never move: lit by the list alone, every lamp but the two nearest the hero, which
// cast by the pool's casting lights, lit through what stood round it (from play, "your light test for each light need
// to test SHADOW, it was missing for half of them"). Its light would still go through walls the map hasn't, so one
// box on the ground is a shelter (the hall of heroes' inside), and each lamp lights either what's inside it or what's
// outside (its torches lit the terrace through the hall's walls, and the street lamps its room; switched over at its
// door, the lamps went out as the hero walked in, "lights turn off when I enter the hall").
import * as THREE from 'three';
import { BOUNDS_TEST } from './lightBounds';

/** the most lamps the list holds */
export const LAMPS_MOST = 24;

/** the shadows' map: each lamp's six faces a tile of `SHADOW_TILE` texels, `SHADOW_COLUMNS` tiles a row, in turn */
export const SHADOW_TILE = 256;
export const SHADOW_COLUMNS = 12;
/** how far a point is moved out along its surface before its shadow is looked up, and how much nearer than what the
 *  map holds it must be to be lit (m): a texel is about a fortieth of the distance across at the edge of a face, and
 *  without, the ground shadowed itself in stripes */
const SHADOW_OUT = 0.04;
const SHADOW_BIAS = 0.03;
/** the map, made at once so every material shares the one texture, its storage made on the GPU with nothing in it
 *  (its picture copied in later, `world/lampAtlas.ts`): a render target's texture three gives a material as none */
export const lampShadowMap = new THREE.DataTexture(null, SHADOW_TILE * SHADOW_COLUMNS,
  SHADOW_TILE * Math.ceil(LAMPS_MOST * 6 / SHADOW_COLUMNS), THREE.RedFormat, THREE.HalfFloatType);
lampShadowMap.source.dataReady = false;
lampShadowMap.needsUpdate = true;
// (three clones a material's uniforms from `ShaderLib`'s, a texture with them: a copy would hold none of the map)
lampShadowMap.clone = () => lampShadowMap;

/** the map as WebGPU's materials read it (`core/lampNodes.ts`): a plain texture its faces are copied into, top row first.
 *  Not a render target's: three flips a read of one by a uniform of the object's, which a still material's refresh never
 *  sends, and most of the village read the map upside down, the square in hard blocks of shadow and the terrace's wall
 *  black. Made as first asked for, with data of its own: WebGPU's has no storage made with nothing in it. */
let atlasTexture: THREE.DataTexture | null = null;
export function lampAtlasTexture(): THREE.DataTexture {
  if (atlasTexture) return atlasTexture;
  const { width, height } = lampShadowMap.image;
  atlasTexture = new THREE.DataTexture(new Uint16Array(width * height), width, height, THREE.RedFormat, THREE.HalfFloatType);
  atlasTexture.needsUpdate = true;
  return atlasTexture;
}

/** the list, four floats an entry: its first the shelter (its least x and z, its most), then two a lamp: its place and
 *  how far it reaches (m), and its colour times its intensity, a point light's in candela, and which side of the
 *  shelter it lights (1 inside, -1 outside; 0: out, skipped); last, whether the shadows' map is drawn (its first) */
const list = new Float32Array((1 + LAMPS_MOST * 2 + 1) * 4);
/** the last entry's first float: whether the shadows' map is drawn */
const SHADOWS_ON = (1 + LAMPS_MOST * 2) * 4;
/** the last entry's second: how far off a surface its side of the shelter is read (a lab may read it on the surface) */
const SHELTER_READ = SHADOWS_ON + 1;
/** how far off a surface, along its normal, its side of the shelter is read (m) */
const SHELTER_OFF = 0.05;
list[SHELTER_READ] = SHELTER_OFF;

/** the list as it stands, for WebGPU's uniforms (`core/lampNodes.ts`) */
export const lampList = list;

/** lamp `i`'s first float, and its light's */
const placeOf = (i: number): number => (1 + i * 2) * 4;
const lightOf = (i: number): number => placeOf(i) + 4;

/** each lit shader's lamps, after three's point lights (its `directLight` and `RE_Direct`, as they light those) */
/** how soft a lamp's light is close to (m squared, added to the square of the distance: as if a ball of about 2 m lit it);
 *  its light on a head under it halved, on the ground 5 m off a tenth less. A pooled light is as soft by its `decay`. */
export const LAMP_SOFT = 4;
/** the side of the shelter a lit point is on (1 inside, -1 outside), and its place and normal in the world */
const LAMPS_SIDE = `
		vec3 seen = transpose( mat3( viewMatrix ) ) * ( geometryPosition - viewMatrix[ 3 ].xyz );
		vec3 seenNormal = transpose( mat3( viewMatrix ) ) * geometryNormal;
		vec4 shelter = lamps[ 0 ];
		// (its side read a little off the surface, along its normal: the hall's inner walls stand on the shelter's edge,
		// and read on them each pixel's side flipped as the view moved a hair, the walls flickering between the torches'
		// light and the street lamps', "this wall in hall of heroes is z-fighting / flickering")
		vec2 sideAt = seen.xz + seenNormal.xz * lamps[ LAMPS_SHADOWS ].y;
		float side = all( greaterThan( sideAt, shelter.xy ) ) && all( lessThan( sideAt, shelter.zw ) ) ? 1.0 : - 1.0;
`;
/** lamp `lampAt`'s light on the point as `directLight`, or on to the next where it lights none of it */
const LAMP_LIGHT = `
			vec4 lampLight = lamps[ 2 + lampAt * 2 ];
			if ( lampLight.w != side ) continue;
			vec4 lamp = lamps[ 1 + lampAt * 2 ];
			vec3 toLamp = ( viewMatrix * vec4( lamp.xyz, 1.0 ) ).xyz - geometryPosition;
			float lampDistance = length( toLamp );
			if ( lampDistance >= lamp.w ) continue;
			float lampLit = 1.0;
			if ( lamps[ LAMPS_SHADOWS ].x > 0.0 ) {
				lampLit = lampShadowAt( lampAt, seen + seenNormal * ${SHADOW_OUT.toFixed(3)} - lamp.xyz );
				if ( lampLit <= 0.0 ) continue;
			}
			directLight.direction = toLamp / lampDistance;
			directLight.color = lampLight.rgb * getDistanceAttenuation( lampDistance, lamp.w, ${(2 + LAMP_SOFT).toFixed(1)} ) * lampLit;
			directLight.visible = true;
`;
/** three's lighting of `directLight` on the point, as it lights a point light */
const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
/** the lamps in a loop of their own, where a shader has no point lights to share one with */
const LAMPS_LIT = `
#if defined( RE_Direct ) && ( NUM_POINT_LIGHTS == 0 )
	{${LAMPS_SIDE}
		for ( int lampAt = 0; lampAt < LAMPS_MOST; lampAt ++ ) {${LAMP_LIGHT}
			${RE_DIRECT}
		}
	}
#endif
`;
/** `lightBounds.ts`' test of a light on its packed bounds, as `loopPointLights` writes it first in the loop, each line
 *  indented by `more`; none where the bounds aren't declared */
const boundsTest = (packed: boolean, more = ''): string =>
  (packed ? BOUNDS_TEST.map((line) => `${more}${line}\n`).join('') : '');
/** the point lights' loop as `loopPointLights` (core/renderer.ts) leaves it, the shadowed ones written out before it,
 *  with its bounds test or without (#481: with it, the loop the lamps looked for was gone, and they lit nothing where
 *  point lights are) */
const pointLoop = (packed: boolean): string => `	for ( int i = unshadowedFrom; i < NUM_POINT_LIGHTS; i ++ ) {
${boundsTest(packed)}		pointLight = pointLights[ i ];
		toLight = pointLight.position - geometryPosition;
		if ( pointLight.color == vec3( 0.0 ) || ( pointLight.distance > 0.0 && dot( toLight, toLight ) >= pointLight.distance * pointLight.distance ) ) continue;
		getPointLightInfo( pointLight, geometryPosition, directLight );
		if ( directLight.visible ) ${RE_DIRECT}
	}`;
/**
 * The lamps lit in the point lights' own loop, a light a turn and three's lighting written once for both: in a loop of
 * their own after it, its lighting written out a second time, every lit shader took about a third longer to compile
 * than main's (`npm run lab -- programs --cost`: 0.95 s against 0.61 without the lamps), a first visit's 147
 * programs 94.5 s against main's 49.3.
 */
const pointLoopWithLamps = (packed: boolean): string => `${LAMPS_SIDE}
	for ( int i = unshadowedFrom; i < NUM_POINT_LIGHTS + LAMPS_MOST; i ++ ) {
		if ( i < NUM_POINT_LIGHTS ) {
${boundsTest(packed, '\t')}			pointLight = pointLights[ i ];
			toLight = pointLight.position - geometryPosition;
			if ( pointLight.color == vec3( 0.0 ) || ( pointLight.distance > 0.0 && dot( toLight, toLight ) >= pointLight.distance * pointLight.distance ) ) continue;
			getPointLightInfo( pointLight, geometryPosition, directLight );
			if ( ! directLight.visible ) continue;
		} else {
			int lampAt = i - NUM_POINT_LIGHTS;${LAMP_LIGHT}
		}
		${RE_DIRECT}
	}`;
const LAMPS_DECLARED = `
#define LAMPS_MOST ${LAMPS_MOST}
#define LAMPS_SHADOWS ( 1 + LAMPS_MOST * 2 )
uniform vec4 lamps[ 2 + LAMPS_MOST * 2 ];
uniform sampler2D lampShadowMap;
// the face of the cube round a lamp a point off it ('d') is on, as the map's faces are drawn (world/lampAtlas.ts:
// a camera at the lamp looking along the face's axis, up the world's up, or its z for the faces up and down)
vec3 lampFaceAxis( vec3 d, out int face ) {
	vec3 a = abs( d );
	if ( a.x >= a.y && a.x >= a.z ) { face = d.x > 0.0 ? 0 : 1; return vec3( sign( d.x ), 0.0, 0.0 ); }
	if ( a.y >= a.z ) { face = d.y > 0.0 ? 2 : 3; return vec3( 0.0, sign( d.y ), 0.0 ); }
	face = d.z > 0.0 ? 4 : 5;
	return vec3( 0.0, 0.0, sign( d.z ) );
}
// how lit a texel's neighbourhood at 'at' (the map's texels) is for a point 'far' off its lamp: four texels' tests
// blended by where it falls between them
float lampLitNear( vec2 at, float far ) {
	vec2 base = floor( at );
	vec2 blend = at - base;
	ivec2 texel = ivec2( base );
	float lit00 = step( far, texelFetch( lampShadowMap, texel, 0 ).r );
	float lit10 = step( far, texelFetch( lampShadowMap, texel + ivec2( 1, 0 ), 0 ).r );
	float lit01 = step( far, texelFetch( lampShadowMap, texel + ivec2( 0, 1 ), 0 ).r );
	float lit11 = step( far, texelFetch( lampShadowMap, texel + ivec2( 1, 1 ), 0 ).r );
	return mix( mix( lit00, lit10, blend.x ), mix( lit01, lit11, blend.x ), blend.y );
}
// how lit a point 'd' off lamp 'lamp' is by it, by what stands still round it (0 to 1: four blended tests a texel and
// a half apart, an edge as soft as a lantern's, its width growing with the distance from the lamp as a texel's does;
// one test's edge was as hard as its caster's own, from play's review "too sharp for a lantern")
float lampShadowAt( int lamp, vec3 d ) {
	int face;
	vec3 axis = lampFaceAxis( d, face );
	vec3 up = abs( axis.y ) > 0.5 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
	vec3 across = normalize( cross( up, - axis ) );
	vec3 upward = cross( - axis, across );
	vec2 uv = vec2( dot( d, across ), dot( d, upward ) ) / dot( d, axis ) * 0.5 + 0.5;
	int tile = lamp * 6 + face;
	vec2 corner = vec2( float( tile % ${SHADOW_COLUMNS} ), float( tile / ${SHADOW_COLUMNS} ) ) * ${SHADOW_TILE}.0;
	vec2 at = corner + clamp( uv * ${SHADOW_TILE}.0, 2.0, ${SHADOW_TILE}.0 - 3.0 ) - 0.5;
	float far = length( d ) - ${SHADOW_BIAS.toFixed(3)};
	return 0.25 * ( lampLitNear( at + vec2( - 0.75, - 0.75 ), far ) + lampLitNear( at + vec2( 0.75, - 0.75 ), far )
		+ lampLitNear( at + vec2( - 0.75, 0.75 ), far ) + lampLitNear( at + vec2( 0.75, 0.75 ), far ) );
}
`;
/** where three's lit shaders begin their spot lights: the lamps go just before */
const SPOT_LIGHTS_IF = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';

const FALLOFF_BY_POW = 'pow( lightDistance, decayExponent )';
const FALLOFF_SOFT = 'lightDistance * lightDistance + max( decayExponent - 2.0, 0.0 )';

/** The lamps' list given to every lit material three makes and lit in its shaders; once, before any compiles. */
export function lightTheLamps(): void {
  const begin = THREE.ShaderChunk.lights_fragment_begin;
  if (!begin.includes(SPOT_LIGHTS_IF) || !begin.includes('IncidentLight directLight;')) {
    console.error('lightTheLamps: three\'s lit shaders have changed: the lamps light nothing');
    return;
  }
  // (a light's falloff by the square of its distance plus its softness, carried in its decay past 2: a point has none, and
  // a face under a lamp burned white, "blinding light from street light")
  if (!THREE.ShaderChunk.lights_pars_begin.includes(FALLOFF_BY_POW)) {
    console.error('lightTheLamps: three\'s falloff has changed: no light is soft');
    return;
  }
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(FALLOFF_BY_POW, FALLOFF_SOFT) + LAMPS_DECLARED;
  const looped = begin.replace(SPOT_LIGHTS_IF, LAMPS_LIT + SPOT_LIGHTS_IF);
  const packed = looped.includes(pointLoop(true));
  if (!packed && !looped.includes(pointLoop(false))) {
    console.error('lightTheLamps: the point lights\' loop has changed: the lamps light nothing where point lights are');
  }
  THREE.ShaderChunk.lights_fragment_begin = looped.replace(pointLoop(packed), pointLoopWithLamps(packed));
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (!('pointLights' in shader.uniforms)) continue;
    shader.uniforms.lamps = { value: list };
    shader.uniforms.lampShadowMap = { value: lampShadowMap };
  }
}

/** A lamp's place: where it burns, how far it reaches (m), and whether it lights the shelter's inside. */
export interface LampPlace { at: THREE.Vector3; reach: number; inside: boolean }

/** whether each lamp lights the shelter's inside, and how far it reaches (m), as placed */
let insides: boolean[] = [];
let reaches: number[] = [];
/** a quality's share of each lamp's reach, and whether it reads the shadows' map (`setLampQuality`); and whether the
 *  map is there to read (`setLampShadows`) */
let reachBy = 1;
let shadowsAllowed = true;
let shadowsDrawn = false;

/** The lamps' share of their reach and whether their shadows are read, for a quality: on Low, lit within 18 m, each
 *  pixel by night took the light (and the map's sixteen reads) of 4.6 lamps on the square (on an S25
 *  Edge at full res, the lamps 5.5 ms of an 80 ms frame and their shadows 5); a reach of 12.6 m takes about half
 *  (at 10 m the square's middle lay dark between them). Uniforms alone: a quality switches it live. */
export function setLampQuality(reach: number, shadows: boolean): void {
  reachBy = reach;
  shadowsAllowed = shadows;
  list[SHADOWS_ON] = shadowsDrawn && shadowsAllowed ? 1 : 0;
  reaches.forEach((r, i) => { list[placeOf(i) + 3] = r * reachBy; });
}

/** A quality's share of each lamp's reach (a light standing in for a lamp reaches as far). */
export const lampReachBy = (): number => reachBy;

/** The shelter (its least x and z, its most) and the lamps (none past `LAMPS_MOST`), each out until `lightLamp`. */
export function placeLamps(shelter: [number, number, number, number], places: readonly LampPlace[]): void {
  if (places.length > LAMPS_MOST) console.error(`placeLamps: ${places.length} lamps, ${LAMPS_MOST} lit at the most`);
  const shadows = list[SHADOWS_ON];
  list.fill(0);
  list[SHADOWS_ON] = shadows;
  reaches = places.slice(0, LAMPS_MOST).map((place) => place.reach);
  list[SHELTER_READ] = SHELTER_OFF;
  list.set(shelter, 0);
  insides = places.slice(0, LAMPS_MOST).map((place) => place.inside);
  for (const [i, place] of places.slice(0, LAMPS_MOST).entries()) {
    list.set([place.at.x, place.at.y, place.at.z, place.reach * reachBy], placeOf(i));
  }
}

/** For a harness (tools/lab): each surface's side of the shelter read on it, as it was (or off it again). */
export function readShelterOnSurface(on: boolean): void {
  list[SHELTER_READ] = on ? 0 : SHELTER_OFF;
}

/** Lamp `i` (in `placeLamps`' order) lit in `color` at `intensity` (a point light's, in candela); 0 puts it out. */
export function lightLamp(i: number, color: THREE.Color, intensity: number): void {
  if (i >= insides.length) return;
  const side = intensity > 0 ? (insides[i] ? 1 : -1) : 0;
  // (held out by a harness, the lamp's light is kept for when they're back: the village lights its lamps every frame,
  // and wrote over the harness's lamps out at once, so the Profile's "lamps out" put them out for a frame alone)
  (heldList ?? list).set([color.r * intensity, color.g * intensity, color.b * intensity, side], lightOf(i));
}

/** Whether the shadows' map is drawn and read (`world/lampAtlas.ts`; read where the quality has it,
 *  `setLampQuality`); off, every lamp lights through all. */
export function setLampShadows(on: boolean): void {
  shadowsDrawn = on;
  list[SHADOWS_ON] = shadowsDrawn && shadowsAllowed ? 1 : 0;
}

/** Whether the shadows' map is drawn and read. */
export const lampShadowsOn = (): boolean => list[SHADOWS_ON] > 0;

/** the list as it stood when a harness held the lamps out */
let heldList: Float32Array | null = null;

/** For a harness (tools/lab): every lamp out, what the list takes of a frame's pixels told; off, as they were. */
export function lampsHeldOut(out: boolean): void {
  if (out) {
    heldList = list.slice();
    lampsOut();
  } else if (heldList) {
    list.set(heldList);
    heldList = null;
  }
}

/** Every lamp put out. */
export function lampsOut(): void {
  for (let i = 0; i < insides.length; i++) list[lightOf(i) + 3] = 0;
}
