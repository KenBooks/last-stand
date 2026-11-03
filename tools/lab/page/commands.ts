// The lab's commands as the page runs them (tools/lab): what the session calls, by name, with the lab and the
// command's options. Each sets its fixture up afresh and checks it, so a command's result doesn't depend on the last.
// Each loads its module as it runs: an A/B copies these modules into the other commit's tree, and one measuring game
// code that commit hasn't got (a new skill, a new look) would otherwise stop every command loading there.
import type { Lab, Fixture, Report, ViewName } from './lab';
import type { Joints } from '../../../src/entities/models/rig';
import type { Sheet } from './sheet';
import type { FeetOptions } from './feet';
import type { RangeOptions } from './range';
import type { GaitOptions } from './gait';
import type { StopsOptions } from './stops';
import type { FormOptions } from './form';
import type { UiOptions } from './ui';
import type { WindOptions } from './wind';
import type { TouchOptions } from './touchStick';
import type { TapOptions } from './tap';
import type { PracticeOptions } from './practice';
import type { TrailOptions } from './trail';
import type { LightOptions } from './light';
import type { FireOptions } from './fire';
import type { EnvCostOptions } from './envCost';
import type { HazeOptions } from './haze';
import type { SpawnsOptions } from './spawns';
import type { HealthOptions } from './health';
import type { BlinkOptions } from './blink';
import type { HeldOptions } from './held';
import type { CastOptions } from './cast';
import type { DrawOptions } from './draw';
import type { GearOptions } from './gear';
import type { MusicOptions } from './music';
import type { DeathOptions } from './death';
import type { HitsOptions } from './hits';
import type { LogOptions } from './log';
import type { TooltipsOptions } from './tooltips';
import type { CursorOptions } from './cursor';
import type { SpinOptions } from './spin';
import type { RushOptions } from './rush';
import type { EvadeOptions } from './evade';
import type { ThrowsOptions } from './throws';
import type { CrowdOptions } from './crowd';
import type { DrawsOptions } from './draws';
import type { PerfOptions } from './perf';
import type { CompilesOptions } from './compiles';
import type { ProgramsOptions } from './programs';
import type { MapsOptions } from './maps';
import type { TilesOptions } from './tiles';
import type { WindingOptions } from './winding';
import type { WallOptions } from './wallGap';
import type { RimOptions } from './wallRim';
import type { BeyondOptions } from './beyond';
import type { TreesOptions } from './trees';
import type { ColumnsOptions } from './columns';
import type { ShadowsOptions } from './shadows';
import type { ShotsOptions } from './shots';
import type { WeaponsOptions } from './weapons';
import type { HandsOptions } from './hands';
import type { NeckOptions } from './neck';
import type { HoodOptions } from './hood';
import type { TurnaroundOptions } from './turnaround';
import type { HallOptions } from './hallMoves';
import type { CoatOptions } from './coat';
import type { PosesOptions } from './poses';
import type { GlanceOptions } from './glance';
import type { LiveInspect, LivePicture, LivePictured } from './live';
import type { EyesOptions } from './eyes';
import type { SwingOptions } from './swing';
import type { Fit, FitOptions } from './fitRest';

export interface SheetCommand {
  states: string[];
  views: ViewName[];
  fixture: Fixture;
  focus?: keyof Joints;
  skill?: string;
  shares?: number[];
}

/** `lab live start`: the live session's page set up (live.ts). */
export async function liveStart(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  const { start } = await import('./live');
  return start(lab, fixture);
}

/** `lab live frames`: frames run on the live session's page. */
export async function liveFrames(lab: Lab, command: { count: number }): Promise<string> {
  const { frames } = await import('./live');
  return frames(lab, command.count);
}

/** `lab live picture`: the live session's page pictured. */
export async function livePicture(lab: Lab, command: LivePicture): Promise<LivePictured> {
  const { picture } = await import('./live');
  return picture(lab, command);
}

