import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultTargetHeight = 1.85;
const defaultOversizeRatio = 8;

export type SourceScaleNormalizationResult = {
  deliveryFileSize: number;
  outputPath: string;
  recommendedSourceScale: number;
  report: {
    normalizedBounds: {
      max: [number, number, number];
      min: [number, number, number];
      size: [number, number, number];
    } | null;
    rawBounds: {
      max: [number, number, number];
      min: [number, number, number];
      size: [number, number, number];
    };
    rawHeight: number;
    scaleFactor: number;
    sourceFormat: string;
    targetHeight: number;
  };
  stderr: string;
  stdout: string;
};

function getBlenderExecutable() {
  const configured = process.env.CONTROL3D_BLENDER_PATH ?? process.env.BLENDER_PATH;
  if (configured) return configured;

  const candidates = [
    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "blender";
}

function buildNormalizeScript() {
  return String.raw`
import argparse
import json
import os
import sys
import bpy
from mathutils import Vector

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_source(source_path, source_format):
    before = set(bpy.context.scene.objects)
    if source_format == "fbx":
        bpy.ops.import_scene.fbx(filepath=source_path, automatic_bone_orientation=False)
    elif source_format == "obj":
        bpy.ops.wm.obj_import(filepath=source_path)
    else:
        bpy.ops.import_scene.gltf(filepath=source_path)
    return [obj for obj in bpy.context.scene.objects if obj not in before]

def mesh_bounds(objects):
    points = []
    imported = set(objects)
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        for obj in objects:
            if obj.type == "ARMATURE":
                for bone in obj.data.bones:
                    points.append(obj.matrix_world @ bone.head_local)
                    points.append(obj.matrix_world @ bone.tail_local)
    if not points:
        raise RuntimeError("Imported source has no mesh or armature bounds")
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    size = maximum - minimum
    return {
        "min": [minimum.x, minimum.y, minimum.z],
        "max": [maximum.x, maximum.y, maximum.z],
        "size": [size.x, size.y, size.z],
    }

def top_level_imports(objects):
    imported = set(objects)
    roots = []
    for obj in objects:
        parent = obj.parent
        if parent is None or parent not in imported:
            roots.append(obj)
    return roots or objects

def tuple3(values):
    return [round(float(value), 6) for value in values]

def export_glb(output_path, objects):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.name in bpy.data.objects and obj.type in {"MESH", "ARMATURE", "EMPTY"}:
            obj.select_set(True)
    options = {
        "filepath": output_path,
        "export_format": "GLB",
        "export_skins": True,
        "export_animations": True,
        "export_apply": False,
    }
    try:
        bpy.ops.export_scene.gltf(**options, use_selection=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**options)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-format", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--target-height", required=True, type=float)
    parser.add_argument("--oversize-ratio", required=True, type=float)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    clear_scene()
    objects = import_source(args.source, args.source_format)
    bpy.context.view_layer.update()
    raw_bounds = mesh_bounds(objects)
    raw_size = raw_bounds["size"]
    raw_height = raw_size[2] if raw_size[2] > 0 else max(raw_size)
    scale_factor = args.target_height / raw_height if raw_height > 0 else 1.0
    if raw_height <= args.target_height * args.oversize_ratio:
        with open(args.report, "w", encoding="utf-8") as handle:
            json.dump({
                "skipped": True,
                "reason": "source_scale_within_target_range",
                "rawBounds": {"min": tuple3(raw_bounds["min"]), "max": tuple3(raw_bounds["max"]), "size": tuple3(raw_bounds["size"])},
                "rawHeight": raw_height,
                "scaleFactor": scale_factor,
                "sourceFormat": args.source_format,
                "targetHeight": args.target_height,
            }, handle)
        return

    for obj in top_level_imports(objects):
        obj.scale = obj.scale * scale_factor
    bpy.context.view_layer.update()
    normalized_bounds = mesh_bounds(objects)
    export_glb(args.output, objects)
    if not os.path.exists(args.output):
        raise RuntimeError("Blender did not create normalized GLB")

    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump({
            "skipped": False,
            "rawBounds": {"min": tuple3(raw_bounds["min"]), "max": tuple3(raw_bounds["max"]), "size": tuple3(raw_bounds["size"])},
            "normalizedBounds": {"min": tuple3(normalized_bounds["min"]), "max": tuple3(normalized_bounds["max"]), "size": tuple3(normalized_bounds["size"])},
            "rawHeight": raw_height,
            "scaleFactor": scale_factor,
            "sourceFormat": args.source_format,
            "targetHeight": args.target_height,
        }, handle)

if __name__ == "__main__":
    main()
`;
}

export async function normalizeOversizedSourceWithBlender(input: {
  outputPath: string;
  reportPath: string;
  scriptPath: string;
  sourceFormat: "fbx" | "gltf" | "obj";
  sourcePath: string;
  targetHeight?: number;
  oversizeRatio?: number;
}): Promise<SourceScaleNormalizationResult | null> {
  const targetHeight = input.targetHeight ?? defaultTargetHeight;
  const oversizeRatio = input.oversizeRatio ?? defaultOversizeRatio;
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(input.scriptPath, buildNormalizeScript(), "utf8"),
  );

  const result = await execFileAsync(
    getBlenderExecutable(),
    [
      "--background",
      "--factory-startup",
      "--python",
      input.scriptPath,
      "--",
      "--source",
      input.sourcePath,
      "--source-format",
      input.sourceFormat,
      "--output",
      input.outputPath,
      "--report",
      input.reportPath,
      "--target-height",
      String(targetHeight),
      "--oversize-ratio",
      String(oversizeRatio),
    ],
    {
      timeout: 180000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 12,
    },
  );

  const report = JSON.parse(await readFile(input.reportPath, "utf8")) as
    | ({ skipped: true; reason?: string; rawHeight?: number; scaleFactor?: number })
    | SourceScaleNormalizationResult["report"];

  if ("skipped" in report && report.skipped) return null;
  if (!existsSync(input.outputPath)) {
    throw new Error("Blender finished but did not create normalized GLB");
  }

  const stats = await import("node:fs/promises").then(({ stat }) =>
    stat(input.outputPath),
  );
  const normalizedReport = report as SourceScaleNormalizationResult["report"];
  return {
    deliveryFileSize: stats.size,
    outputPath: input.outputPath,
    recommendedSourceScale: normalizedReport.scaleFactor,
    report: normalizedReport,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
