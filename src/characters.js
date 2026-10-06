import { SHOP } from './config.js';
import { loadPliny } from './villa.js';

// The shop's characters on the runner: looks only, never speed or jump.
// Most are the legionary recoloured (SHOP.characters' tint) until they have
// their own models; Pliny the Elder wears his own sculpted body (pliny.glb,
// the same model that waits in the boat at Stabiae), loaded when first worn.

let plinyBody = null;

export const characterById = (id) => SHOP.characters.find((c) => c.id === id) ?? SHOP.characters[0];

// character: the runner's model (character.js). envMap: reflections.
export async function wearCharacter(character, id, envMap) {
  const def = characterById(id);
  let bodyModel = null;
  if (def.body === 'pliny') {
    try {
      plinyBody ??= await loadPliny(envMap);
      bodyModel = plinyBody;
    } catch (error) {
      console.warn('Pliny did not load; the legionary runs instead.', error);
    }
  }
  character.setLook?.({ tint: def.tint ?? null, bodyModel });
}