/** `lab live inspect`: the live session's scene listed. */
export async function liveInspect(lab: Lab, command: LiveInspect): Promise<string> {
  const { inspect } = await import('./live');
  return inspect(lab, command);
}

/** `lab weapons`: each weapon pictured alone; a canary it missed is a problem. */
export async function weapons(lab: Lab, command: WeaponsOptions): Promise<Report> {
  const { weapons: picture } = await import('./weapons');
  return picture(lab, command);
}

/** `lab hands`: the hero's hand pictured alone; a canary it missed is a problem. */
export async function hands(lab: Lab, command: HandsOptions): Promise<Report> {
  const { hands: picture } = await import('./hands');
  return picture(lab, command);
}

/** `lab neck`: each hero's neck read up lines round it and pictured close; a fault past its limit, or a canary it
 *  missed, is a problem. */
export async function neck(lab: Lab, command: NeckOptions): Promise<Report> {
  const { neck: read } = await import('./neck');
  return read(lab, command);
}

/** `lab hood`: the mage's hood against its reference, its outline and its shape on the head; a size outside the
 *  reference's, a sway past its limit, or a canary it missed, is a problem. */
export async function hood(lab: Lab, command: HoodOptions): Promise<Report> {
  const { hood: read } = await import('./hood');
  return read(lab, command);
}

/** `lab turnaround`: the hero standing, pictured in the studio from a sheet's sides beside its panels; a hero not
 *  drawn, or a canary it missed, is a problem. */
export async function turnaround(lab: Lab, command: TurnaroundOptions): Promise<Report> {
  const { turnaround: picture } = await import('./turnaround');
  return picture(lab, command);
}

/** `lab poses`: the hero's pose a move at a time as digests, and what his animation took a frame; a canary missed is a
 *  problem. */
export async function poses(lab: Lab, command: PosesOptions): Promise<Report> {
  const { poses: follow } = await import('./poses');
  return follow(lab, command);
}

/** `lab coat`: the hero's skirts as he stands at idle, frame by frame; a point that jerked, or a canary it missed, is a
 *  problem. */
export async function coat(lab: Lab, command: CoatOptions): Promise<Report> {
  const { coat: follow } = await import('./coat');
  return follow(lab, command);
}

/** `lab glance`: the hero's casual look round as he stands idle; a glance out of a neck's range, too fast, jerking,
 *  in a loop, as he moves or attacks, through the eyes or before the hall's showcase, or a canary it missed, is a
 *  problem. */
export async function glance(lab: Lab, command: GlanceOptions): Promise<Report> {
  const { glance: follow } = await import('./glance');
  return follow(lab, command);
}

/** `lab hall`: the hero in focus in the hall of heroes through his showcase and after it; a point that jerked, or a
 *  canary it missed, is a problem. */
export async function hall(lab: Lab, command: HallOptions & { glow?: boolean; pictures?: boolean }): Promise<Report> {
  if (command.glow) {
    const { hallGlow } = await import('./hallGlow');
    return hallGlow(lab, { pictures: command.pictures !== false, canary: command.canary });
  }
  const { hallMoves } = await import('./hallMoves');
  return hallMoves(lab, command);
}

/** `lab match --fit`: a rest's tunable values fitted to a reference's marks. */
export async function fitRest(lab: Lab, command: FitOptions): Promise<Fit> {
  const { fitRest: fit } = await import('./fitRest');
  return fit(lab, command);
}

/** `lab sheet`: the pictures and their notes. */
export async function sheet(lab: Lab, command: SheetCommand): Promise<Sheet> {
  const { sheet: pictureSheet } = await import('./sheet');
  return pictureSheet(lab, command);
}

export interface CarryCommand {
  fixture: Fixture;
  canary?: boolean;
  /** list every frame with a clip */
  frames?: boolean;
}

