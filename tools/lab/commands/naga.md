# `lab naga`

Every shader module the page's WebGPU devices made by the lobby (the engine's own, its looks joined and the ones
alone, three's for the overlays) checked as Firefox's WebGPU takes each pipeline's stage of it. Chrome compiles WGSL
with Tint; Firefox with naga (wgpu's), which refuses some WGSL Tint compiles, so a module naga refuses draws in every
page the lab boots and in no player's Firefox. From report V1T3-G00X (Firefox 160 on Windows, #938): the meadow
blades' module was refused at every level, the village drawn without its grass, and nothing in the lab could see it.

```bash
npm run lab -- naga                       # the boot's modules: none may be refused
npm run lab -- naga --ab=<commit>         # beside another build: cf64e59 reads the report's own refusal
npm run lab -- naga --canary              # the canary's refusal counted as the page's: must fail
```

What it does to each module (`tools/lab/naga`, a Rust program of naga's, built by cargo into `out/naga/target` the
first time, 36 s here, and again only when it changes):

- read and validated, as `createShaderModule` does;
- each entry point, with each set of constants a pipeline gave the module (the lab's page script notes them,
  `shaderCodes` in `node/gpuScripts.mjs`) and with its defaults, put through naga's pass over the pipeline's
  constants (`process_overrides`), which wgpu runs on every stage of a module that has one: where #938's fault was;
- written as HLSL, MSL (2.4, as for a Metal 3 device) and SPIR-V: Firefox's on Windows, macOS and Linux.

The engine's lit shader is made two ways (Bulwark's `lit_source`, `PLAIN_ONLY`), and a boot makes one; each lit
module is checked made the other way too, so one boot checks the plain levels' and the others'. Its modules are
named by the game's shader where the engine gives one (`lit with hooks 14 (meadow-blades)`); the plain levels'
modules have no id in their label.

Its canary (`tools/lab/naga/canary.wgsl`, the shape #938 fixed in 15 lines) is checked on every run and must be
refused: a checker that refuses it no more checks nothing. The modules as checked stay in `out/naga/<side>` for a
look at what was refused.

What it can't say: Firefox's naga is its own version (wgpu's in that Firefox), not this one's 30.0.2, which is the
engine's; and the backends are given naga's default options, not every one wgpu sets for a device. A refusal here
is one to fix; none here isn't proof Firefox draws it. It needs cargo on the PATH.

On 2026-11-25: main after #938, 36 modules, 43 checked, 252 stages, none refused, in 46 s with its own boot; `cf64e59`
(the report's build) refused the blades' module in 16 stages, `vertex_hook`'s expression at 24299..24316 as the
report says.
