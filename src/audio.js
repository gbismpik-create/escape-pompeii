import { AUDIO, CHARACTER } from './config.js';
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
//   music tracks ───→ one gain per track → music bus (Music level) ────┘
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

  // ---- Music ----
  // Each phase has its own track. A track repeats by starting its next copy
  // a little before the current one ends and cross-fading the two, so even
  // MP3 files (which have tiny silences at each end) never leave a gap.
  // Changing phase fades the old track out and the new one in.
  const music = {}; // name → { gain, nextStart, copies, stopAt }
  let currentTrack = null;

  function scheduleCopy(track, buffer, at) {
    const overlap = Math.min(AUDIO.musicLoopOverlap, buffer.duration / 4);
    const envelope = gain(0, track.gain);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(1, at + overlap);
    envelope.gain.setValueAtTime(1, at + buffer.duration - overlap);
    envelope.gain.linearRampToValueAtTime(0, at + buffer.duration);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(envelope);
    source.start(at);
    track.copies.push(source);
    source.onended = () => {
      const i = track.copies.indexOf(source);
      if (i >= 0) track.copies.splice(i, 1);
    };
    track.nextStart = at + buffer.duration - overlap;
  }

  function updateMusic() {
    for (const [name, track] of Object.entries(music)) {
      if (track.stopAt !== null && ctx.currentTime >= track.stopAt) {
        track.copies.forEach((source) => source.stop());
        delete music[name];
        continue;
      }
      // Keep the next copy booked a second ahead.
      if (track.stopAt === null && ctx.currentTime > track.nextStart - 1) {
        scheduleCopy(track, buffers[name][0], Math.max(track.nextStart, ctx.currentTime + 0.05));
      }
    }
  }

  function switchMusic(name) {
    if (name === currentTrack || !buffers[name]) return;
    const fade = currentTrack ? AUDIO.musicCrossfade : 0.5;
    const old = music[currentTrack];
    if (old) {
      glide(old.gain, 0, fade);
      old.stopAt = ctx.currentTime + fade;
    }
    const track = music[name] ?? { gain: gain(0, musicBus), nextStart: ctx.currentTime + 0.05, copies: [] };
    track.stopAt = null;
    music[name] = track;
    glide(track.gain, 1, fade);
    currentTrack = name;
  }

  // ---- Movement sounds ----
  const stepLength = CHARACTER.runCycleLength / AUDIO.stepsPerRunCycle;
  let distanceSinceStep = 0;
  let wasGrounded = true;
  let wasSliding = false;

  return {
    // Called every frame, whatever the game is doing: plays the music for
    // the current eruption phase (0, 1, 2).
    update(phaseIndex) {
      if (!ctx || ctx.state !== 'running') return;
      switchMusic(AUDIO.musicByPhase[phaseIndex]);
      updateMusic();
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
