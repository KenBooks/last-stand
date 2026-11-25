//! `lab naga`'s checker: each shader module the page made, as Firefox's WebGPU (wgpu and naga) takes a pipeline's
//! stage of it. Chrome compiles WGSL with Tint, so a module naga refuses draws there and nowhere in the lab: the
//! meadow blades' module was refused in Firefox at every level, the village drawn without its grass (report
//! V1T3-G00X, #938). Each stage is read, validated, put through naga's pass over the pipeline's constants (which wgpu
//! runs on every stage of a module that has one) and written as HLSL, MSL and SPIR-V (Firefox's on Windows, macOS
//! and Linux).
//!
//! Its folder (the one argument) holds `list.txt`, a line a module (`<file>\t<label>`), each module's WGSL in
//! `<file>.wgsl` and the constants its pipelines were made with in `<file>.sets`, a line a set (`NAME=value,...`, an
//! empty line the shader's own defaults). It prints a line a fault (`fault\t<label>\t<entry>\t<constants>\t<step>\t
//! <what naga said>`) and a last line of what it checked (`checked\t<modules>\t<stages>`).
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use naga::back::pipeline_constants::process_overrides;
use naga::back::PipelineConstants;
use naga::valid::{Capabilities, ModuleInfo, ValidationFlags, Validator};
use naga::{Module, ShaderStage};

/// The most of what naga said kept on a fault's line.
const SAID_MOST: usize = 500;

/// The Metal shading language wgpu writes for a device of Metal 3's (macOS 13 on): naga's default, 1.0, has neither
/// an instance's number nor `@invariant`, and refused every stage of the lit shader.
const MSL_VERSION: (u8, u8) = (2, 4);

/// The engine's lit shaders' two makings (Bulwark's `lit_source`): each module made one way is checked made the
/// other way too, so a boot at one level checks the other's.
const MAKINGS: [(&str, &str); 2] = [("const PLAIN_ONLY = false;", "const PLAIN_ONLY = true;"),
    ("const PLAIN_ONLY = true;", "const PLAIN_ONLY = false;")];

/// A module as the page made it: its label and its WGSL, and the constants its pipelines were made with.
struct Made {
    label: String,
    code: String,
    sets: Vec<String>,
}

/// A stage that failed: where, and what naga said.
struct Fault {
    label: String,
    entry: String,
    constants: String,
    step: &'static str,
    said: String,
}

/// What was checked: the modules and their stages, and what failed.
#[derive(Default)]
struct Checked {
    modules: usize,
    stages: usize,
    faults: Vec<Fault>,
}

/// What naga said, on one line and cut to `SAID_MOST`.
fn one_line(said: impl std::fmt::Debug) -> String {
    let text = format!("{said:?}").replace(['\n', '\t'], " ");
    text.chars().take(SAID_MOST).collect()
}

/// The modules listed in `folder`.
fn read_folder(folder: &Path) -> Vec<Made> {
    let list = fs::read_to_string(folder.join("list.txt")).expect("list.txt in the folder");
    let mut made = Vec::new();
    for line in list.lines().filter(|line| !line.is_empty()) {
        let (file, label) = line.split_once('\t').unwrap_or((line, line));
        let code = fs::read_to_string(folder.join(format!("{file}.wgsl"))).expect("each module's WGSL");
        let sets_text = fs::read_to_string(folder.join(format!("{file}.sets"))).unwrap_or_default();
        let sets = sets_text.lines().map(str::to_string).collect();
        made.push(Made { label: label.to_string(), code, sets });
    }
    made
}

/// A set's line as naga's pipeline constants.
fn constants_of(set: &str) -> PipelineConstants {
    let mut constants = PipelineConstants::default();
    for pair in set.split(',').filter(|pair| !pair.is_empty()) {
        if let Some((name, value)) = pair.split_once('=') {
            constants.insert(name.trim().to_string(), value.trim().parse().unwrap_or(0.0));
        }
    }
    constants
}

/// `made`'s WGSL and each other making of it: (a label's suffix, the code).
fn makings(made: &Made) -> Vec<(String, String)> {
    let mut all = vec![(String::new(), made.code.clone())];
    for (from, to) in MAKINGS {
        if made.code.contains(from) {
            all.push((format!(" (made with `{to}`)"), made.code.replace(from, to)));
        }
    }
    all
}

