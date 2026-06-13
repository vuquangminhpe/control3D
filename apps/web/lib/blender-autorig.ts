import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ModelRecord } from "@/lib/model-store";
import type { RigMarker } from "@/lib/model-rigging";

const execFileAsync = promisify(execFile);
export type RiggingPreviewView = "front" | "left" | "right" | "back";
const riggingPreviewViews = new Set<RiggingPreviewView>(["front", "left", "right", "back"]);

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, "app"))
  ? cwd
  : path.join(cwd, "apps", "web");
const publicDir = path.join(appRoot, "public");
const publicUploadsDir = path.join(publicDir, "uploads", "models");

function getBlenderExecutable() {
  return process.env.CONTROL3D_BLENDER_PATH || process.env.BLENDER_PATH || "blender";
}

function resolvePublicAssetPath(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/models/")) {
    throw new Error("Auto-rig source must be a local uploaded model asset");
  }

  const resolved = path.resolve(publicDir, fileUrl.replace(/^\//, ""));
  const uploadsRoot = path.resolve(publicUploadsDir);
  if (!resolved.startsWith(uploadsRoot)) {
    throw new Error("Resolved model path is outside the uploads directory");
  }

  return resolved;
}

function getSourceFormat(model: ModelRecord) {
  const original = model.originalFilename.toLowerCase();
  if (original.endsWith(".fbx")) return "fbx";
  if (original.endsWith(".obj")) return "obj";
  if (original.endsWith(".glb") || original.endsWith(".gltf")) return "gltf";
  if (model.format === "fbx" || model.format === "obj" || model.format === "glb" || model.format === "gltf") {
    return model.format === "glb" ? "gltf" : model.format;
  }
  return "gltf";
}

export function normalizeRiggingPreviewView(view: unknown): RiggingPreviewView {
  return typeof view === "string" && riggingPreviewViews.has(view as RiggingPreviewView)
    ? (view as RiggingPreviewView)
    : "front";
}

function buildBlenderScript() {
  return String.raw`
import argparse
import json
import mathutils
import os
import sys
import bpy

def marker(markers, name):
    value = markers.get(name)
    if value is None:
        raise RuntimeError(f"Missing marker: {name}")
    return mathutils.Vector((float(value[0]), float(value[1]), float(value[2])))

def midpoint(a, b):
    return (a + b) * 0.5

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_source(source_path, source_format):
    if source_format == "fbx":
        bpy.ops.import_scene.fbx(filepath=source_path)
    elif source_format == "obj":
        bpy.ops.wm.obj_import(filepath=source_path)
    else:
        bpy.ops.import_scene.gltf(filepath=source_path)

def collect_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def collect_armatures():
    return [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]

def add_bone(edit_bones, name, head, tail, parent=None):
    bone = edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if (bone.tail - bone.head).length < 0.025:
        bone.tail.y += 0.08
    if parent is not None:
        bone.parent = parent
        bone.use_connect = False
    return bone

def create_armature(markers):
    hips = marker(markers, "groin")
    chest = marker(markers, "chest")
    chin = marker(markers, "chin")
    left_shoulder = marker(markers, "leftShoulder")
    right_shoulder = marker(markers, "rightShoulder")
    left_elbow = marker(markers, "leftElbow")
    right_elbow = marker(markers, "rightElbow")
    left_wrist = marker(markers, "leftWrist")
    right_wrist = marker(markers, "rightWrist")
    left_hand = marker(markers, "leftHand")
    right_hand = marker(markers, "rightHand")
    left_knee = marker(markers, "leftKnee")
    right_knee = marker(markers, "rightKnee")
    left_ankle = marker(markers, "leftAnkle")
    right_ankle = marker(markers, "rightAnkle")
    left_foot = marker(markers, "leftFoot")
    right_foot = marker(markers, "rightFoot")

    neck = midpoint(chest, chin)
    mid_spine = hips.lerp(chest, 0.48)
    head_direction = chin - neck
    if head_direction.length < 0.001:
        head_direction = mathutils.Vector((0.0, 0.0, 1.0))
    head_top = chin + head_direction.normalized() * max(head_direction.length * 0.45, 0.08)
    left_hip = midpoint(hips, left_knee)
    right_hip = midpoint(hips, right_knee)

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    armature = bpy.context.object
    armature.name = "Control3D_Humanoid_Rig"
    armature.data.name = "Control3D_Humanoid_Armature"

    edit_bones = armature.data.edit_bones
    edit_bones.remove(edit_bones[0])

    hips_bone = add_bone(edit_bones, "Hips", hips, mid_spine)
    spine = add_bone(edit_bones, "Spine", mid_spine, chest, hips_bone)
    chest_bone = add_bone(edit_bones, "Chest", chest, neck, spine)
    neck_bone = add_bone(edit_bones, "Neck", neck, chin, chest_bone)
    add_bone(edit_bones, "Head", chin, head_top, neck_bone)

    l_upper_arm = add_bone(edit_bones, "LeftUpperArm", left_shoulder, left_elbow, chest_bone)
    l_lower_arm = add_bone(edit_bones, "LeftLowerArm", left_elbow, left_wrist, l_upper_arm)
    add_bone(edit_bones, "LeftHand", left_wrist, left_hand, l_lower_arm)
    r_upper_arm = add_bone(edit_bones, "RightUpperArm", right_shoulder, right_elbow, chest_bone)
    r_lower_arm = add_bone(edit_bones, "RightLowerArm", right_elbow, right_wrist, r_upper_arm)
    add_bone(edit_bones, "RightHand", right_wrist, right_hand, r_lower_arm)

    l_upper_leg = add_bone(edit_bones, "LeftUpperLeg", left_hip, left_knee, hips_bone)
    l_lower_leg = add_bone(edit_bones, "LeftLowerLeg", left_knee, left_ankle, l_upper_leg)
    add_bone(edit_bones, "LeftFoot", left_ankle, left_foot, l_lower_leg)
    r_upper_leg = add_bone(edit_bones, "RightUpperLeg", right_hip, right_knee, hips_bone)
    r_lower_leg = add_bone(edit_bones, "RightLowerLeg", right_knee, right_ankle, r_upper_leg)
    add_bone(edit_bones, "RightFoot", right_ankle, right_foot, r_lower_leg)

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature

def bind_meshes(armature, meshes):
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

def delete_source_armatures(keep_armature):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.context.scene.objects):
        if obj.type == "ARMATURE" and obj != keep_armature:
            obj.select_set(True)
    if any(obj.select_get() for obj in bpy.context.scene.objects):
        bpy.ops.object.delete()

def distance_to_segment(point, start, end):
    segment = end - start
    length_sq = segment.length_squared
    if length_sq <= 0.000001:
        return (point - start).length
    t = max(0.0, min(1.0, (point - start).dot(segment) / length_sq))
    closest = start + segment * t
    return (point - closest).length

def bone_segments(markers):
    hips = marker(markers, "groin")
    chest = marker(markers, "chest")
    chin = marker(markers, "chin")
    left_shoulder = marker(markers, "leftShoulder")
    right_shoulder = marker(markers, "rightShoulder")
    left_elbow = marker(markers, "leftElbow")
    right_elbow = marker(markers, "rightElbow")
    left_wrist = marker(markers, "leftWrist")
    right_wrist = marker(markers, "rightWrist")
    left_hand = marker(markers, "leftHand")
    right_hand = marker(markers, "rightHand")
    left_knee = marker(markers, "leftKnee")
    right_knee = marker(markers, "rightKnee")
    left_ankle = marker(markers, "leftAnkle")
    right_ankle = marker(markers, "rightAnkle")
    left_foot = marker(markers, "leftFoot")
    right_foot = marker(markers, "rightFoot")
    neck = midpoint(chest, chin)
    mid_spine = hips.lerp(chest, 0.48)
    head_direction = chin - neck
    if head_direction.length < 0.001:
        head_direction = mathutils.Vector((0.0, 0.0, 1.0))
    head_top = chin + head_direction.normalized() * max(head_direction.length * 0.45, 0.08)
    left_hip = midpoint(hips, left_knee)
    right_hip = midpoint(hips, right_knee)

    return [
        ("Hips", hips, mid_spine),
        ("Spine", mid_spine, chest),
        ("Chest", chest, neck),
        ("Neck", neck, chin),
        ("Head", chin, head_top),
        ("LeftUpperArm", left_shoulder, left_elbow),
        ("LeftLowerArm", left_elbow, left_wrist),
        ("LeftHand", left_wrist, left_hand),
        ("RightUpperArm", right_shoulder, right_elbow),
        ("RightLowerArm", right_elbow, right_wrist),
        ("RightHand", right_wrist, right_hand),
        ("LeftUpperLeg", left_hip, left_knee),
        ("LeftLowerLeg", left_knee, left_ankle),
        ("LeftFoot", left_ankle, left_foot),
        ("RightUpperLeg", right_hip, right_knee),
        ("RightLowerLeg", right_knee, right_ankle),
        ("RightFoot", right_ankle, right_foot),
    ]

def mesh_has_skin(mesh, armature):
    has_modifier = any(mod.type == "ARMATURE" and mod.object == armature for mod in mesh.modifiers)
    if not has_modifier:
        return False
    control_bones = set(armature.data.bones.keys())
    group_lookup = {
        group.index: group.name
        for group in mesh.vertex_groups
        if group.name in control_bones
    }
    if not group_lookup:
        return False
    for vertex in mesh.data.vertices:
        for group in vertex.groups:
            if group.group in group_lookup and group.weight > 0.001:
                return True
    return False

def normalize_control_weights(armature, meshes):
    control_bones = set(armature.data.bones.keys())
    for mesh in meshes:
        control_groups = [
            group
            for group in mesh.vertex_groups
            if group.name in control_bones
        ]
        if not control_groups:
            continue
        for vertex in mesh.data.vertices:
            total = 0.0
            weights = []
            for group in vertex.groups:
                vertex_group = mesh.vertex_groups[group.group]
                if vertex_group.name not in control_bones:
                    continue
                weights.append((vertex_group, group.weight))
                total += group.weight
            if total <= 0.000001:
                continue
            for vertex_group, weight in weights:
                vertex_group.add([vertex.index], weight / total, "REPLACE")
        mesh.data.update()

def bind_meshes_with_safe_fallback(armature, meshes, markers):
    bind_meshes(armature, meshes)
    normalize_control_weights(armature, meshes)
    failed_meshes = [mesh for mesh in meshes if not mesh_has_skin(mesh, armature)]
    if failed_meshes:
        ensure_manual_skin_weights(armature, failed_meshes, markers)
        normalize_control_weights(armature, failed_meshes)
    return {
        "automatic": len(meshes) - len(failed_meshes),
        "manualFallback": len(failed_meshes),
    }

def ensure_manual_skin_weights(armature, meshes, markers):
    segments = bone_segments(markers)
    segment_lookup = {name: (start, end) for name, start, end in segments}

    def nearest_name(world, candidates):
        ranked = sorted(
            ((distance_to_segment(world, segment_lookup[name][0], segment_lookup[name][1]), name) for name in candidates if name in segment_lookup),
            key=lambda entry: entry[0],
        )
        return ranked[0][1] if ranked else "Hips"

    def candidate_bones(world):
        nearest = nearest_name(world, list(segment_lookup.keys()))
        if nearest == "LeftHand":
            return ["LeftHand", "LeftLowerArm"]
        if nearest == "RightHand":
            return ["RightHand", "RightLowerArm"]
        if nearest == "LeftLowerArm":
            return ["LeftLowerArm", "LeftUpperArm", "LeftHand"]
        if nearest == "RightLowerArm":
            return ["RightLowerArm", "RightUpperArm", "RightHand"]
        if nearest == "LeftUpperArm":
            return ["LeftUpperArm", "LeftLowerArm", "Chest"]
        if nearest == "RightUpperArm":
            return ["RightUpperArm", "RightLowerArm", "Chest"]
        if nearest == "LeftFoot":
            return ["LeftFoot", "LeftLowerLeg"]
        if nearest == "RightFoot":
            return ["RightFoot", "RightLowerLeg"]
        if nearest == "LeftLowerLeg":
            return ["LeftLowerLeg", "LeftUpperLeg", "LeftFoot"]
        if nearest == "RightLowerLeg":
            return ["RightLowerLeg", "RightUpperLeg", "RightFoot"]
        if nearest == "LeftUpperLeg":
            return ["LeftUpperLeg", "LeftLowerLeg", "Hips"]
        if nearest == "RightUpperLeg":
            return ["RightUpperLeg", "RightLowerLeg", "Hips"]
        if nearest in {"Neck", "Head"}:
            return ["Chest", "Neck", "Head"]
        return ["Hips", "Spine", "Chest", "Neck"]

    for mesh in meshes:
        for modifier in list(mesh.modifiers):
            if modifier.type == "ARMATURE":
                mesh.modifiers.remove(modifier)
        for group in list(mesh.vertex_groups):
            mesh.vertex_groups.remove(group)
        groups = {name: mesh.vertex_groups.new(name=name) for name, _start, _end in segments}

        for vertex in mesh.data.vertices:
            world = mesh.matrix_world @ vertex.co
            candidates = candidate_bones(world)
            ranked = sorted(
                ((distance_to_segment(world, segment_lookup[name][0], segment_lookup[name][1]), name) for name in candidates),
                key=lambda entry: entry[0],
            )
            weighted = []
            for distance, name in ranked[:3]:
                weighted.append((1.0 / max(distance * distance, 0.0009), name))
            total_weight = sum(weight for weight, _name in weighted)
            first = True
            for weight, name in weighted:
                normalized = max(0.0, min(1.0, weight / total_weight))
                if normalized < 0.035:
                    continue
                groups[name].add([vertex.index], normalized, "REPLACE" if first else "ADD")
                first = False

        modifier = mesh.modifiers.new("Control3D_Humanoid_Armature", "ARMATURE")
        modifier.object = armature
        mesh.parent = armature
        mesh.matrix_parent_inverse = armature.matrix_world.inverted() @ mesh.matrix_world
        mesh.data.update()

def set_pose_rotation(armature, bone_name, frame, rotation):
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        return
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler = rotation
    pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)

def set_pose_location(armature, bone_name, frame, location):
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        return
    pose_bone.location = location
    pose_bone.keyframe_insert(data_path="location", frame=frame)

def begin_rig_action(armature, name, frame_end=72):
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frame_end
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")

    action = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = action

    neutral = mathutils.Euler((0.0, 0.0, 0.0), "XYZ")
    for bone_name in armature.pose.bones.keys():
        set_pose_rotation(armature, bone_name, 1, neutral)
        set_pose_rotation(armature, bone_name, frame_end, neutral)
    set_pose_location(armature, "Hips", 1, mathutils.Vector((0.0, 0.0, 0.0)))
    set_pose_location(armature, "Hips", frame_end, mathutils.Vector((0.0, 0.0, 0.0)))
    return action

def finish_rig_action(armature, action):
    action.use_fake_user = True
    if armature.animation_data is not None:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)

def stride_pose(armature, frame, side=1.0, intensity=1.0, bounce=0.0):
    set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, bounce)))
    set_pose_rotation(armature, "Hips", frame, mathutils.Euler((0.0, 0.0, 0.06 * side * intensity), "XYZ"))
    set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.05 * intensity, 0.12 * side * intensity, -0.05 * side * intensity), "XYZ"))
    set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.03 * intensity, -0.10 * side * intensity, 0.04 * side * intensity), "XYZ"))
    set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((-0.55 * side * intensity, 0.0, -0.18 * intensity), "XYZ"))
    set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((-0.24 * side * intensity, 0.0, -0.42 * intensity), "XYZ"))
    set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((0.55 * side * intensity, 0.0, 0.18 * intensity), "XYZ"))
    set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.24 * side * intensity, 0.0, 0.42 * intensity), "XYZ"))
    set_pose_rotation(armature, "LeftUpperLeg", frame, mathutils.Euler((0.62 * side * intensity, 0.0, 0.03 * side), "XYZ"))
    set_pose_rotation(armature, "LeftLowerLeg", frame, mathutils.Euler((-0.54 * max(side, 0.0) * intensity, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "LeftFoot", frame, mathutils.Euler((0.24 * side * intensity, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightUpperLeg", frame, mathutils.Euler((-0.62 * side * intensity, 0.0, -0.03 * side), "XYZ"))
    set_pose_rotation(armature, "RightLowerLeg", frame, mathutils.Euler((-0.54 * max(-side, 0.0) * intensity, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightFoot", frame, mathutils.Euler((-0.24 * side * intensity, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "LeftHand", frame, mathutils.Euler((0.0, 0.0, -0.18 * side * intensity), "XYZ"))
    set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.18 * side * intensity), "XYZ"))

def neutral_pose(armature, frame):
    neutral = mathutils.Euler((0.0, 0.0, 0.0), "XYZ")
    for bone_name in armature.pose.bones.keys():
        set_pose_rotation(armature, bone_name, frame, neutral)
    set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, 0.0)))

def add_rig_test_actions(armature):
    action = begin_rig_action(armature, "Control3D_Rig_Full_Check", 72)
    set_pose_rotation(armature, "LeftUpperArm", 18, mathutils.Euler((0.0, 0.0, -0.55), "XYZ"))
    set_pose_rotation(armature, "LeftLowerArm", 18, mathutils.Euler((0.0, 0.0, -0.35), "XYZ"))
    set_pose_rotation(armature, "RightUpperArm", 18, mathutils.Euler((0.0, 0.0, 0.55), "XYZ"))
    set_pose_rotation(armature, "RightLowerArm", 18, mathutils.Euler((0.0, 0.0, 0.35), "XYZ"))
    set_pose_rotation(armature, "LeftUpperLeg", 36, mathutils.Euler((0.45, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "LeftLowerLeg", 36, mathutils.Euler((-0.62, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightUpperLeg", 54, mathutils.Euler((-0.45, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightLowerLeg", 54, mathutils.Euler((-0.62, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "Spine", 36, mathutils.Euler((0.0, 0.18, 0.0), "XYZ"))
    set_pose_rotation(armature, "Chest", 36, mathutils.Euler((0.0, -0.14, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Arms_Check", 72)
    set_pose_rotation(armature, "LeftUpperArm", 24, mathutils.Euler((0.0, 0.0, -0.82), "XYZ"))
    set_pose_rotation(armature, "LeftLowerArm", 24, mathutils.Euler((0.0, 0.0, -0.5), "XYZ"))
    set_pose_rotation(armature, "RightUpperArm", 48, mathutils.Euler((0.0, 0.0, 0.82), "XYZ"))
    set_pose_rotation(armature, "RightLowerArm", 48, mathutils.Euler((0.0, 0.0, 0.5), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Attack_Punch_Right_Check", 54)
    for frame, reach, recoil in [(1, 0.0, 0.0), (10, -0.45, 0.35), (20, 1.0, -0.18), (32, 0.55, 0.0), (44, -0.2, 0.12), (54, 0.0, 0.0)]:
        set_pose_rotation(armature, "Hips", frame, mathutils.Euler((0.0, 0.0, -0.08 * reach), "XYZ"))
        set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.04 * reach, -0.16 * reach, 0.05 * reach), "XYZ"))
        set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.03 * reach, 0.22 * reach, -0.06 * reach), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((-0.45 * reach, 0.0, 0.72 * reach + recoil), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.92 * (1.0 - max(reach, 0.0)) + 0.18 * recoil), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.26 * reach), "XYZ"))
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((0.18 * reach, 0.0, -0.32), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.46), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Attack_Slash_Right_Check", 66)
    for frame, swing in [(1, 0.0), (12, -0.65), (26, 1.0), (40, 0.45), (54, -0.15), (66, 0.0)]:
        set_pose_rotation(armature, "Hips", frame, mathutils.Euler((0.0, 0.0, -0.12 * swing), "XYZ"))
        set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.06 * abs(swing), -0.18 * swing, 0.08 * swing), "XYZ"))
        set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.04 * abs(swing), 0.26 * swing, -0.1 * swing), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((-0.28 * abs(swing), 0.0, 1.05 * swing), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.42 + 0.3 * abs(swing)), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.62 * swing), "XYZ"))
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((0.08 * abs(swing), 0.0, -0.42), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.32), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Attack_Combo_Check", 84)
    for frame, side in [(1, 0.0), (10, -0.45), (20, 0.95), (32, 0.0), (44, 0.55), (56, -0.95), (70, -0.25), (84, 0.0)]:
        set_pose_rotation(armature, "Hips", frame, mathutils.Euler((0.0, 0.0, -0.1 * side), "XYZ"))
        set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.04 * abs(side), -0.18 * side, 0.06 * side), "XYZ"))
        set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.04 * abs(side), 0.24 * side, -0.08 * side), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((-0.28 * abs(side), 0.0, 0.95 * side), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.58 + 0.22 * abs(side)), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.55 * side), "XYZ"))
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((0.12 * abs(side), 0.0, -0.34), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.34), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Legs_Check", 72)
    set_pose_rotation(armature, "LeftUpperLeg", 24, mathutils.Euler((0.58, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "LeftLowerLeg", 24, mathutils.Euler((-0.72, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightUpperLeg", 48, mathutils.Euler((-0.58, 0.0, 0.0), "XYZ"))
    set_pose_rotation(armature, "RightLowerLeg", 48, mathutils.Euler((-0.72, 0.0, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Spine_Check", 72)
    set_pose_rotation(armature, "Spine", 24, mathutils.Euler((0.0, 0.22, 0.0), "XYZ"))
    set_pose_rotation(armature, "Chest", 24, mathutils.Euler((0.0, -0.18, 0.0), "XYZ"))
    set_pose_rotation(armature, "Neck", 24, mathutils.Euler((0.0, -0.08, 0.0), "XYZ"))
    set_pose_rotation(armature, "Spine", 48, mathutils.Euler((0.0, -0.22, 0.0), "XYZ"))
    set_pose_rotation(armature, "Chest", 48, mathutils.Euler((0.0, 0.18, 0.0), "XYZ"))
    set_pose_rotation(armature, "Neck", 48, mathutils.Euler((0.0, 0.08, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Walk_Slow_Check", 96)
    for frame, side, bounce in [(1, 0.0, 0.0), (13, 1.0, 0.015), (25, 0.0, 0.0), (37, -1.0, 0.015), (49, 0.0, 0.0), (61, 1.0, 0.015), (73, 0.0, 0.0), (85, -1.0, 0.015), (96, 0.0, 0.0)]:
        if side == 0.0:
            neutral_pose(armature, frame)
        else:
            stride_pose(armature, frame, side, 0.55, bounce)
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Run_Check", 48)
    for frame, side, bounce in [(1, 1.0, 0.035), (7, 0.0, 0.075), (13, -1.0, 0.035), (19, 0.0, 0.075), (25, 1.0, 0.035), (31, 0.0, 0.075), (37, -1.0, 0.035), (43, 0.0, 0.075), (48, 1.0, 0.035)]:
        if side == 0.0:
            neutral_pose(armature, frame)
            set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, bounce)))
            set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.16, 0.0, 0.0), "XYZ"))
            set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.08, 0.0, 0.0), "XYZ"))
        else:
            stride_pose(armature, frame, side, 0.95, bounce)
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Run_Fast_Check", 36)
    for frame, side, bounce in [(1, 1.0, 0.045), (5, 0.0, 0.1), (10, -1.0, 0.045), (14, 0.0, 0.1), (19, 1.0, 0.045), (23, 0.0, 0.1), (28, -1.0, 0.045), (32, 0.0, 0.1), (36, 1.0, 0.045)]:
        if side == 0.0:
            neutral_pose(armature, frame)
            set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, bounce)))
            set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.22, 0.0, 0.0), "XYZ"))
        else:
            stride_pose(armature, frame, side, 1.22, bounce)
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Jump_Check", 72)
    for frame, height, crouch in [(1, 0.0, 0.0), (14, -0.05, 1.0), (28, 0.28, -0.65), (44, 0.22, -0.35), (58, -0.03, 0.7), (72, 0.0, 0.0)]:
        set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, height)))
        set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.12 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "Chest", frame, mathutils.Euler((-0.08 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftUpperLeg", frame, mathutils.Euler((-0.45 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightUpperLeg", frame, mathutils.Euler((-0.45 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftLowerLeg", frame, mathutils.Euler((-0.72 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightLowerLeg", frame, mathutils.Euler((-0.72 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftFoot", frame, mathutils.Euler((0.32 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightFoot", frame, mathutils.Euler((0.32 * crouch, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((-0.7 * crouch, 0.0, -0.22), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((-0.7 * crouch, 0.0, 0.22), "XYZ"))
        set_pose_rotation(armature, "LeftHand", frame, mathutils.Euler((0.0, 0.0, -0.24 * crouch), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.24 * crouch), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Dance_Check", 96)
    for frame, side in [(1, 0.0), (13, 1.0), (25, 0.0), (37, -1.0), (49, 0.0), (61, 1.0), (73, 0.0), (85, -1.0), (96, 0.0)]:
        set_pose_location(armature, "Hips", frame, mathutils.Vector((0.0, 0.0, 0.025 if side != 0 else 0.0)))
        set_pose_rotation(armature, "Hips", frame, mathutils.Euler((0.0, 0.0, 0.18 * side), "XYZ"))
        set_pose_rotation(armature, "Spine", frame, mathutils.Euler((0.0, 0.28 * side, -0.1 * side), "XYZ"))
        set_pose_rotation(armature, "Chest", frame, mathutils.Euler((0.0, -0.22 * side, 0.12 * side), "XYZ"))
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((0.0, 0.15 * side, -1.05 if side >= 0 else -0.35), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.65 if side >= 0 else -0.15), "XYZ"))
        set_pose_rotation(armature, "LeftHand", frame, mathutils.Euler((0.0, 0.0, -0.45 if side >= 0 else 0.12), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((0.0, -0.15 * side, 1.05 if side <= 0 else 0.35), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.65 if side <= 0 else 0.15), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.45 if side <= 0 else -0.12), "XYZ"))
        set_pose_rotation(armature, "LeftUpperLeg", frame, mathutils.Euler((0.18 * side, 0.0, 0.12 * side), "XYZ"))
        set_pose_rotation(armature, "RightUpperLeg", frame, mathutils.Euler((-0.18 * side, 0.0, -0.12 * side), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Elbow_Knee_Check", 72)
    for frame, bend in [(1, 0.0), (18, 1.0), (36, 0.0), (54, -1.0), (72, 0.0)]:
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.85 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.85 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "LeftLowerLeg", frame, mathutils.Euler((-0.85 * max(bend, 0.0), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightLowerLeg", frame, mathutils.Euler((-0.85 * max(-bend, 0.0), 0.0, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Wrist_Ankle_Check", 72)
    for frame, side in [(1, 0.0), (18, 1.0), (36, 0.0), (54, -1.0), (72, 0.0)]:
        set_pose_rotation(armature, "LeftHand", frame, mathutils.Euler((0.0, 0.0, -0.75 * side), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.75 * side), "XYZ"))
        set_pose_rotation(armature, "LeftFoot", frame, mathutils.Euler((0.42 * side, 0.0, 0.08 * side), "XYZ"))
        set_pose_rotation(armature, "RightFoot", frame, mathutils.Euler((-0.42 * side, 0.0, -0.08 * side), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.25 * abs(side)), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.25 * abs(side)), "XYZ"))
        set_pose_rotation(armature, "LeftLowerLeg", frame, mathutils.Euler((-0.25 * abs(side), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightLowerLeg", frame, mathutils.Euler((-0.25 * abs(side), 0.0, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    action = begin_rig_action(armature, "Control3D_Joint_Range_Check", 96)
    for frame, bend in [(1, 0.0), (16, 0.55), (32, 0.0), (48, 0.9), (64, 0.0), (80, -0.45), (96, 0.0)]:
        set_pose_rotation(armature, "LeftUpperArm", frame, mathutils.Euler((0.0, 0.0, -0.18 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "RightUpperArm", frame, mathutils.Euler((0.0, 0.0, 0.18 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "LeftLowerArm", frame, mathutils.Euler((0.0, 0.0, -0.72 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "RightLowerArm", frame, mathutils.Euler((0.0, 0.0, 0.72 * abs(bend)), "XYZ"))
        set_pose_rotation(armature, "LeftHand", frame, mathutils.Euler((0.0, 0.0, -0.35 * bend), "XYZ"))
        set_pose_rotation(armature, "RightHand", frame, mathutils.Euler((0.0, 0.0, 0.35 * bend), "XYZ"))
        set_pose_rotation(armature, "LeftUpperLeg", frame, mathutils.Euler((0.22 * abs(bend), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightUpperLeg", frame, mathutils.Euler((0.22 * abs(bend), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftLowerLeg", frame, mathutils.Euler((-0.78 * abs(bend), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightLowerLeg", frame, mathutils.Euler((-0.78 * abs(bend), 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "LeftFoot", frame, mathutils.Euler((0.34 * bend, 0.0, 0.0), "XYZ"))
        set_pose_rotation(armature, "RightFoot", frame, mathutils.Euler((0.34 * bend, 0.0, 0.0), "XYZ"))
    finish_rig_action(armature, action)

    bpy.ops.object.mode_set(mode="OBJECT")

def export_glb(output_path):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type in {"MESH", "ARMATURE"}:
            obj.select_set(True)
    export_options = {
        "filepath": output_path,
        "export_format": "GLB",
        "export_skins": True,
        "export_animations": True,
        "export_force_sampling": True,
        "export_frame_range": True,
        "export_apply": False,
    }
    try:
        bpy.ops.export_scene.gltf(**export_options, use_selection=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**export_options)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-format", required=True)
    parser.add_argument("--markers-json", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    with open(args.markers_json, "r", encoding="utf-8") as handle:
        marker_list = json.load(handle)
    markers = {entry["name"]: entry["position"] for entry in marker_list}

    clear_scene()
    import_source(args.source, args.source_format)
    meshes = collect_meshes()
    if not meshes:
        raise RuntimeError("No mesh objects found after import")
    armature = create_armature(markers)
    skin_report = bind_meshes_with_safe_fallback(armature, meshes, markers)
    delete_source_armatures(armature)
    add_rig_test_actions(armature)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    export_glb(args.output)

if __name__ == "__main__":
    main()
`;
}

function buildPreviewScript() {
  return String.raw`
import argparse
import math
import os
import sys
import bpy
import mathutils

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_source(source_path, source_format):
    if source_format == "fbx":
        bpy.ops.import_scene.fbx(filepath=source_path)
    elif source_format == "obj":
        bpy.ops.wm.obj_import(filepath=source_path)
    else:
        bpy.ops.import_scene.gltf(filepath=source_path)

def collect_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def scene_bounds(meshes):
    min_v = mathutils.Vector((float("inf"), float("inf"), float("inf")))
    max_v = mathutils.Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            min_v.x = min(min_v.x, world.x)
            min_v.y = min(min_v.y, world.y)
            min_v.z = min(min_v.z, world.z)
            max_v.x = max(max_v.x, world.x)
            max_v.y = max(max_v.y, world.y)
            max_v.z = max(max_v.z, world.z)
    return min_v, max_v

def view_vectors(view):
    if view == "back":
        return mathutils.Vector((0, 1, 0)), mathutils.Vector((-1, 0, 0))
    if view == "left":
        return mathutils.Vector((1, 0, 0)), mathutils.Vector((0, -1, 0))
    if view == "right":
        return mathutils.Vector((-1, 0, 0)), mathutils.Vector((0, 1, 0))
    return mathutils.Vector((0, -1, 0)), mathutils.Vector((1, 0, 0))

def span_on_axis(size, axis):
    return abs(size.x * axis.x) + abs(size.y * axis.y) + abs(size.z * axis.z)

def view_frame(view):
    camera_axis, horizontal_axis = view_vectors(view)
    vertical_axis = mathutils.Vector((0, 0, 1))
    return camera_axis.normalized(), horizontal_axis.normalized(), vertical_axis

def set_camera_axes(camera, horizontal_axis, vertical_axis, camera_axis):
    matrix = mathutils.Matrix((
        (horizontal_axis.x, vertical_axis.x, camera_axis.x, camera.location.x),
        (horizontal_axis.y, vertical_axis.y, camera_axis.y, camera.location.y),
        (horizontal_axis.z, vertical_axis.z, camera_axis.z, camera.location.z),
        (0, 0, 0, 1),
    ))
    camera.matrix_world = matrix

def setup_camera(meshes):
    min_v, max_v = scene_bounds(meshes)
    center = (min_v + max_v) * 0.5
    size = max_v - min_v
    view = bpy.context.scene.get("control3d_rig_view", "front")
    camera_axis, horizontal_axis, vertical_axis = view_frame(view)
    depth = span_on_axis(size, camera_axis)
    horizontal_size = span_on_axis(size, horizontal_axis)
    vertical_size = span_on_axis(size, vertical_axis)
    ortho_scale = max(horizontal_size, vertical_size, 0.25) * 1.22
    distance = max(depth, 1.0) * 2.0 + 2.0
    location = center + camera_axis * distance
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    set_camera_axes(camera, horizontal_axis, vertical_axis, camera_axis)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_scale
    bpy.context.scene.camera = camera
    return camera

def setup_lighting(meshes):
    min_v, max_v = scene_bounds(meshes)
    center = (min_v + max_v) * 0.5
    size = max_v - min_v
    view = bpy.context.scene.get("control3d_rig_view", "front")
    camera_axis, horizontal_axis, vertical_axis = view_frame(view)
    depth = abs(size.x * camera_axis.x) + abs(size.y * camera_axis.y) + abs(size.z * camera_axis.z)
    distance = max(depth, 1.0) * 1.5 + 1.5
    location = center + camera_axis * distance + mathutils.Vector((0, 0, max(size.z, 1.0) * 0.35))
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = 700
    light.data.size = max(size.x, size.z, 1.0) * 1.6

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-format", required=True)
    parser.add_argument("--view", default="front")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    clear_scene()
    import_source(args.source, args.source_format)
    meshes = collect_meshes()
    if not meshes:
        raise RuntimeError("No mesh objects found after import")

    bpy.context.scene["control3d_rig_view"] = args.view
    setup_camera(meshes)
    setup_lighting(meshes)
    for engine in ("BLENDER_WORKBENCH", "BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            bpy.context.scene.render.engine = engine
            break
        except TypeError:
            continue
    try:
        bpy.context.scene.display.shading.light = "STUDIO"
        bpy.context.scene.display.shading.color_type = "MATERIAL"
    except Exception:
        pass
    bpy.context.scene.render.resolution_x = 1400
    bpy.context.scene.render.resolution_y = 1400
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.world.color = (0.025, 0.035, 0.055)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.context.scene.render.filepath = args.output
    bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    main()
`;
}

function buildPickScript() {
  return String.raw`
import argparse
import json
import os
import sys
import bpy
import mathutils

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def import_source(source_path, source_format):
    if source_format == "fbx":
        bpy.ops.import_scene.fbx(filepath=source_path)
    elif source_format == "obj":
        bpy.ops.wm.obj_import(filepath=source_path)
    else:
        bpy.ops.import_scene.gltf(filepath=source_path)

def collect_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def scene_bounds(meshes):
    min_v = mathutils.Vector((float("inf"), float("inf"), float("inf")))
    max_v = mathutils.Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            min_v.x = min(min_v.x, world.x)
            min_v.y = min(min_v.y, world.y)
            min_v.z = min(min_v.z, world.z)
            max_v.x = max(max_v.x, world.x)
            max_v.y = max(max_v.y, world.y)
            max_v.z = max(max_v.z, world.z)
    return min_v, max_v

def view_vectors(view):
    if view == "back":
        return mathutils.Vector((0, 1, 0)), mathutils.Vector((-1, 0, 0))
    if view == "left":
        return mathutils.Vector((1, 0, 0)), mathutils.Vector((0, -1, 0))
    if view == "right":
        return mathutils.Vector((-1, 0, 0)), mathutils.Vector((0, 1, 0))
    return mathutils.Vector((0, -1, 0)), mathutils.Vector((1, 0, 0))

def span_on_axis(size, axis):
    return abs(size.x * axis.x) + abs(size.y * axis.y) + abs(size.z * axis.z)

def view_frame(view):
    camera_axis, horizontal_axis = view_vectors(view)
    vertical_axis = mathutils.Vector((0, 0, 1))
    return camera_axis.normalized(), horizontal_axis.normalized(), vertical_axis

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-format", required=True)
    parser.add_argument("--view", default="front")
    parser.add_argument("--x", required=True, type=float)
    parser.add_argument("--y", required=True, type=float)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

    clear_scene()
    import_source(args.source, args.source_format)
    meshes = collect_meshes()
    if not meshes:
        raise RuntimeError("No mesh objects found after import")

    min_v, max_v = scene_bounds(meshes)
    center = (min_v + max_v) * 0.5
    size = max_v - min_v
    camera_axis, horizontal_axis, vertical_axis = view_frame(args.view)
    depth = span_on_axis(size, camera_axis)
    distance = max(depth, 1.0) * 2.0 + 2.0
    horizontal_size = span_on_axis(size, horizontal_axis)
    vertical_size = span_on_axis(size, vertical_axis)
    ortho_scale = max(horizontal_size, vertical_size, 0.25) * 1.22
    direction = -camera_axis

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def cast_at(nx, ny):
        origin = center + camera_axis * distance + horizontal_axis * ((nx - 0.5) * ortho_scale) + vertical_axis * ((0.5 - ny) * ortho_scale)
        max_distance = max(depth, 1.0) * 6.0 + 10.0
        hit, location, normal, face_index, obj, matrix = bpy.context.scene.ray_cast(
            depsgraph,
            origin,
            direction,
            distance=max_distance,
        )
        if not hit:
            return False, None, None
        return True, location.copy(), obj

    hit, location, obj = cast_at(args.x, args.y)
    if not hit:
        raise RuntimeError("Click did not hit the model surface. Zoom in or switch view, then click closer to the visible mesh.")

    relative = location - center
    screen_x = 0.5 + relative.dot(horizontal_axis) / ortho_scale
    screen_y = 0.5 - relative.dot(vertical_axis) / ortho_scale

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump({
            "position": [location.x, location.y, location.z],
            "object": obj.name if obj else None,
            "sample": [args.x, args.y],
            "screen": [screen_x, screen_y],
            "fallbackDistance": 0.0,
        }, handle)

if __name__ == "__main__":
    main()
`;
}

async function runBlenderScript(input: {
  args: string[];
  scriptPath: string;
  timeout?: number;
}) {
  try {
    return await execFileAsync(
      getBlenderExecutable(),
      ["--background", "--factory-startup", "--python", input.scriptPath, "--", ...input.args],
      {
        timeout: input.timeout ?? 120000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 12,
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Blender executable not found. Set CONTROL3D_BLENDER_PATH or BLENDER_PATH to your blender.exe path.",
      );
    }
    throw error;
  }
}

function blenderOutput(result?: { stdout?: string | Buffer; stderr?: string | Buffer }) {
  const text = [result?.stdout?.toString(), result?.stderr?.toString()]
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) return "";
  return text.length > 4000 ? text.slice(-4000) : text;
}

