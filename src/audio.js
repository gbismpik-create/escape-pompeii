import { AUDIO, CHARACTER } from './config.js';
import { loadArrayBuffer } from './assets.js';

// Sound with the Web Audio API.
//
// Browsers only allow sound after the player has interacted with the page,
// so the AudioContext is created on the first key press, tap or click.
// Files are downloaded straight away, but decoded into playable sound
// (AudioBuffers) once the context exists.
//
// Routing:  sources → effects / music / rumble gain → master gain → speakers
// Muting just turns the master gain down to 0.

export function createAudio() {
  let ctx = null;
  let master = null;
  const groups = {};
  const buffers = {};
  let rumbleGain = null;
  let muted = false;

  // Start downloading now; a missing file just means that sound is silent.
  const downloads = Object.fromEntries(
    Object.entries(AUDIO.files).map(([name, url]) => [
      name,
      loadArrayBuffer(url).catch((error) => console.warn(`Sound "${name}" unavailable:`, error.message)),
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
    source.buffer = buffers[name];
    source.loop = true;
    source.connect(destination);
    source.start();
  }

  async function decodeAll() {
    await Promise.all(
      Object.entries(downloads).map(async ([name, download]) => {
        const data = await download;
        if (!data) return;
        try {
          buffers[name] = await ctx.decodeAudioData(data);
        } catch (error) {
          console.warn(`Sound "${name}" could not be decoded:`, error.message);
        }
      }),
    );
    if (buffers.music) startLoop('music', groups.music);
    if (buffers.rumble) startLoop('rumble', rumbleGain);
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
      rumbleGain = gain(0, groups.rumble); // set each frame from the phase
      decodeAll();
    }
    if (ctx.state !== 'running') ctx.resume();
  }
  for (const type of ['keydown', 'pointerdown', 'touchend', 'mousedown']) {
    window.addEventListener(type, unlock, { capture: true });
  }

  // Plays a one-off sound. rate: playback speed (also changes the pitch).
  function play(name, { volume = 1, rate = 1 } = {}) {
    if (!ctx || !buffers[name]) return;
    const source = ctx.createBufferSource();
    source.buffer = buffers[name];
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

  return {
    // Called every frame while running: steps every stepLength metres on the
    // ground (none while sliding), and a heavier step when landing a jump.
    updateFootsteps(moved, grounded, sliding) {
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

    // 0–1, from the eruption phase. Eased so changes never jump.
    setRumble(level) {
      if (rumbleGain) rumbleGain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
    },

    get muted() {
      return muted;
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : AUDIO.volume.master, ctx.currentTime, 0.05);
      return muted;
    },
  };
}