/// The constants sets a module's stages are checked with: its pipelines' own, and its defaults.
fn sets_of(made: &Made) -> BTreeSet<String> {
    let mut sets: BTreeSet<String> = made.sets.iter().cloned().collect();
    sets.insert(String::new());
    sets
}

/// A stage written by each of Firefox's backends: the first that fails, and what it said.
fn written(module: &Module, info: &ModuleInfo, stage: ShaderStage, entry: &str) -> Option<(&'static str, String)> {
    let hlsl_options = naga::back::hlsl::Options::default();
    let hlsl_pipeline = naga::back::hlsl::PipelineOptions { entry_point: Some((stage, entry.to_string())) };
    let mut hlsl = String::new();
    let mut writer = naga::back::hlsl::Writer::new(&mut hlsl, &hlsl_options, &hlsl_pipeline);
    if let Err(error) = writer.write(module, info, None) {
        return Some(("HLSL (Windows)", one_line(error)));
    }
    let msl_pipeline = naga::back::msl::PipelineOptions {
        entry_point: Some((stage, entry.to_string())),
        ..Default::default()
    };
    let msl_options = naga::back::msl::Options { lang_version: MSL_VERSION, ..Default::default() };
    if let Err(error) = naga::back::msl::write_string(module, info, &msl_options, &msl_pipeline) {
        return Some(("MSL (macOS)", one_line(error)));
    }
    let spv_pipeline = naga::back::spv::PipelineOptions { shader_stage: stage, entry_point: entry.to_string() };
    let spv_options = naga::back::spv::Options::default();
    if let Err(error) = naga::back::spv::write_vec(module, info, &spv_options, Some(&spv_pipeline)) {
        return Some(("SPIR-V (Linux)", one_line(error)));
    }
    None
}

/// Each stage of `code` with each of `sets` checked into `checked`.
fn check_module(label: &str, code: &str, sets: &BTreeSet<String>, checked: &mut Checked) {
    let fault = |entry: &str, constants: &str, step: &'static str, said: String| Fault {
        label: label.to_string(),
        entry: entry.to_string(),
        constants: constants.to_string(),
        step,
        said,
    };
    checked.modules += 1;
    let module = match naga::front::wgsl::parse_str(code) {
        Ok(module) => module,
        Err(error) => {
            checked.faults.push(fault("", "", "read", one_line(error.emit_to_string(code))));
            return;
        }
    };
    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::all());
    let info = match validator.validate(&module) {
        Ok(info) => info,
        Err(error) => {
            checked.faults.push(fault("", "", "validated", one_line(error.emit_to_string(code))));
            return;
        }
    };
    for entry in &module.entry_points {
        for set in sets {
            checked.stages += 1;
            let constants = constants_of(set);
            let processed = process_overrides(&module, &info, Some((entry.stage, &entry.name)), &constants);
            let (stage_module, stage_info) = match processed {
                Ok(processed) => processed,
                Err(error) => {
                    checked.faults.push(fault(&entry.name, set, "its constants (naga's pass)", one_line(error)));
                    continue;
                }
            };
            if let Some((step, said)) = written(&stage_module, &stage_info, entry.stage, &entry.name) {
                checked.faults.push(fault(&entry.name, set, step, said));
            }
        }
    }
}

fn main() {
    let folder = std::env::args().nth(1).expect("the folder of modules (tools/lab/commands/naga.md)");
    let mut checked = Checked::default();
    for made in read_folder(Path::new(&folder)) {
        let sets = sets_of(&made);
        for (suffix, code) in makings(&made) {
            check_module(&format!("{}{suffix}", made.label), &code, &sets, &mut checked);
        }
    }
    for fault in &checked.faults {
        let shown = if fault.constants.is_empty() { "defaults" } else { &fault.constants };
        println!("fault\t{}\t{}\t{}\t{}\t{}", fault.label, fault.entry, shown, fault.step, fault.said);
    }
    println!("checked\t{}\t{}", checked.modules, checked.stages);
}
