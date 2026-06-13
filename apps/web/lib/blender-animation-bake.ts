import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { AnimationActionRecord, AnimationAssetRecord, ModelRecord } from "@/lib/model-store";
import { getRiggingMetadata } from "@/lib/model-rigging";

const execFileAsync = promisify(execFile);
const publicDir = path.join(process.cwd(), "public");
const publicUploadsDir = path.join(publicDir, "uploads", "models");
const bakeVersion = "sampled-v3";

function getBlenderExecutable() {
  return process.env.CONTROL3D_BLENDER_PATH
    ?? process.env.BLENDER_PATH
    ?? "blender";
}

function resolvePublicAssetPath(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/")) {
    throw new Error("Only uploaded public assets can be baked");
  }
  const resolved = path.resolve(publicDir, fileUrl.replace(/^\//, ""));
  if (!resolved.startsWith(publicDir)) {
    throw new Error("Invalid public asset path");
  }
  return resolved;
}

function safeFileSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

function buildBakeScript() {
  return String.raw`
import argparse
import json
import math
import os
import re
import sys
import bpy
import mathutils

TARGET_BONES = {
    "hips": "Hips",
    "pelvis": "Hips",
    "root": "Hips",
    "spine": "Spine",
    "spine1": "Chest",
    "spine2": "Chest",
    "chest": "Chest",
    "upperchest": "Chest",
    "neck": "Neck",
    "head": "Head",
    "leftshoulder": "LeftUpperArm",
    "leftarm": "LeftUpperArm",
    "leftupperarm": "LeftUpperArm",
    "leftforearm": "LeftLowerArm",
    "leftlowerarm": "LeftLowerArm",
    "lefthand": "LeftHand",
    "rightshoulder": "RightUpperArm",
    "rightarm": "RightUpperArm",
    "rightupperarm": "RightUpperArm",
    "rightforearm": "RightLowerArm",
    "rightlowerarm": "RightLowerArm",
    "righthand": "RightHand",
    "leftupleg": "LeftUpperLeg",
    "leftupperleg": "LeftUpperLeg",
    "leftleg": "LeftLowerLeg",
    "leftlowerleg": "LeftLowerLeg",
    "leftfoot": "LeftFoot",
    "lefttoebase": "LeftFoot",
    "lefttoe": "LeftFoot",
    "rightupleg": "RightUpperLeg",
    "rightupperleg": "RightUpperLeg",
    "rightleg": "RightLowerLeg",
    "rightlowerleg": "RightLowerLeg",
    "rightfoot": "RightFoot",
    "righttoebase": "RightFoot",
    "righttoe": "RightFoot",
}

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_glb(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [obj for obj in bpy.context.scene.objects if obj not in before]

def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return [obj for obj in bpy.context.scene.objects if obj not in before]

def find_armature(objects=None, prefer_control3d=False):
    candidates = [obj for obj in (objects or bpy.context.scene.objects) if obj.type == "ARMATURE"]
    if prefer_control3d:
        for obj in candidates:
            if "Control3D" in obj.name or "Control3D" in obj.data.name:
                return obj
    return candidates[0] if candidates else None

def normalize_bone_name(name):
    value = name.split(":")[-1]
    value = re.sub(r"[^a-zA-Z0-9]", "", value).lower()
    value = value.replace("mixamorig", "")
    return value

def map_bone(name):
    normalized = normalize_bone_name(name)
    if normalized in TARGET_BONES:
        return TARGET_BONES[normalized]
    if normalized.startswith("left") and "arm" in normalized:
        return "LeftUpperArm"
    if normalized.startswith("right") and "arm" in normalized:
        return "RightUpperArm"
    if normalized.startswith("left") and ("leg" in normalized or "upleg" in normalized):
        return "LeftUpperLeg"
    if normalized.startswith("right") and ("leg" in normalized or "upleg" in normalized):
        return "RightUpperLeg"
    return None

def map_priority(name):
    normalized = normalize_bone_name(name)
    exact = {
        "hips": 0,
        "spine": 0,
        "spine1": 1,
        "chest": 0,
        "upperchest": 1,
        "neck": 0,
        "head": 0,
        "leftarm": 0,
        "leftupperarm": 0,
        "leftshoulder": 4,
        "leftforearm": 0,
        "leftlowerarm": 0,
        "lefthand": 0,
        "rightarm": 0,
        "rightupperarm": 0,
        "rightshoulder": 4,
        "rightforearm": 0,
        "rightlowerarm": 0,
        "righthand": 0,
        "leftupleg": 0,
        "leftupperleg": 0,
        "leftleg": 0,
        "leftlowerleg": 0,
        "leftfoot": 0,
        "rightupleg": 0,
        "rightupperleg": 0,
        "rightleg": 0,
        "rightlowerleg": 0,
        "rightfoot": 0,
    }
    return exact.get(normalized, 10)

def get_action(armature):
    if armature.animation_data and armature.animation_data.action:
        return armature.animation_data.action
    for track in armature.animation_data.nla_tracks if armature.animation_data else []:
        for strip in track.strips:
            if strip.action:
                return strip.action
    return bpy.data.actions[0] if bpy.data.actions else None

def get_action_fcurves(action):
    if hasattr(action, "fcurves"):
        return action.fcurves
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(list(getattr(channelbag, "fcurves", [])))
    return curves

def ensure_target_fcurve(action, armature, data_path, index, group_name):
    if hasattr(action, "fcurves"):
        return action.fcurves.new(
            data_path=data_path,
            index=index,
            action_group=group_name,
        )
    return action.fcurve_ensure_for_datablock(
        armature,
        data_path,
        index=index,
        group_name=group_name,
    )

def armature_height(armature):
    armature.update_from_editmode()
    points = []
    for bone in armature.data.bones:
        points.append(armature.matrix_world @ bone.head_local)
        points.append(armature.matrix_world @ bone.tail_local)
    if not points:
        return 1.0
    min_y = min(point.y for point in points)
    max_y = max(point.y for point in points)
    return max(max_y - min_y, 0.01)

def clone_keyframes(source_curve, target_curve, location_scale=1.0):
    target_curve.keyframe_points.add(len(source_curve.keyframe_points))
    for source_key, target_key in zip(source_curve.keyframe_points, target_curve.keyframe_points):
        target_key.co = (source_key.co.x, source_key.co.y * location_scale)
        target_key.interpolation = source_key.interpolation
        target_key.easing = source_key.easing
    target_curve.update()

def retarget_action(source_armature, target_armature, action_name):
    source_action = get_action(source_armature)
    if not source_action:
        raise RuntimeError("No animation action found in source FBX")

    target_bone_names = set(target_armature.pose.bones.keys())
    location_scale = max(0.02, min(2.5, armature_height(target_armature) / armature_height(source_armature)))
    target_action = bpy.data.actions.new(action_name)
    target_action.use_fake_user = True
    target_armature.animation_data_create()
    target_armature.animation_data.action = target_action

    frame_range = source_action.frame_range if hasattr(source_action, "frame_range") else source_action.curve_frame_range
    frame_start, frame_end = frame_range
    bpy.context.scene.frame_start = max(1, int(math.floor(frame_start)))
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_start + 1, int(math.ceil(frame_end)))

    source_armature.animation_data_create()
    source_armature.animation_data.action = source_action
    mapped = {}
    for source_bone in source_armature.pose.bones:
        target_name = map_bone(source_bone.name)
        if not target_name or target_name not in target_bone_names:
            continue
        priority = map_priority(source_bone.name)
        current = mapped.get(target_name)
        if current is None or priority < current[1]:
            mapped[target_name] = (source_bone.name, priority)

    if not mapped:
        raise RuntimeError("Could not map any FBX bones to the Control3D humanoid skeleton")

    for pose_bone in target_armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"

    source_rest_world = {
        source_name: source_armature.matrix_world @ source_armature.pose.bones[source_name].bone.matrix_local
        for source_name, _priority in mapped.values()
    }
    target_rest_world = {
        target_name: target_armature.matrix_world @ target_armature.pose.bones[target_name].bone.matrix_local
        for target_name in mapped.keys()
    }

    keyed = 0
    for frame in range(bpy.context.scene.frame_start, bpy.context.scene.frame_end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()

        for target_name, (source_name, _priority) in mapped.items():
            source_pose_bone = source_armature.pose.bones[source_name]
            target_pose_bone = target_armature.pose.bones[target_name]
            source_pose_world = source_armature.matrix_world @ source_pose_bone.matrix
            source_delta_world = source_pose_world @ source_rest_world[source_name].inverted()
            desired_world = source_delta_world @ target_rest_world[target_name]

            if target_name == "Hips":
                source_motion = source_pose_world.translation - source_rest_world[source_name].translation
                desired_world.translation = target_rest_world[target_name].translation + source_motion * location_scale

            target_pose_bone.matrix = target_armature.matrix_world.inverted() @ desired_world
            target_pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            if target_name == "Hips":
                target_pose_bone.keyframe_insert(data_path="location", frame=frame)
            keyed += 1

    if keyed == 0:
        raise RuntimeError("Could not key sampled animation onto the Control3D humanoid skeleton")

    for action in list(bpy.data.actions):
        if action != target_action:
            bpy.data.actions.remove(action)

    return {
        "algorithm": "sampled-world-retarget-v2",
        "mappedBones": len(mapped),
        "keyedFrames": bpy.context.scene.frame_end - bpy.context.scene.frame_start + 1,
        "keyedPoseWrites": keyed,
        "frameStart": bpy.context.scene.frame_start,
        "frameEnd": bpy.context.scene.frame_end,
        "locationScale": location_scale,
    }

def delete_objects(objects):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.ops.object.delete()

def export_glb(output_path, target_objects):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in target_objects:
        if obj.name in bpy.data.objects and obj.type in {"MESH", "ARMATURE"}:
            obj.select_set(True)
    options = {
        "filepath": output_path,
        "export_format": "GLB",
        "export_skins": True,
        "export_animations": True,
        "export_force_sampling": True,
        "export_frame_range": True,
        "export_apply": False,
    }
    try:
        bpy.ops.export_scene.gltf(**options, use_selection=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**options)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rigged", required=True)
    parser.add_argument("--animation", required=True)
    parser.add_argument("--action-name", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    clear_scene()
    target_objects = import_glb(args.rigged)
    target_armature = find_armature(target_objects, prefer_control3d=True)
    if not target_armature:
        raise RuntimeError("Rigged character GLB does not contain an armature")

    source_objects = import_fbx(args.animation)
    source_armature = find_armature(source_objects)
    if not source_armature:
        raise RuntimeError("Animation FBX does not contain an armature")

    report = retarget_action(source_armature, target_armature, args.action_name)
    delete_objects(source_objects)
    export_glb(args.output, target_objects)
    if not os.path.exists(args.output):
        raise RuntimeError("Blender did not create baked animation GLB")

    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle)

if __name__ == "__main__":
    main()
`;
}

export async function bakeAnimationAction(input: {
  action: AnimationActionRecord;
  animation: AnimationAssetRecord;
  animationSourcePath: string;
  character: ModelRecord;
}) {
  const rigging = getRiggingMetadata(input.character);
  if (!rigging.riggedModelUrl) {
    throw new Error("Selected character has no rigged GLB. Run auto-rig first.");
  }

  const characterDir = path.join(publicUploadsDir, input.character.id);
  const outputDir = path.join(characterDir, "animations");
  await mkdir(outputDir, { recursive: true });

  const outputName = `${safeFileSegment(input.animation.id)}-${safeFileSegment(input.action.id)}-${bakeVersion}.glb`;
  const outputPath = path.join(outputDir, outputName);
  const outputUrl = `/uploads/models/${input.character.id}/animations/${outputName}`;
  const reportPath = path.join(outputDir, `${path.basename(outputName, ".glb")}.json`);
  const scriptPath = path.join(outputDir, "control3d-animation-bake.py");

  if (existsSync(outputPath) && existsSync(reportPath)) {
    return {
      outputPath,
      outputUrl,
      report: existsSync(reportPath) ? reportPath : null,
      cached: true,
      stdout: "",
      stderr: "",
    };
  }

  await writeFile(scriptPath, buildBakeScript(), "utf8");

  try {
    const result = await execFileAsync(
      getBlenderExecutable(),
      [
        "--background",
        "--factory-startup",
        "--python",
        scriptPath,
        "--",
        "--rigged",
        resolvePublicAssetPath(rigging.riggedModelUrl),
        "--animation",
        input.animationSourcePath,
        "--action-name",
        input.action.name,
        "--output",
        outputPath,
        "--report",
        reportPath,
      ],
      {
        timeout: 180000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 12,
      },
    );

    if (!existsSync(outputPath)) {
      throw new Error("Blender finished but did not create animation GLB");
    }

    return {
      outputPath,
      outputUrl,
      report: reportPath,
      cached: false,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    await Promise.all([
      rm(outputPath, { force: true }).catch(() => undefined),
      rm(reportPath, { force: true }).catch(() => undefined),
    ]);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Blender executable not found. Set CONTROL3D_BLENDER_PATH or BLENDER_PATH to your blender.exe path.",
      );
    }
    throw error;
  }
}
