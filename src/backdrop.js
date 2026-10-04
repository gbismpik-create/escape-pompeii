import * as THREE from 'three';
import { BACKDROP, CAMERA } from './config.js';

// Everything far away: the sky, Vesuvius and its eruption column, about
// 2 km ahead. They live in their own scene, drawn first with their own
// camera (near 10 m, far 6 km). Then the depth is cleared and the town is
// drawn on top with a camera that only reaches a few hundred metres.
//
// Why two passes: depth precision. One camera that sees from 0.1 m to 6 km
// can't tell which of two nearby surfaces is in front, and the town flickers.
// Splitting the range gives both the precision they need.

// A big sphere around the camera, painted on the inside with a gradient
// from the horizon colour up to the top colour.
function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDirection;
      void main() {
        float up = pow(max(vDirection.y, 0.0), 0.5);
        gl_FragColor = vec4(mix(horizonColor, topColor, up), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, // we're inside the sphere
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BACKDROP.skyRadius, 24, 12), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// A soft round dot, drawn once, for the fires.
function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Fires on the slopes. Pliny the Younger, who watched the eruption, wrote
// that "broad sheets of fire and leaping flames blazed at several points"
// on Vesuvius in the darkness. Points are picked on the mountain's surface,
// on the side facing the town, in a few patches that run downhill.
function createFires(mountainParts) {
  const surface = [];
  const v = new THREE.Vector3();
  let top = 0;
  for (const { geometry } of mountainParts) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      top = Math.max(top, v.y);
      surface.push(v.clone());
    }
  }
  // Slopes facing the town (+z, towards the player) between 35% and 92% up.
  const facing = surface.filter((p) => p.z > Math.abs(p.x) * 0.4 && p.y > top * 0.35 && p.y < top * 0.92);
  // Patches start on the left flank (x < 0): the volcano stands right of
  // the street, so that is the side visible down the street between the roofs.
  const starts = facing.filter((p) => p.x < 0);
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const points = [];
  for (let patch = 0; patch < BACKDROP.firePatches; patch++) {
    const centre = starts[Math.floor(random() * starts.length)];
    // Each patch: the surface points near a line running downhill from it.
    for (const p of facing) {
      const dx = p.x - centre.x;
      const dz = p.z - centre.z;
      const across = Math.abs(dx * centre.z - dz * centre.x) / Math.hypot(centre.x, centre.z); // distance from the downhill line
      const down = centre.y - p.y;
      if (across < 30 && down > -10 && down < 140 && random() < 0.5) points.push(p.x, p.y + 4, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.PointsMaterial({
    color: BACKDROP.fireColor,
    map: glowTexture(),
    size: BACKDROP.fireSize,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending, // glows: adds light to what's behind
    depthWrite: false,
    fog: false,
  });
  const fires = new THREE.Points(geometry, material);
  fires.frustumCulled = false;
  return fires;
}

// The kit's materials for far-away use: no fog (it would hide them
// completely at 2 km), and a fake haze instead (see setHaze).
function backdropPart({ geometry, material }) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  m.userData.source = material.name;
  const mesh = new THREE.Mesh(geometry, m);
  mesh.frustumCulled = false;
  return mesh;
}

export function createBackdrop() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, BACKDROP.near, BACKDROP.far);
  const sky = createSkyDome();
  scene.add(sky);

  // Its own soft lights, copied from the town's each frame.
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.position.set(0.4, 1, 0.6);
  scene.add(hemi, sun);

  let volcano = null; // { group, mountain, column, fires, materials }
  const angle = THREE.MathUtils.degToRad(BACKDROP.angle);

  return {
    // Adds Vesuvius and the eruption column from the street kit.
    addVolcano(kit) {
      const group = new THREE.Group();
      const mountain = new THREE.Group();
      (kit.near.Vesuvius ?? []).forEach((part) => mountain.add(backdropPart(part)));
      const column = new THREE.Group();
      (kit.near.EruptionColumn ?? []).forEach((part) => column.add(backdropPart(part)));
      column.position.y = BACKDROP.columnBase;
      const fires = createFires(kit.near.Vesuvius ?? []);
      group.add(mountain, column, fires);
      scene.add(group);
      const materials = [];
      group.traverse((o) => o.isMesh && materials.push(o.material));
      volcano = { group, column, fires, materials };
    },

    // phase: the blended eruption phase (see phases.js).
    update(phase, mainCamera, mainLights, time) {
      camera.position.copy(mainCamera.position);
      camera.quaternion.copy(mainCamera.quaternion);
      if (camera.aspect !== mainCamera.aspect) {
        camera.aspect = mainCamera.aspect;
        camera.updateProjectionMatrix();
      }

      sky.position.copy(camera.position);
      sky.material.uniforms.topColor.value.copy(phase.skyTop);
      sky.material.uniforms.horizonColor.value.copy(phase.skyHorizon);

      hemi.color.copy(mainLights.hemi.color);
      hemi.groundColor.copy(mainLights.hemi.groundColor);
      hemi.intensity = mainLights.hemi.intensity;
      sun.color.copy(mainLights.sun.color);
      sun.intensity = mainLights.sun.intensity;

      if (!volcano) return;
      // Keeps its place on the horizon as the player runs.
      volcano.group.position.set(
        Math.sin(angle) * BACKDROP.distance,
        BACKDROP.baseY,
        camera.position.z - Math.cos(angle) * BACKDROP.distance,
      );
      // The column grows with the eruption (scaled about its base).
      volcano.column.scale.setScalar(phase.columnScale);
      // Haze: fade towards the horizon colour (colour down, glow up).
      for (const m of volcano.materials) {
        m.color.setScalar(1 - phase.distantHaze);
        m.emissive.copy(phase.skyHorizon).multiplyScalar(phase.distantHaze);
      }
      // Fires flicker; they show as the sky darkens.
      const flicker = 0.75 + 0.15 * Math.sin(time * 7.3) + 0.1 * Math.sin(time * 13.1);
      volcano.fires.material.opacity = phase.fireGlow * flicker;
      volcano.fires.visible = phase.fireGlow > 0.01;
    },

    // Draws the backdrop. The caller then clears the depth and draws the town.
    render(renderer) {
      renderer.render(scene, camera);
    },
  };
}
