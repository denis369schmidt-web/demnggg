const bpmInput = document.getElementById("bpm");
const bpmValue = document.getElementById("bpmValue");
const keywordsInput = document.getElementById("keywords");
const barsInput = document.getElementById("bars");
const lyricsOutput = document.getElementById("lyricsOutput");
const lyricsWrap = document.getElementById("lyricsWrap");
const generateLyricsButton = document.getElementById("generateLyrics");
const startBeatButton = document.getElementById("startBeat");
const stopBeatButton = document.getElementById("stopBeat");
const recordToggleButton = document.getElementById("recordToggle");
const statusText = document.getElementById("statusText");
const barPositionText = document.getElementById("barPosition");
const activeBarText = document.getElementById("activeBarText");
const playback = document.getElementById("playback");
const downloadLink = document.getElementById("downloadLink");
const beatViz = document.getElementById("beatViz");
const streakValue = document.getElementById("streakValue");

const fxLowpass = document.getElementById("fxLowpass");
const fxDelay = document.getElementById("fxDelay");
const fxDistortion = document.getElementById("fxDistortion");
const fxReverb = document.getElementById("fxReverb");

let audioContext;
let masterGain;
let beatGain;
let micGain;
let lowpassFilter;
let delayNode;
let delayFeedback;
let distortionNode;
let reverbConvolver;
let dryGain;

let mediaStream;
let mediaRecorder;
let recordedChunks = [];
let recordDestination;

let beatTimerId;
let beatIntervalMs = 60000 / Number(bpmInput.value) / 2; // 8th-note pulse
let pulseIndex = 0;
let beatStartedAt = 0;
let lyricLines = [];
let activeBarIndex = -1;
let vizFlash = 0;
let vizKind = "hat";

const STREAK_KEY = "flowforge-streak";

const templates = [
  ["{k0} ist im Kopf, ich bleib stabil auf dem Takt", "{k1} in der Nacht, jeder Schritt sitzt exakt"],
  ["Zwischen {k0} und {k1}, ich halte Kurs ohne Pause", "{k2} wird zur Stimme und die Mics werden zur Zuhause"],
  ["Jeder Schlag gibt mir Zeichen, ich surf auf dem Grid", "Mit {k0} in den Zeilen bis der Reim wieder sitzt"],
  ["Wenn der Kick auf die Eins trifft, bleib ich ruhig im Frame", "{k1} macht den Druck hoch, doch ich halte den Aim"],
  ["{k2} in der Lunge, ich geh präzise durch den Part", "Silben landen auf der Snare, sauber wie auf einer Chart"]
];

function updateStatus(message, isGood = true) {
  statusText.textContent = message;
  statusText.style.color = isGood ? "#5cd6a9" : "#ff9fb0";
}

function loadStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || "null") || {
      count: 0,
      lastDay: null,
    };
  } catch {
    return { count: 0, lastDay: null };
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function renderStreak() {
  const streak = loadStreak();
  streakValue.textContent = String(streak.count);
}

function bumpStreak() {
  const streak = loadStreak();
  const today = todayKey();
  if (streak.lastDay === today) {
    renderStreak();
    return;
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);

  streak.count = streak.lastDay === yKey ? streak.count + 1 : 1;
  streak.lastDay = today;
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  renderStreak();
  const card = document.getElementById("streakCard");
  if (card) {
    card.classList.remove("streak-pop");
    void card.offsetWidth;
    card.classList.add("streak-pop");
  }
}

function ensureAudioContext() {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();

  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.85;

  beatGain = audioContext.createGain();
  beatGain.gain.value = 0.7;

  micGain = audioContext.createGain();
  micGain.gain.value = 1;

  lowpassFilter = audioContext.createBiquadFilter();
  lowpassFilter.type = "lowpass";
  lowpassFilter.frequency.value = 800;

  delayNode = audioContext.createDelay(1.2);
  delayNode.delayTime.value = 0.24;
  delayFeedback = audioContext.createGain();
  delayFeedback.gain.value = 0.33;
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);

  distortionNode = audioContext.createWaveShaper();
  distortionNode.curve = makeDistortionCurve(280);
  distortionNode.oversample = "4x";

  reverbConvolver = audioContext.createConvolver();
  reverbConvolver.buffer = buildReverbImpulse(2.6, 2.1);

  dryGain = audioContext.createGain();
  dryGain.gain.value = 1;

  beatGain.connect(masterGain);
  masterGain.connect(audioContext.destination);

  recordDestination = audioContext.createMediaStreamDestination();
  masterGain.connect(recordDestination);
}

