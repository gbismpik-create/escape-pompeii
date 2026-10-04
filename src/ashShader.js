import * as THREE from 'three';
import { ASH } from './config.js';

// Ash settling on the town. Added to existing materials with
// onBeforeCompile, which lets us edit Three.js's own shader code before it
// is compiled: a few lines blend the surface colour towards ash grey.
//
// Where ash collects:
//   - surfaces facing up (road, roofs, ledges, cart tops), most of all;
//   - the foot of walls, where it drifts against them.
// A cheap noise pattern makes it settle in patches rather than evenly.
// ashUniforms.cover (0–1) is shared by every material: one number updated
// each frame moves the whole town.

export const ashUniforms = {
  ashCover: { value: 0 },
  ashColor: { value: new THREE.Color(ASH.settledColor) },
};

export function addAshCover(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ashUniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAshWorldPos;
        varying vec3 vAshWorldNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 ashModel = modelMatrix;
        #ifdef USE_INSTANCING
          ashModel = modelMatrix * instanceMatrix;
        #endif
        vAshWorldPos = (ashModel * vec4(transformed, 1.0)).xyz;
        vAshWorldNormal = normalize(mat3(ashModel) * objectNormal);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float ashCover;
        uniform vec3 ashColor;
        varying vec3 vAshWorldPos;
        varying vec3 vAshWorldNormal;
        float ashHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ashNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(ashHash(i), ashHash(i + vec2(1, 0)), u.x), mix(ashHash(i + vec2(0, 1)), ashHash(i + vec2(1, 1)), u.x), u.y);
        }
        float ashAmount() {
          float up = smoothstep(0.3, 0.85, normalize(vAshWorldNormal).y);
          float wallFoot = 1.0 - smoothstep(0.0, 0.9, vAshWorldPos.y);
          float where = max(up, wallFoot * 0.7);
          float patches = ashNoise(vAshWorldPos.xz * 0.9) * 0.6 + ashNoise(vAshWorldPos.xz * 4.1) * 0.4;
          // As cover grows, more of the patch pattern passes the threshold.
          return where * smoothstep(1.0 - ashCover, 1.15 - ashCover, patches * 0.85 + where * 0.15);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ash = ashAmount();
        diffuseColor.rgb = mix(diffuseColor.rgb, ashColor, ash);`);
    if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, ash); // ash is matt`);
    }
  };
  // Tells Three.js this material's shader differs from a plain one, so it
  // compiles (and caches) its own version.
  material.customProgramCacheKey = () => 'ash-cover';
  return material;
}