function assertBlenderCreatedFile(
  outputPath: string,
  result: { stdout?: string | Buffer; stderr?: string | Buffer } | undefined,
  label: string,
) {
  if (existsSync(outputPath)) return;
  const output = blenderOutput(result);
  throw new Error(
    output
      ? `${label} was not created by Blender. Blender output: ${output}`
      : `${label} was not created by Blender.`,
  );
}

export async function renderRiggingPreview(model: ModelRecord, view: RiggingPreviewView = "front") {
  const modelDir = path.join(publicUploadsDir, model.id);
  await mkdir(modelDir, { recursive: true });
  const scriptPath = path.join(modelDir, "control3d-rig-preview.py");
  const outputPath = path.join(modelDir, `rig-preview-${view}.png`);
  const sourcePath = resolvePublicAssetPath(model.fileUrl);
  const sourceFormat = getSourceFormat(model);
  const script = buildPreviewScript();
  const previousScript = existsSync(scriptPath) ? await readFile(scriptPath, "utf8") : "";
  const shouldRender = !existsSync(outputPath) || previousScript !== script;

  if (shouldRender) {
    await rm(outputPath, { force: true });
    await writeFile(scriptPath, script, "utf8");
    const result = await runBlenderScript({
      scriptPath,
      args: [
        "--source",
        sourcePath,
        "--source-format",
        sourceFormat,
        "--view",
        view,
        "--output",
        outputPath,
      ],
      timeout: 120000,
    });
    assertBlenderCreatedFile(outputPath, result, "Rigging preview image");
  }

  return {
    buffer: await readFile(outputPath),
    outputPath,
  };
}

