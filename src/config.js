// All tunable numbers live here. Tweak values in this file rather than in game code.

export const RENDERER = {
  maxPixelRatio: 2,
  clearColor: 0x87a0b8,
};

export const CAMERA = {
  fov: 60,
  near: 0.1,
  far: 1000,
  position: { x: 0, y: 8, z: 15 },
  lookAt: { x: 0, y: 0, z: 0 },
};

export const LIGHTS = {
  ambient: { color: 0xffffff, intensity: 0.4 },
  sun: {
    color: 0xffffff,
    intensity: 1.5,
    position: { x: 10, y: 20, z: 10 },
    shadowMapSize: 2048,
    shadowArea: 30, // half-width of the shadow camera frustum
  },
};

export const GROUND = {
  size: 100,
  color: 0x808080,
};