/** `lab carry`: the carried bow against the body; a canary it missed is a problem. */
export async function carry(lab: Lab, command: CarryCommand): Promise<Report> {
  const { carry: carryRound, describeCarry } = await import('./carry');
  const setup = await lab.setup({ ...command.fixture, nocked: true });
  const report = await carryRound(lab, { canary: command.canary, frames: command.frames });
  const problems: string[] = [];
  if (report.canary && report.canary[0] < report.canary[1]) {
    problems.push(`the canary was caught on ${report.canary[0]} of ${report.canary[1]} planted frames`);
  }
  return { text: `${JSON.stringify(setup)}\n${describeCarry(report)}`, problems };
}

/**
 * `lab feet`: the hero's feet against the ground round the dais's edges and on level ground, the worst moments
 * pictured; a canary it missed is a problem.
 */
export async function feet(lab: Lab, command: FeetOptions): Promise<Report> {
  const { feet: feetRound, missedCanaries } = await import('./feet');
  const report = await feetRound(lab, command);
  return { text: report.lines.join('\n'), problems: missedCanaries(report), moments: report.moments };
}

/**
 * `lab range`: every joint of the hero against a body's ranges, frame by frame, over standing, walking, attacking and
 * reversals, the worst moments pictured; a canary it missed is a problem.
 */
export async function range(lab: Lab, command: RangeOptions): Promise<Report> {
  const { range: rangeRound, missedRangeCanary, lettingGo, bladeAcross, slowPose } = await import('./range');
  const report = await rangeRound(lab, command);
  // (an arm held at its stops is said, not failed, until the poses every hero is pinned in are fixed: #307)
  const problems = [...missedRangeCanary(report), ...lettingGo(report), ...bladeAcross(report), ...slowPose(report)];
  return { text: report.lines.join('\n'), problems, moments: report.moments };
}

/**
 * `lab gait`: the hero's walk judged as a person's (the time on each foot, both and neither, the steps, the hops, the
 * hips' rise and fall, the jerks) over level ground and the steps, nothing drawn, drawn and changing direction, each
 * filmed from the side.
 */
export async function gait(lab: Lab, command: GaitOptions): Promise<Report> {
  const { gait: gaitRound } = await import('./gait');
  const report = await gaitRound(lab, command);
  return { text: report.lines.join('\n'), problems: report.problems, moments: report.moments, counts: report.counts };
}

/**
 * `lab stops`: the hero coming to a stop from a run, judged as a person stops (the steps once still, a foot put out
 * and drawn back, a foot off the body's level), on level ground and by the dais's edge.
 */
export async function stops(lab: Lab, command: StopsOptions): Promise<Report> {
  const { stops: stopsRound } = await import('./stops');
  const report = await stopsRound(lab, command);
  return { text: report.lines.join('\n'), problems: [] };
}

/**
 * `lab form`: the hero's run against a runner's, with each way he holds his weapons: the stride's timing, each joint's
 * curve over the stride, stick figures of it over a runner's and the hero pictured at eight points of it; a canary it
 * missed, or a run held up, is a problem.
 */
export async function form(lab: Lab, command: FormOptions): Promise<Report> {
  const { form: formRound } = await import('./form');
  const report = await formRound(lab, command);
  return { text: report.lines.join('\n'), problems: report.problems, moments: report.moments };
}

/**
 * `lab ui`: the game's UI in its states (the lobby, a tooltip, the run's HUD with the world's labels, the choice after
 * a wave, the pause menu), each pictured whole with its boxes as shares of the window.
 */
export async function ui(lab: Lab, command: UiOptions): Promise<Report> {
  const { ui: uiRound } = await import('./ui');
  return uiRound(lab, command);
}

/**
 * `lab wind`: the loading screen's exit as it hands over to the lobby logo: the particles' picture as they rest in the
 * logo's place against the logo once the exit is done; pixels apart past the limit, or a canary missed, are problems.
 */