function makeDistortionCurve(amount = 200) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;

  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }

  return curve;
}

function buildReverbImpulse(seconds = 2.4, decay = 2) {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * seconds;
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return impulse;
}

async function setupMicrophone() {
  ensureAudioContext();

  if (mediaStream) {
    return;
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(mediaStream);

  source.connect(dryGain);
  rebuildFxGraph();

  updateStatus("Mikrofon bereit");
}

function rebuildFxGraph() {
  const nodes = [micGain, lowpassFilter, delayNode, distortionNode, reverbConvolver, dryGain];
  nodes.forEach((node) => {
    try {
      node.disconnect();
    } catch (_error) {
      // disconnect may throw when node has no outputs in some browsers
    }
  });

  let chainHead = dryGain;

  if (fxLowpass.checked) {
    chainHead.connect(lowpassFilter);
    chainHead = lowpassFilter;
  }

  if (fxDistortion.checked) {
    chainHead.connect(distortionNode);
    chainHead = distortionNode;
  }

  if (fxReverb.checked) {
    chainHead.connect(reverbConvolver);
    chainHead = reverbConvolver;
  }

  chainHead.connect(micGain);

  if (fxDelay.checked) {
    micGain.connect(delayNode);
    delayNode.connect(masterGain);
  }

  micGain.connect(masterGain);
}

function scheduleBeatPulse() {
  const now = audioContext.currentTime;
  const kickOn = pulseIndex % 4 === 0;
  const snareOn = pulseIndex % 4 === 2;
  const hatOn = true;

  if (kickOn) {
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.1);
    amp.gain.setValueAtTime(1, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(amp).connect(beatGain);
    osc.start(now);
    osc.stop(now + 0.13);
    vizFlash = 1;
    vizKind = "kick";
  }

  if (snareOn) {
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.18, audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audioContext.createBufferSource();
    const bandpass = audioContext.createBiquadFilter();
    const amp = audioContext.createGain();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1700;
    amp.gain.setValueAtTime(0.7, now);
    amp.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    noise.buffer = noiseBuffer;
    noise.connect(bandpass).connect(amp).connect(beatGain);
    noise.start(now);
    noise.stop(now + 0.18);
    vizFlash = Math.max(vizFlash, 0.75);
    vizKind = "snare";
  }

  if (hatOn) {
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.05, audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audioContext.createBufferSource();
    const highpass = audioContext.createBiquadFilter();
    const amp = audioContext.createGain();
    highpass.type = "highpass";
    highpass.frequency.value = 5500;
    amp.gain.setValueAtTime(0.24, now);
    amp.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
    noise.buffer = noiseBuffer;
    noise.connect(highpass).connect(amp).connect(beatGain);
    noise.start(now);
    noise.stop(now + 0.05);
    if (vizFlash < 0.35) {
      vizFlash = 0.35;
      vizKind = "hat";
    }
  }

  pulseIndex += 1;
}

function startBeat() {
  ensureAudioContext();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (beatTimerId) {
    return;
  }

  beatIntervalMs = 60000 / Number(bpmInput.value) / 2;
  pulseIndex = 0;
  beatStartedAt = performance.now();
  activeBarIndex = -1;

  scheduleBeatPulse();
  beatTimerId = window.setInterval(scheduleBeatPulse, beatIntervalMs);

  bumpStreak();
  updateStatus("Beat läuft");
}

function stopBeat() {
  if (beatTimerId) {
    window.clearInterval(beatTimerId);
    beatTimerId = undefined;
  }

  barPositionText.textContent = "0.0";
  activeBarText.textContent = "–";
  setActiveLyric(-1);
  updateStatus("Beat gestoppt", false);
}

function setActiveLyric(index) {
  if (index === activeBarIndex) {
    return;
  }
  activeBarIndex = index;
  const rows = lyricsOutput.querySelectorAll(".lyric-row");
  rows.forEach((row, i) => {
    row.classList.toggle("lyric-active", i === index);
    row.classList.toggle("lyric-done", i < index);
  });
  if (index >= 0 && rows[index]) {
    rows[index].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  activeBarText.textContent = index >= 0 ? String(index + 1) : "–";
}

function calculateBarPosition() {
  if (!beatStartedAt || !beatTimerId) {
    return;
  }

  const elapsed = (performance.now() - beatStartedAt) / 1000;
  const beatsPerSecond = Number(bpmInput.value) / 60;
  const bars = (elapsed * beatsPerSecond) / 4;
  barPositionText.textContent = bars.toFixed(2);

  if (lyricLines.length > 0) {
    const idx = Math.min(lyricLines.length - 1, Math.floor(bars));
    setActiveLyric(idx);
  }
}

function estimateSyllables(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const counts = words.map((word) => {
    const vowelGroups = word.match(/[aeiouyäöü]+/g);
    return Math.max(1, vowelGroups ? vowelGroups.length : 1);
  });
  return counts.reduce((sum, count) => sum + count, 0);
}

function buildTimedLyrics(keywords, bars) {
  const tokens = keywords.slice(0, 3);
  while (tokens.length < 3) {
    tokens.push("Flow");
  }

  const lines = [];

  for (let i = 0; i < bars; i += 1) {
    const pattern = templates[i % templates.length][i % 2];
    const line = pattern
      .replaceAll("{k0}", tokens[0])
      .replaceAll("{k1}", tokens[1])
      .replaceAll("{k2}", tokens[2]);

    const syllables = estimateSyllables(line);
    const density = (syllables / 4).toFixed(1);
    lines.push({
      bar: i + 1,
      line,
      syllables,
      density,
    });
  }

  return lines;
}

function renderLyrics(lines) {
  lyricLines = lines;
  lyricsOutput.replaceChildren();

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "channel-empty";
    empty.textContent = "Bitte mindestens 2 Schlagwörter eingeben.";
    lyricsOutput.append(empty);
    return;
  }

  lines.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "lyric-row";
    row.dataset.bar = String(entry.bar);

    const main = document.createElement("p");
    main.className = "lyric-main";
    main.textContent = `Bar ${String(entry.bar).padStart(2, "0")}  ${entry.line}`;

    const meta = document.createElement("p");
    meta.className = "lyric-meta";
    meta.textContent = `~${entry.syllables} Silben / 4 Beats (${entry.density} pro Beat)`;

    row.append(main, meta);
    lyricsOutput.append(row);
  });

  setActiveLyric(-1);
}