export async function pickRiggingPoint(input: {
  model: ModelRecord;
  x: number;
  y: number;
  view?: RiggingPreviewView;
}) {
  const view = input.view ?? "front";
  const modelDir = path.join(publicUploadsDir, input.model.id);
  await mkdir(modelDir, { recursive: true });
  const scriptPath = path.join(modelDir, "control3d-rig-pick.py");
  const outputPath = path.join(modelDir, "rig-pick.json");
  const sourcePath = resolvePublicAssetPath(input.model.fileUrl);
  const sourceFormat = getSourceFormat(input.model);

  await rm(outputPath, { force: true });
  await writeFile(scriptPath, buildPickScript(), "utf8");
  const result = await runBlenderScript({
    scriptPath,
    args: [
      "--source",
      sourcePath,
      "--source-format",
      sourceFormat,
      "--view",
      view,
      "--x",
      String(input.x),
      "--y",
      String(input.y),
      "--output",
      outputPath,
    ],
    timeout: 120000,
  });
  assertBlenderCreatedFile(outputPath, result, "Rigging pick result");

  const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
    position?: [number, number, number];
    sample?: [number, number];
    screen?: [number, number];
  };
  if (!Array.isArray(payload.position) || payload.position.length !== 3) {
    throw new Error("Blender did not return a valid rig marker position");
  }
  return {
    position: payload.position,
    sample: Array.isArray(payload.sample) && payload.sample.length === 2
      ? payload.sample
      : [input.x, input.y],
    screen: Array.isArray(payload.screen) && payload.screen.length === 2
      ? payload.screen
      : undefined,
  };
}