export async function wind(lab: Lab, command: WindOptions): Promise<Report> {
  const { windHandoff } = await import('./wind');
  return windHandoff(lab, command);
}

/**
 * `lab touch`: the touch controls' move stick pushed by a finger near and far past its edge, and the hero's speed;
 * a push further out that gives less is a problem, as is a canary it missed.
 */
export async function touch(lab: Lab, command: TouchOptions): Promise<Report> {
  const { touchStick } = await import('./touchStick');
  return touchStick(lab, command);
}

/**
 * `lab tap`: every skill of the hero's class aimed by holding, its touch button tapped (standing, at once, walking)
 * and dragged with the other thumb on the move stick; a tap off its way or its foe, a preview that doesn't follow the
 * drag, a cast away from it and a canary missed are problems.
 */
export async function tap(lab: Lab, command: TapOptions): Promise<Report> {
  const { tap: tapRounds } = await import('./tap');
  return tapRounds(lab, command);
}

/**
 * `lab practice`: each skill with a cooldown cast twice in the lobby's ways (shown, stowed, folded) and in runs
 * started from them; free casting where the lobby shows and a run's costs and cooldowns elsewhere, or a problem.
 */
export async function practice(lab: Lab, command: PracticeOptions): Promise<Report> {
  const { practice: practiceRound } = await import('./practice');
  return practiceRound(lab, command);
}

/**
 * `lab trail`: each strike cast in each view, its trail's pixels against where the weapons swept; pixels away from
 * it, a blow with no trail, its newest end off the blade, a trail while they're still and a canary missed are
 * problems.
 */
export async function trail(lab: Lab, command: TrailOptions): Promise<Report> {
  const { trail: trailRounds } = await import('./trail');
  return trailRounds(lab, command);
}

/**
 * `lab light`, one scenario: the frame drawn as the player sees it standing in a biome and a view, and how bright it
 * is as a share of the screen's white; a canary it missed is a problem.
 */
export async function light(lab: Lab, command: LightOptions): Promise<Report> {
  const { light: lightRound } = await import('./light');
  return lightRound(lab, command);
}

/**
 * `lab fire`, one biome: its fire read from beside it with its own light and without, and pictured beside it, from
 * above and in the game's views; a fire drawing nothing, standing still or blown out white, a strobe on the screen and
 * a canary missed are problems.
 */
export async function fire(lab: Lab, command: FireOptions): Promise<Report> {
  const { fire: fireRound } = await import('./fire');
  return fireRound(lab, command);
}

/** `lab envcost`, one scenario: what the environment's lookups take of the frame on the GPU, with it and without in
 *  turns; a canary missed is a problem. */
export async function envCost(lab: Lab, command: EnvCostOptions): Promise<Report> {
  const { envCost: envCostRound } = await import('./envCost');
  return envCostRound(lab, command);
}

/** `lab haze`: through the eyes, what the hero's held weapons' light takes from the frame round them; a haze and a
 *  canary missed are problems. */
export async function haze(lab: Lab, command: HazeOptions): Promise<Report> {
  const { haze: hazeRound } = await import('./haze');
  return hazeRound(lab, command);
}

/**
 * `lab spawns`: waves in each biome, and how every foe came in: its gate, its group's gates and the spot it rose on,
 * and the boss's walk to the hero from each gate; a gate left idle, a foe risen in a prop, a boss that never reached
 * the hero and a canary missed are problems.
 */
export async function spawns(lab: Lab, command: SpawnsOptions): Promise<Report> {
  const { spawns: spawnsRound } = await import('./spawns');
  return spawnsRound(lab, command);
}

/**
 * `lab health`, one scenario: the hero's Health held at shares of his most, the frame at each with the low-health look
 * and without it; blood in the middle of the view, a look above where it starts, one that drains or covers less at a
 * lower Health, and a canary missed are problems.
 */