function generateLyrics() {
  const rawKeywords = keywordsInput.value
    .split(/[;,]+|\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (rawKeywords.length < 2) {
    renderLyrics([]);
    updateStatus("Mehr Schlagwörter benötigt", false);
    return;
  }

  const bars = Math.min(24, Math.max(2, Number(barsInput.value) || 8));
  renderLyrics(buildTimedLyrics(rawKeywords, bars));
  updateStatus("Lyrics erzeugt");
}

async function toggleRecording() {
  ensureAudioContext();

  if (!mediaStream) {
    try {
      await setupMicrophone();
    } catch (_error) {
      updateStatus("Mikrofonzugriff verweigert", false);
      return;
    }
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordToggleButton.textContent = "● Aufnahme starten";
    updateStatus("Aufnahme gestoppt");
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(recordDestination.stream, { mimeType: "audio/webm" });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    playback.src = url;
    downloadLink.href = url;
    downloadLink.hidden = false;
    updateStatus("Aufnahme bereit zum Speichern");
  };

  mediaRecorder.start();
  recordToggleButton.textContent = "■ Aufnahme stoppen";
  updateStatus("Aufnahme läuft");
}

function drawBeatViz() {
  if (!beatViz) {
    return;
  }

  const ctx = beatViz.getContext("2d");
  const width = beatViz.width;
  const height = beatViz.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(7, 8, 14, 0.55)";
  ctx.fillRect(0, 0, width, height);

  const running = Boolean(beatTimerId);
  const bars = 32;
  const gap = 3;
  const barW = (width - gap * (bars + 1)) / bars;
  const t = performance.now() / 1000;
  const bpm = Number(bpmInput.value) || 96;

  for (let i = 0; i < bars; i += 1) {
    const phase = running
      ? Math.abs(Math.sin(t * (bpm / 60) * Math.PI + i * 0.35))
      : 0.12 + (i % 4 === 0 ? 0.08 : 0);
    const flashBoost = vizFlash * (vizKind === "kick" ? 1 : vizKind === "snare" ? 0.7 : 0.4);
    const h = Math.max(4, (phase * 0.55 + flashBoost * 0.45) * (height - 12));
    const x = gap + i * (barW + gap);
    const y = (height - h) / 2;

    const isDownbeat = i % 4 === 0;
    ctx.fillStyle = isDownbeat
      ? `rgba(98, 163, 255, ${0.35 + flashBoost * 0.55})`
      : `rgba(92, 214, 169, ${0.2 + phase * 0.45})`;
    const radius = Math.min(3, barW / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barW, h, radius);
    } else {
      ctx.rect(x, y, barW, h);
    }
    ctx.fill();
  }

  vizFlash *= 0.86;
  requestAnimationFrame(drawBeatViz);
}

