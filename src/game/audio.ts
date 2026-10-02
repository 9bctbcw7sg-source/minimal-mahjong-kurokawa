export interface GameAudio {
  playDraw(): void;
  playDiscard(): void;
  playRiichi(): void;
  playRon(): void;
  playCall(): void;
  dispose(): void;
}

function createNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const envelope = 1 - index / frameCount;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  return buffer;
}

export function createGameAudio(): GameAudio {
  let context: AudioContext | null = null;

  function getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  }

  function playClack(
    startOffset: number,
    frequency: number,
    volume: number,
    duration: number,
  ) {
    const audioContext = getContext();
    if (!audioContext) return;

    const start = audioContext.currentTime + startOffset;
    const end = start + duration;

    const noise = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    noise.buffer = createNoiseBuffer(audioContext, duration);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency * 2.4, start);
    filter.Q.setValueAtTime(1.8, start);
    noiseGain.gain.setValueAtTime(volume, start);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, end);
    noise.connect(filter).connect(noiseGain).connect(audioContext.destination);

    const body = audioContext.createOscillator();
    const bodyGain = audioContext.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(frequency, start);
    body.frequency.exponentialRampToValueAtTime(frequency * 0.72, end);
    bodyGain.gain.setValueAtTime(volume * 0.34, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, end);
    body.connect(bodyGain).connect(audioContext.destination);

    noise.start(start);
    noise.stop(end);
    body.start(start);
    body.stop(end);
  }

  function playBell(
    startOffset: number,
    frequency: number,
    volume: number,
    duration: number,
  ) {
    const audioContext = getContext();
    if (!audioContext) return;
    const start = audioContext.currentTime + startOffset;
    const end = start + duration;

    const tone = audioContext.createOscillator();
    const overtone = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const overtoneGain = audioContext.createGain();
    tone.type = "sine";
    overtone.type = "sine";
    tone.frequency.setValueAtTime(frequency, start);
    overtone.frequency.setValueAtTime(frequency * 2.01, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    overtoneGain.gain.setValueAtTime(volume * 0.22, start);
    overtoneGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration * 0.86,
    );
    tone.connect(gain).connect(audioContext.destination);
    overtone.connect(overtoneGain).connect(audioContext.destination);
    tone.start(start);
    overtone.start(start);
    tone.stop(end);
    overtone.stop(end);
  }

  return {
    playDraw() {
      playClack(0, 520, 0.07, 0.038);
    },
    playDiscard() {
      playClack(0, 410, 0.11, 0.045);
      playClack(0.016, 680, 0.065, 0.032);
    },
    playRiichi() {
      playClack(0, 360, 0.12, 0.052);
      playBell(0.035, 587.33, 0.055, 0.32);
      playBell(0.13, 880, 0.042, 0.46);
    },
    playRon() {
      playClack(0, 285, 0.16, 0.065);
      playClack(0.045, 420, 0.095, 0.048);
      playBell(0.065, 293.66, 0.075, 0.62);
      playBell(0.16, 440, 0.045, 0.52);
    },
    playCall() {
      playClack(0, 470, 0.105, 0.043);
      playBell(0.025, 392, 0.032, 0.2);
    },
    dispose() {
      if (context) void context.close();
      context = null;
    },
  };
}