export async function health(lab: Lab, command: HealthOptions): Promise<Report> {
  const { health: healthRound } = await import('./health');
  return healthRound(lab, command);
}

/**
 * `lab cast`: a skill cast as the player casts it in one biome and view, every frame of its effect drawn and read
 * back: its light against the budget, its flashes and the shaders compiled late.
 */
export async function cast(lab: Lab, command: CastOptions): Promise<Report> {
  const { cast: castRound } = await import('./cast');
  return castRound(lab, command);
}

/**
 * `lab draw`: each of the hero's drawn shots drawn to full and held there, the glint round its arrowhead counted every
 * frame; motes missing as it's drawn, a glint missing or gone held at full, and one with nothing drawn are problems.
 */
export async function draw(lab: Lab, command: DrawOptions): Promise<Report> {
  const { draw: drawRound } = await import('./draw');
  return drawRound(lab, command);
}

/**
 * `lab blink`: the mage's blink cast as the player casts it in each scenario, and the foes it dazes; a landing off its
 * preview, past his reach or in a prop, a blow landed while he crossed, a near foe that moved while dazed and a far
 * one that stopped are problems.
 */
export async function blink(lab: Lab, command: BlinkOptions): Promise<Report> {
  const { blink: blinkRound } = await import('./blink');
  return blinkRound(lab, command);
}

/**
 * `lab held`: each of the hero's held skills held over a foe ready and through its cooldown, its preview read as it's
 * drawn (Quarry Mark's outline in every view); a preview missing, in the wrong look or off its countdown, a release
 * that cast when it mustn't or didn't when it must, and an outline off its foe are problems.
 */
export async function held(lab: Lab, command: HeldOptions): Promise<Report> {
  const { held: heldRound } = await import('./held');
  return heldRound(lab, command);
}

/**
 * `lab death`: each skill's kills followed as they fall, thrown hard and with little to spare; a body under the floor,
 * in a prop or past the wall, posed off its points or going the wrong way, and a late shader, are problems.
 */
export async function death(lab: Lab, command: DeathOptions): Promise<Report> {
  const { death: deathRound } = await import('./death');
  return deathRound(lab, command);
}

/**
 * `lab hits`: each skill's blows as they land on foes stood where it strikes, their times and the gaps between them;
 * striking nothing, a gap past `--apart` and blows no quicker than `--than`'s are problems.
 */
export async function hits(lab: Lab, command: HitsOptions): Promise<Report> {
  const { hits: hitsOf } = await import('./hits');
  return hitsOf(lab, command);
}

/**
 * `lab log`: the battle log held to every hit the hero deals and takes as it lands: each skill's hits listed once and
 * in turn, under the skill, on the foe struck, for what it dealt, of its type; each foe's blows under its name and its
 * attack, for the life they took.
 */
export async function log(lab: Lab, command: LogOptions): Promise<Report> {
  const { log: logOf } = await import('./log');
  return logOf(lab, command);
}

/**
 * `lab tooltips`: each damage skill's tooltip held to the hits it deals the hero with modifiers of every kind: each
 * hit within a figure it states, a crit's chance the hero's, a hit over time as often as it says; and the hotbar's
 * tooltip following the hero's gear.
 */
export async function tooltips(lab: Lab, command: TooltipsOptions): Promise<Report> {
  const { tooltips: tooltipsOf } = await import('./tooltips');
  return tooltipsOf(lab, command);
}

/**
 * `lab cursor`: the cursor drawn over mouse look while Alt is held, in each close view: the view held still, the HUD
 * under it hovered, clicked and scrolled (the battle log's Pause, a hotbar slot's tooltip, the log's lines), the world
 * under it not attacked; Alt let go, mouse look again.
 */
export async function cursor(lab: Lab, command: CursorOptions): Promise<Report> {
  const { cursor: cursorRound } = await import('./cursor');
  return cursorRound(lab, command);
}