/**
 * One-Tap: Daily-Challenge in den Trainer laden und Beat starten.
 */
function startChallenge(options = {}) {
  const {
    bpm,
    bars,
    keywords,
    wordPack,
    start = true,
  } = options;

  if (bpm) {
    bpmInput.value = String(bpm);
    bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (bars) {
    barsInput.value = String(bars);
  }

  const words = keywords || (wordPack && wordPack.words) || [];
  if (words.length > 0) {
    keywordsInput.value = words.slice(0, 3).join(", ");
  }

  generateLyrics();

  if (start) {
    stopBeat();
    startBeat();
  }

  lyricsWrap?.scrollIntoView({ behavior: "smooth", block: "center" });
  updateStatus("Challenge geladen – Flow!");
}

window.FlowForge = {
  startChallenge,
  generateLyrics,
  startBeat,
  stopBeat,
  isBeatRunning: () => Boolean(beatTimerId),
  setBpm: (bpm) => {
    bpmInput.value = String(bpm);
    bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
  },
};

bpmInput.addEventListener("input", () => {
  bpmValue.textContent = bpmInput.value;

  if (beatTimerId) {
    stopBeat();
    startBeat();
  }
});

[fxLowpass, fxDelay, fxDistortion, fxReverb].forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    if (!audioContext || !mediaStream) {
      return;
    }
    rebuildFxGraph();
    updateStatus("Effekte aktualisiert");
  });
});

generateLyricsButton.addEventListener("click", generateLyrics);
startBeatButton.addEventListener("click", startBeat);
stopBeatButton.addEventListener("click", stopBeat);
recordToggleButton.addEventListener("click", toggleRecording);

window.setInterval(calculateBarPosition, 50);
renderStreak();
drawBeatViz();
generateLyrics();
