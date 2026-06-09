import * as THREE from "three";

const ROOT_MOTION_TRACK_PATTERN =
  /(^|\.)(mixamorighips|_rootjoint|rl_boneroot_01|cc_base_hip_02|cog_00|hip_01|pelvis|hips|root)\.position$/i;

export function stabilizeClipRootMotion(clip: THREE.AnimationClip) {
  clip.tracks = clip.tracks.map((track) => {
    if (
      !(track instanceof THREE.VectorKeyframeTrack) ||
      !track.name.endsWith(".position") ||
      !ROOT_MOTION_TRACK_PATTERN.test(track.name)
    ) {
      return track;
    }

    const stabilizedTrack = track.clone() as THREE.VectorKeyframeTrack;
    const [baseX = 0, baseY = 0, baseZ = 0] = Array.from(stabilizedTrack.values.slice(0, 3));

    for (let index = 0; index < stabilizedTrack.values.length; index += 3) {
      stabilizedTrack.values[index] = baseX;
      stabilizedTrack.values[index + 1] = baseY;
      stabilizedTrack.values[index + 2] = baseZ;
    }

    return stabilizedTrack;
  });

  return clip;
}

export function stripPositionTracks(clip: THREE.AnimationClip) {
  clip.tracks = clip.tracks.filter((track) => !track.name.endsWith(".position"));
  return clip;
}
