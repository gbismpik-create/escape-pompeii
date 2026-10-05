import { AUDIO, CHARACTER, PLAYER, FALLING } from './config.js';
import { loadArrayBuffer } from './assets.js';
import { loadMuted, saveMuted, loadVolumes, saveVolumes } from './storage.js';

// Sound with the Web Audio API.
//
// Browsers only allow sound after the player has interacted with the page,
// so the AudioContext is created on the first key press, tap or click.
// Files are downloaded straight away, but decoded into playable sound
// (AudioBuffers) once the context exists.
//
// Routing:
//   one-off sounds ─→ effects ─┐
//   rumble loop ────→ rumble ──┼→ effects bus (player's Effects level) ─┐
//   roar loop ──────→ roar ────┘                                       ├→ master → speakers
//   tension layers ─→ one gain per layer → music bus (Music level) ───┘
// Muting turns the master down to 0. Mute and both levels are remembered.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let effectsBus = null;
  const groups = {};
  const buffers = {};
  let rumbleGain = null;
  let roarGain = null;
  let muted = loadMuted();
  const levels = loadVolumes(); // { music, effects }, 0–1
  let gameOver = false;

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

  // Eases a gain to a new level (seconds = roughly how long it takes).
  const glide = (node, level, seconds) => node?.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);

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
    if (buffers.rumble) startLoop('rumble', rumbleGain);
    if (buffers.roar) startLoop('roar', roarGain);
    if (buffers.tensionDrone) startLoop('tensionDrone', layers.drone);
    if (buffers.tensionHigh) startLoop('tensionHigh', layers.high);
  }

  const musicLevel = () => AUDIO.volume.music * levels.music * (gameOver ? AUDIO.musicOnGameOver : 1);

  // Runs on every interaction until sound is running. (Some phones also
  // pause sound after a phone call or app switch; the next tap resumes it.)
  function unlock() {
    if (!ctx) {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      ctx = new Context();
      master = gain(muted ? 0 : AUDIO.volume.master, ctx.destination);
      musicBus = gain(musicLevel(), master);
      effectsBus = gain(levels.effects, master);
      groups.effects = gain(AUDIO.volume.effects, effectsBus);
      groups.rumble = gain(AUDIO.volume.rumble, effectsBus);
      groups.roar = gain(AUDIO.volume.roar, effectsBus);
      rumbleGain = gain(0, groups.rumble); // set each frame from the phase
      roarGain = gain(0, groups.roar); // set each frame from the surge
      for (const name of ['drone', 'high', 'heartbeat']) layers[name] = gain(0, musicBus); // set from the phase
      decodeAll();
    }
    if (ctx.state !== 'running') ctx.resume();
  }
  for (const type of ['keydown', 'pointerdown', 'touchend', 'mousedown']) {
    window.addEventListener(type, unlock, { capture: true });
  }

  // ---- One-off sounds ----

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

  // ---- Tension music ----
  // No tunes: three layers whose levels come from the eruption phase.
  // The drone and the high shimmer are seamless loops; the heartbeat is one
  // beat, booked a moment ahead each time, at a tempo that follows the
  // legionary's speed.
  const layers = {}; // drone / high / heartbeat → gain node
  let nextBeat = 0;

  function beatInterval(speed) {
    const [slow, fast] = AUDIO.heartbeatBpm;
    const t = Math.min(1, Math.max(0, (speed - PLAYER.startSpeed) / (PLAYER.maxSpeed - PLAYER.startSpeed)));
    return 60 / (slow + (fast - slow) * t);
  }

  function updateHeartbeat(level, speed, running) {
    if (!buffers.heartbeat || !running || level < 0.01) {
      nextBeat = 0;
      return;
    }
    if (nextBeat === 0) nextBeat = ctx.currentTime + 0.1;
    if (ctx.currentTime > nextBeat - 0.1) {
      const source = ctx.createBufferSource();
      source.buffer = buffers.heartbeat[0];
      source.connect(layers.heartbeat);
      source.start(Math.max(nextBeat, ctx.currentTime));
      nextBeat = Math.max(nextBeat, ctx.currentTime) + beatInterval(speed);
    }
  }

  // ---- Movement sounds ----
  const stepLength = CHARACTER.runCycleLength / AUDIO.stepsPerRunCycle;
  let distanceSinceStep = 0;
  let wasGrounded = true;
  let wasSliding = false;
  let noise = null; // white noise for the steam's hiss, made on first use

  return {
    // Called every frame, whatever the game is doing. tension: the phase's
    // layer levels { drone, heartbeat, high } (0–1); speed: the legionary's
    // speed; running: false on the start and game-over screens (no heartbeat).
    updateTension({ drone, heartbeat, high }, speed, running) {
      if (!ctx || ctx.state !== 'running') return;
      glide(layers.drone, drone, 2);
      glide(layers.high, high, 2);
      glide(layers.heartbeat, heartbeat, 1);
      updateHeartbeat(heartbeat, speed, running);
    },

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

    // A steam vent about to puff, `ahead` metres away: a hiss of filtered
    // noise made on the spot (no sound file), softer the further it is.
    hiss(ahead, volume = 1) {
      if (!ctx || ctx.state !== 'running') return;
      if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2500 + Math.random() * 800;
      const level = ctx.createGain();
      const now = ctx.currentTime;
      const peak = volume / (1 + Math.max(0, ahead) / 25);
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime(peak, now + 0.06);
      level.gain.setTargetAtTime(peak * 0.5, now + 0.1, 0.3);
      level.gain.setTargetAtTime(0, now + 0.9, 0.15);
      source.connect(filter).connect(level).connect(groups.effects);
      source.start(now);
      source.stop(now + 1.5);
    },

    impact() {
      play('impact');
    },

    stumble() {
      play('stumble');
    },

    shieldBlock() {
      play('shieldBlock', { volume: FALLING.blockVolume, rate: 0.9 + Math.random() * 0.2 });
    },

    // Something falling hits the road; quieter the further ahead it lands.
    smash(distance) {
      play('smash', { volume: FALLING.smashVolume / (1 + Math.max(0, distance) / 15), rate: 0.85 + Math.random() * 0.3 });
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
      gameOver = isOver;
      if (ctx) glide(musicBus, musicLevel(), 1);
    },

    // The player's levels from the settings panel, 0–1 each.
    get levels() {
      return { ...levels };
    },

    setLevels({ music: m = levels.music, effects: e = levels.effects }) {
      levels.music = m;
      levels.effects = e;
      saveVolumes(levels);
      if (ctx) {
        glide(musicBus, musicLevel(), 0.1);
        glide(effectsBus, levels.effects, 0.1);
      }
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