/**
 * `lab spin`: mouse look turned one way for a long while in each close view, then the other, the browser's own jump
 * under the lock sent mid-spin: no frame may turn the view far past the spin's steady turn (#318).
 */
export async function spin(lab: Lab, command: SpinOptions): Promise<Report> {
  const { spinView } = await import('./spin');
  return spinView(lab, command);
}

/**
 * `lab evade`: the shooters getting out of the hero's attacks, tried from in front of them, behind them and at a
 * ducked foe's feet; an evaded share off a half from in front, a try struck after it evaded or missed without it, a
 * blink gone wrong, and any evade from behind are problems.
 */
export async function evade(lab: Lab, command: EvadeOptions): Promise<Report> {
  const { evade: evadeRound } = await import('./evade');
  return evadeRound(lab, command);
}

/**
 * `lab throws`: what the slamming foes throw at a hero too far off to slam, a case a throw: the Brute's lava where he
 * stood, its ring and its burns, stepped off and up close; the Hulk's vine holding him, stepped aside and dashed out
 * of. A chunk landing off where he stood or its ring, a hurt he stepped off, a throw up close, a hold off its time or
 * walked out of, a catch he stepped aside from, and a dash that left him held are problems.
 */
export async function throws(lab: Lab, command: ThrowsOptions): Promise<Report> {
  const { throws: throwsRound } = await import('./throws');
  return throwsRound(lab, command);
}

/**
 * `lab rush`: Bull Rush cast through sets of foes (on its line, at its sides, killed, an elite and a boss), each
 * followed until it's still; a foe never met, left standing, carried inside the hero or ending behind or beside him,
 * a living foe left unthrown and an elite or a boss thrown are problems.
 */
export async function rush(lab: Lab, command: RushOptions): Promise<Report> {
  const { rush: rushRound } = await import('./rush');
  return rushRound(lab, command);
}

/**
 * `lab crowd`: a crowd of foes killed at once at each CPU slowdown and frame rate, each frame timed by the browser's
 * clock and the bodies' part of it; the bodies past their budget at the slowest CPU, or a canary unseen, are problems.
 */
export async function crowd(lab: Lab, command: CrowdOptions): Promise<Report> {
  const { crowd: crowdRound } = await import('./crowd');
  return crowdRound(lab, command);
}

/** `lab compiles`: a prop of every kind broken in each biome, every program compiled meanwhile a problem. */
export async function compiles(lab: Lab, command: CompilesOptions): Promise<Report> {
  const { compiles: compilesOf } = await import('./compiles');
  return compilesOf(lab, command);
}

/** `lab programs`: the programs the boot compiled, by step, by kind and what sets them apart, those never drawn. */
export async function programs(lab: Lab, command: ProgramsOptions): Promise<Report> {
  const { programs: programsOf } = await import('./programs');
  return programsOf(lab, command);
}

/** `lab maps`: each procedural map made, timed, and its pixels' digest. */
export async function maps(lab: Lab, command: MapsOptions): Promise<Report> {
  const { maps: mapsOf } = await import('./maps');
  return mapsOf(lab, command);
}

/** `lab tiles`: how big each repeated map's tile comes out on each surface of a biome. */
export async function tiles(lab: Lab, command: TilesOptions): Promise<Report> {
  const { tiles: tilesOf } = await import('./tiles');
  return tilesOf(lab, command);
}

/** `lab winding`: which way every model's and biome's faces point. */
export async function winding(lab: Lab, command: WindingOptions): Promise<Report> {
  const { winding: windingOf } = await import('./winding');
  return windingOf(lab, command);
}

/** `lab wall`: how near the hero walks up to the wall in each biome, at angles round the ring. */
export async function wall(lab: Lab, command: WallOptions): Promise<Report> {
  const { wallGap } = await import('./wallGap');
  return wallGap(lab, command);
}

