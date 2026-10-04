import { AUDIO, CHARACTER } from './config.js';
import { loadArrayBuffer } from './assets.js';
import { loadMuted, saveMuted } from './storage.js';

// Sound with the Web Audio API.
//
// Browsers only allow sound after the player has interacted with the page,
// so the AudioContext is created on the first key press, tap or click.
// Files are downloaded straight away, but decoded into playable sound
// (AudioBuffers) once the context exists.
//
// Routing:  sources → effects / music / rumble / roar gain → master gain → speakers
// Muting just turns the master gain down to 0. The choice is remembered.

export function createAudio() {
  let ctx = null;
  let master = null;
  const groups = {};
  const buffers = {};
  let rumbleGain = null;
  let roarGain = null;
  let muted = loadMuted();

  // Start downloading now; a missing file just means that sound is silent.
  // Every sound is a list of variations (usually just one).
  const downloads = Object.fromEntries(
    Object.entries(AUDIO.files).map(([name, urls]) => [
      name,
      [urls].flat().map((url) =>
        loadArrayBuffer(url).catch((error) => console.warn(`Sound "${name}" unavailable:`, error.message)),
      ),
    ]),
  );

  function gain(value, destination) {
    const node = ctx.createGain();
    node.gain.value = value;
    node.connect(destination);
    return node;
  }

  function startLoop(name, destination) {
    const source = ctx.createBufferSource();
    source.buffer = buffers[name][0];
    source.loop = true;
    source.connect(destination);
    source.start();
  }

  async function decodeAll() {
    await Promise.all(
      Object.entries(downloads).map(async ([name, variations]) => {
        const decoded = await Promise.all(
          variations.map(async (download) => {
            const data = await download;
            if (!data) return null;
            try {
              return await ctx.decodeAudioData(data);
            } catch (error) {
              console.warn(`Sound "${name}" could not be decoded:`, error.message);
              return null;
            }
          }),
        );
        const usable = decoded.filter(Boolean);
        if (usable.length) buffers[name] = usable;
      }),
    );
    if (buffers.music) startLoop('music', groups.music);
    if (buffers.rumble) startLoop('rumble', rumbleGain);
    if (buffers.roar) startLoop('roar', roarGain);
  }

  // Runs on every interaction until sound is running. (Some phones also
  // pause sound after a phone call or app switch; the next tap resumes it.)
  function unlock() {
    if (!ctx) {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      ctx = new Context();
      master = gain(muted ? 0 : AUDIO.volume.master, ctx.destination);
      groups.effects = gain(AUDIO.volume.effects, master);
      groups.music = gain(AUDIO.volume.music, master);
      groups.rumble = gain(AUDIO.volume.rumble, master);
      groups.roar = gain(AUDIO.volume.roar, master);
      rumbleGain = gain(0, groups.rumble); // set each frame from the phase
      roarGain = gain(0, groups.roar); // set each frame from the surge
      decodeAll();
    }
    if (ctx.state !== 'running') ctx.resume();
  }
  for (const type of ['keydown', 'pointerdown', 'touchend', 'mousedown']) {
    window.addEventListener(type, unlock, { capture: true });
  }

  // Picks a random variation, never the same one twice in a row.
  const lastPicked = {};
  function pick(name) {
    const list = buffers[name];
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === lastPicked[name]) i = (i + 1) % list.length;
    lastPicked[name] = i;
    return list[i];
  }

  // Plays a one-off sound. rate: playback speed (also changes the pitch).
  function play(name, { volume = 1, rate = 1 } = {}) {
    if (!ctx || !buffers[name] || volume <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = pick(name);
    source.playbackRate.value = rate;
    source.connect(gain(volume, groups.effects));
    source.start();
  }

  const vary = (amount) => 1 + (Math.random() * 2 - 1) * amount;

  function footstep(volume = 1) {
    play('footstep', {
      volume: volume * vary(AUDIO.footstepVolumeVariation),
      rate: vary(AUDIO.footstepPitchVariation),
    });
  }

  const stepLength = CHARACTER.runCycleLength / AUDIO.stepsPerRunCycle;
  let distanceSinceStep = 0;
  let wasGrounded = true;
  let wasSliding = false;

  // Eases a gain to a new level (seconds = roughly how long it takes).
  const glide = (node, level, seconds) => node?.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);

  return {
    // Called every frame while running. Footsteps every stepLength metres
    // on the ground (none while sliding), a heavier step when landing, a
    // whoosh on take-off and a scrape when a slide starts.
    updateMovement(moved, grounded, sliding) {
      if (!grounded && wasGrounded) play('jump');
      if (sliding && !wasSliding) play('slide');
      wasSliding = sliding;

      if (grounded && !wasGrounded) {
        footstep(AUDIO.landingVolume);
        distanceSinceStep = 0;
      } else if (grounded && !sliding) {
        distanceSinceStep += moved;
        if (distanceSinceStep >= stepLength) {
          distanceSinceStep -= stepLength;
          footstep();
        }
      }
      wasGrounded = grounded;
    },

    impact() {
      play('impact');
    },

    stumble() {
      play('stumble');
    },

    // A roof tile shattered `distance` metres from the player.
    tileShatter(distance) {
      const volume = 1 - distance / AUDIO.tileHearingDistance;
      play('tile', { volume: volume * volume, rate: vary(0.12) });
    },

    // 0–1, from the eruption phase. Eased so changes never jump.
    setRumble(level) {
      if (ctx) glide(rumbleGain, level, 1.5);
    },

    // 0–1: how close the surge cloud is.
    setRoar(level) {
      if (ctx) glide(roarGain, level, 0.6);
    },

    // Quieter music on the game-over screen; back to normal for a new run.
    setGameOver(isOver) {
      if (ctx) glide(groups.music, AUDIO.volume.music * (isOver ? AUDIO.musicOnGameOver : 1), 1);
    },

    get muted() {
      return muted;
    },

    toggleMute() {
      muted = !muted;
      saveMuted(muted);
      if (master) master.gain.setTargetAtTime(muted ? 0 : AUDIO.volume.master, ctx.currentTime, 0.05);
      return muted;
    },
  };
}
