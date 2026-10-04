import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// A single-file build of the game (e.g. the shareable page) can't download
// separate files, so it carries them as base64 text in
// window.EMBEDDED_ASSETS, keyed by their usual path. These helpers use the
// embedded copy when there is one, and download the file otherwise.

export function embeddedBytes(url) {
  const base64 = globalThis.EMBEDDED_ASSETS?.[url];
  return base64 ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : null;
}

// The file's contents as an ArrayBuffer.
export async function loadArrayBuffer(url) {
  const bytes = embeddedBytes(url);
  if (bytes) return bytes.buffer;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.arrayBuffer();
}

// One glTF loader for the whole game. It can read meshopt-compressed files
// (the street kit is compressed to about a fifth of its size).
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export function loadGLTF(url) {
  const bytes = embeddedBytes(url);
  return bytes ? gltfLoader.parseAsync(bytes.buffer, '') : gltfLoader.loadAsync(url);
}