export async function runBlenderAutoRig(input: {
  model: ModelRecord;
  markers: RigMarker[];
}) {
  const modelDir = path.join(publicUploadsDir, input.model.id);
  await mkdir(modelDir, { recursive: true });

  const scriptPath = path.join(modelDir, "control3d-autorig.py");
  const markersPath = path.join(modelDir, "rig-markers.json");
  const outputPath = path.join(modelDir, "rigged.glb");
  const outputUrl = `/uploads/models/${input.model.id}/rigged.glb`;
  const sourcePath = resolvePublicAssetPath(input.model.fileUrl);
  const blender = getBlenderExecutable();
  const sourceFormat = getSourceFormat(input.model);

  await writeFile(scriptPath, buildBlenderScript(), "utf8");
  await writeFile(markersPath, JSON.stringify(input.markers, null, 2), "utf8");

  try {
    const result = await execFileAsync(
      blender,
      [
        "--background",
        "--factory-startup",
        "--python",
        scriptPath,
        "--",
        "--source",
        sourcePath,
        "--source-format",
        sourceFormat,
        "--markers-json",
        markersPath,
        "--output",
        outputPath,
      ],
      {
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 12,
      },
    );

    if (!existsSync(outputPath)) {
      throw new Error("Blender finished but did not create rigged.glb");
    }

    return {
      outputPath,
      outputUrl,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Blender executable not found. Set CONTROL3D_BLENDER_PATH or BLENDER_PATH to your blender.exe path.",
      );
    }
    throw error;
  }
}
