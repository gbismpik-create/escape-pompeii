import './style.css';
import * as THREE from 'three';
import { RENDERER, CAMERA, LIGHTS, GROUND } from './config.js';

const canvas = document.getElementById('game');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(RENDERER.clearColor);
renderer.shadowMap.enabled = true;

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);
camera.position.set(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);
camera.lookAt(CAMERA.lookAt.x, CAMERA.lookAt.y, CAMERA.lookAt.z);

// Lights
const ambient = new THREE.AmbientLight(LIGHTS.ambient.color, LIGHTS.ambient.intensity);
scene.add(ambient);

const sun = new THREE.DirectionalLight(LIGHTS.sun.color, LIGHTS.sun.intensity);
sun.position.set(LIGHTS.sun.position.x, LIGHTS.sun.position.y, LIGHTS.sun.position.z);
sun.castShadow = true;
sun.shadow.mapSize.set(LIGHTS.sun.shadowMapSize, LIGHTS.sun.shadowMapSize);
const s = LIGHTS.sun.shadowArea;
Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND.size, GROUND.size),
  new THREE.MeshStandardMaterial({ color: GROUND.color }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Loop
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