/** `lab rim`: the hero walked round each biome's wall pressed into it, each way: its jumps and stuck stops. */
export async function rim(lab: Lab, command: RimOptions): Promise<Report> {
  const { wallRim } = await import('./wallRim');
  return wallRim(lab, command);
}

/** `lab beyond`: the ranger's arrows loosed over the wall at what lies beyond it, each judged where it stood. */
export async function beyond(lab: Lab, command: BeyondOptions): Promise<Report> {
  const { beyond: beyondOf } = await import('./beyond');
  return beyondOf(lab, command);
}

/** `lab trees`: every tree in the play area a wooden prop an arrow stands in; none left after a biome switch. */
export async function trees(lab: Lab, command: TreesOptions): Promise<Report> {
  const { trees: treesOf } = await import('./trees');
  return treesOf(lab, command);
}

/** `lab columns`: the crypt's broken columns roll after roll: no open edge, no cliff across a break. */
export async function columns(lab: Lab, command: ColumnsOptions): Promise<Report> {
  const { columnsCheck } = await import('./columns');
  return columnsCheck(lab, command);
}

/** `lab shadows`: the hero's shadow cast as one against his pieces cast alone, frame by frame: no pixel apart. */
export async function shadows(lab: Lab, command: ShadowsOptions): Promise<Report> {
  const { shadowsCheck } = await import('./shadows');
  return shadowsCheck(lab, command);
}

/** `lab draws`: one frame's draw calls with the crowd standing, by the geometry each drew, the most first. */
export async function draws(lab: Lab, command: DrawsOptions): Promise<Report> {
  const { draws: drawsOf } = await import('./draws');
  return drawsOf(lab, command);
}

/**
 * `lab perf`: skills cast in turn with the foes coming, every frame timed as the game's performance report times it
 * (the frame, the update by stage, the render, the GPU by pass), each phase apart; a cast never made, a shader
 * compiled as it's timed, or a canary unseen, are problems.
 */
export async function perf(lab: Lab, command: PerfOptions): Promise<Report> {
  const { perf: perfOf } = await import('./perf');
  return perfOf(lab, command);
}

/** `lab shots`: the hero's basic attack loosed over each biome's boss and the foes round it, in each view; a shot
 *  that strikes other than the first foe on its line is a problem. */
export async function shots(lab: Lab, command: ShotsOptions): Promise<Report> {
  const { shots: shotsRound } = await import('./shots');
  return shotsRound(lab, command);
}

/** `lab eyes`: a skill cast through the eyes, frame by frame, with its film; a two-hander seen in one hand, or a canary
 *  it missed, is a problem. */
export async function eyes(lab: Lab, command: EyesOptions): Promise<Report> {
  const { eyes: eyesRound } = await import('./eyes');
  return eyesRound(lab, command);
}

/** `lab swing`: the key of a swing through the eyes that holds a pose chosen in the view, what of the pose it can't
 *  hold, and where its keys put the arm; a canary it missed is a problem. */
export async function swing(lab: Lab, command: SwingOptions): Promise<Report> {
  const { swing: swingKeyed } = await import('./swing');
  return swingKeyed(lab, command);
}

/** `lab gear`: full sets rolled for every class at each tier, and what they give; a class out of order is a problem. */
export async function gear(_lab: Lab, command: GearOptions): Promise<Report> {
  const { gear: gearRound } = await import('./gear');
  return gearRound(command);
}

/**
 * `lab music`: each biome's music played through as the player hears it (its lobby, a run's waves, a hidden tab, the
 * bank back), every frame judged by what the game sends to WebAudio; a fault the judge finds, or a canary it missed,
 * is a problem.
 */
export async function music(lab: Lab, command: MusicOptions): Promise<Report> {
  const { music: musicRound } = await import('./music');
  return musicRound(lab, command);
}

/** `lab probe`'s set-up before a probe module runs (a probe may set up again as it likes). */
export function setup(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  return lab.setup(fixture);
}
