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
const beatGrid = document.getElementById("beatGrid");
const genreFilters = document.getElementById("genreFilters");
const beatUpload = document.getElementById("beatUpload");
const uploadMeta = document.getElementById("uploadMeta");
const clearUploadButton = document.getElementById("clearUpload");
const beatVolInput = document.getElementById("beatVol");
const micVolInput = document.getElementById("micVol");
const exportBarsInput = document.getElementById("exportBars");
const downloadBeatButton = document.getElementById("downloadBeat");
const beatFileLink = document.getElementById("beatFileLink");
const nowPlaying = document.getElementById("nowPlaying");
const beatBay = document.querySelector(".beat-bay");

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

let beatComp;
let schedulerId;
let transportOn = false;
let nextStepTime = 0;
let stepIndex = 0;
let beatStartedAt = 0;
let ambienceStop = null;
let uploadSource = null;
let lyricLines = [];
let activeBarIndex = -1;
let vizFlash = 0;
let vizKind = "hat";
let selectedId = "nacht-asphalt";
let playMode = "library";
let upload = null;
let genreFilter = "Alle";
let suppressBpm = false;
let renderingWav = false;
let lastBeatUrl = "";
let loopBars = 0;
let loopOrigin = 0;
let lastBarFloor = -1;
let lastLoopMark = 0;
let freestyle = null;
let takes = [];
let countingIn = false;
let countToken = 0;
let lastCoachedBar = -1;

const PRACTICE_KEY = "flowforge-practice";

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
  beatGain.gain.value = beatVolInput ? Number(beatVolInput.value) / 100 : 0.7;

  beatComp = audioContext.createDynamicsCompressor();
  beatComp.threshold.value = -16;
  beatComp.knee.value = 18;
  beatComp.ratio.value = 2.4;
  beatComp.attack.value = 0.008;
  beatComp.release.value = 0.18;

  micGain = audioContext.createGain();
  micGain.gain.value = micVolInput ? Number(micVolInput.value) / 100 : 1;

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

  beatGain.connect(beatComp);
  beatComp.connect(masterGain);
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
}

function rebuildFxGraph() {
  const nodes = [micGain, lowpassFilter, delayNode, delayFeedback, distortionNode, reverbConvolver, dryGain];
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
    delayNode.delayTime.value = 0.24;
    delayFeedback.gain.value = 0.33;
    micGain.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(masterGain);
  }

  micGain.connect(masterGain);
}

function currentBeat() {
  return window.FlowBeats ? window.FlowBeats.byId(selectedId) : null;
}

function setBpmValue(bpm, restart) {
  suppressBpm = true;
  bpmInput.value = String(bpm);
  bpmValue.textContent = bpmInput.value;
  suppressBpm = false;
  if (restart && transportOn && playMode === "library") {
    stopBeat({ silent: true });
    startBeat();
  }
}

function updateNowPlaying() {
  if (playMode === "library") {
    const label = document.querySelector(`.beat-card[data-id="${selectedId}"] .beat-bpm`);
    if (label) label.textContent = `${bpmInput.value} BPM`;
  }
  if (!nowPlaying) return;
  if (playMode === "upload" && upload) {
    nowPlaying.textContent = `Gewählt: ${upload.name} · eigener Beat`;
    return;
  }
  const beat = currentBeat();
  nowPlaying.textContent = beat
    ? `Gewählt: ${beat.name} · ${beat.genre} · ${bpmInput.value} BPM`
    : "Kein Beat gewählt";
}

function makePeaks(buffer, count = 48) {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const step = Math.max(1, Math.floor(block / 32));
  const peaks = [];
  for (let i = 0; i < count; i += 1) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block; j += step) {
      max = Math.max(max, Math.abs(data[start + j] || 0));
    }
    peaks.push(max);
  }
  return peaks;
}

function paintCards() {
  if (!beatGrid) return;
  beatGrid.querySelectorAll(".beat-card").forEach((card) => {
    const id = card.dataset.id;
    const selected = playMode === "upload" ? id === "upload" : id === selectedId;
    const playing = transportOn && selected;
    card.classList.toggle("is-selected", selected);
    card.classList.toggle("is-playing", playing);
    const play = card.querySelector(".card-play");
    if (play) play.textContent = playing ? "Stop" : "Play";
  });
  updateNowPlaying();
}

function miniSteps(beat) {
  const row = document.createElement("div");
  row.className = "mini-steps";
  row.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 16; i += 1) {
    const bar = document.createElement("i");
    let height = 4;
    let kind = "rest";
    if (beat.hat[i]) {
      height = 10;
      kind = "hat";
    }
    if (beat.snare[i]) {
      height = 18;
      kind = "snare";
    }
    if (beat.kick[i]) {
      height = 26;
      kind = "kick";
    }
    bar.style.height = `${height}px`;
    bar.dataset.kind = kind;
    row.append(bar);
  }
  return row;
}

function selectBeat(id, opts = {}) {
  const beat = window.FlowBeats.byId(id);
  if (!beat) return;
  const wasPlaying = transportOn;
  if (wasPlaying) stopBeat({ silent: true });
  playMode = "library";
  selectedId = id;
  if (!opts.keepBpm) setBpmValue(beat.bpm, false);
  if (wasPlaying && opts.restart !== false) startBeat();
  else paintCards();
}

function selectPattern(name) {
  const id = window.FlowBeats.PATTERN_MAP[name];
  if (id) selectBeat(id, { keepBpm: true });
}

function renderBeatLibrary() {
  if (!beatGrid || !genreFilters || !window.FlowBeats) return;
  const genres = ["Alle", ...new Set(window.FlowBeats.BEATS.map((beat) => beat.genre))];
  genreFilters.replaceChildren();
  genres.forEach((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `genre-chip${genre === genreFilter ? " is-on" : ""}`;
    button.textContent = genre;
    button.addEventListener("click", () => {
      genreFilter = genre;
      renderBeatLibrary();
    });
    genreFilters.append(button);
  });

  beatGrid.replaceChildren();
  if (upload) beatGrid.append(uploadCard());
  window.FlowBeats.BEATS
    .filter((beat) => genreFilter === "Alle" || beat.genre === genreFilter)
    .forEach((beat) => beatGrid.append(libraryCard(beat)));
  updateNowPlaying();
}

function libraryCard(beat) {
  const card = document.createElement("article");
  card.className = "beat-card";
  card.dataset.id = beat.id;

  const top = document.createElement("div");
  top.className = "beat-card-top";
  const genre = document.createElement("span");
  genre.className = "beat-genre";
  genre.textContent = beat.genre;
  const bpm = document.createElement("span");
  bpm.className = "beat-bpm";
  bpm.textContent = `${beat.bpm} BPM`;
  top.append(genre, bpm);

  const title = document.createElement("h3");
  title.textContent = beat.name;

  const actions = document.createElement("div");
  actions.className = "beat-actions";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "btn tiny card-play";
  play.textContent = "Play";
  play.addEventListener("click", (event) => {
    event.stopPropagation();
    if (playMode === "library" && selectedId === beat.id && transportOn) {
      stopBeat();
      return;
    }
    selectBeat(beat.id);
    if (!transportOn) startBeat();
  });
  const wav = document.createElement("button");
  wav.type = "button";
  wav.className = "btn tiny muted";
  wav.textContent = "WAV";
  wav.addEventListener("click", (event) => {
    event.stopPropagation();
    downloadLibraryBeat(beat, beat.bpm, 8);
  });
  actions.append(play, wav);

  card.append(top, title, miniSteps(beat), actions);
  card.addEventListener("click", () => selectBeat(beat.id));
  const selected = playMode === "library" && selectedId === beat.id;
  card.classList.toggle("is-selected", selected);
  card.classList.toggle("is-playing", transportOn && selected);
  if (transportOn && selected) play.textContent = "Stop";
  return card;
}

function uploadCard() {
  const card = document.createElement("article");
  card.className = "beat-card upload-card";
  card.dataset.id = "upload";
  const top = document.createElement("div");
  top.className = "beat-card-top";
  const genre = document.createElement("span");
  genre.className = "beat-genre";
  genre.textContent = "Eigen";
  const bpm = document.createElement("span");
  bpm.className = "beat-bpm";
  bpm.textContent = formatClock(upload.buffer.duration);
  top.append(genre, bpm);
  const title = document.createElement("h3");
  title.textContent = upload.name;
  const actions = document.createElement("div");
  actions.className = "beat-actions";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "btn tiny card-play";
  play.textContent = "Play";
  play.addEventListener("click", (event) => {
    event.stopPropagation();
    if (playMode === "upload" && transportOn) {
      stopBeat();
      return;
    }
    playMode = "upload";
    if (transportOn) stopBeat({ silent: true });
    startBeat();
  });
  actions.append(play);
  card.append(top, title, actions);
  card.addEventListener("click", () => {
    playMode = "upload";
    if (transportOn) {
      stopBeat({ silent: true });
      startBeat();
    } else {
      paintCards();
    }
  });
  const selected = playMode === "upload";
  card.classList.toggle("is-selected", selected);
  card.classList.toggle("is-playing", transportOn && selected);
  if (transportOn && selected) play.textContent = "Stop";
  return card;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function rememberDownload(blobOrFile, filename) {
  if (lastBeatUrl) URL.revokeObjectURL(lastBeatUrl);
  lastBeatUrl = URL.createObjectURL(blobOrFile);
  if (!beatFileLink) return;
  beatFileLink.href = lastBeatUrl;
  beatFileLink.download = filename;
  beatFileLink.hidden = false;
  beatFileLink.textContent = `Speichern: ${filename}`;
  beatFileLink.click();
}

async function downloadLibraryBeat(beat, bpm, bars) {
  if (!beat || renderingWav || !window.FlowBeats) return;
  renderingWav = true;
  if (downloadBeatButton) downloadBeatButton.disabled = true;
  updateStatus("WAV wird erzeugt …");
  try {
    const blob = await window.FlowBeats.renderWav(beat, bpm, bars);
    rememberDownload(blob, `flowforge-${beat.id}-${bpm}bpm-${bars}takte.wav`);
    updateStatus("Lizenzfreier Beat bereit");
  } catch (_error) {
    updateStatus("WAV konnte nicht erzeugt werden", false);
  } finally {
    renderingWav = false;
    if (downloadBeatButton) downloadBeatButton.disabled = false;
  }
}

async function loadUploadFile(file) {
  if (!file) return;
  try {
    ensureAudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    const raw = await file.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(raw.slice(0));
    upload = { file, buffer, name: file.name, peaks: makePeaks(buffer) };
    playMode = "upload";
    const wasPlaying = transportOn;
    if (wasPlaying) stopBeat({ silent: true });
    if (uploadMeta) uploadMeta.textContent = `${file.name} · ${formatClock(buffer.duration)} · lokal`;
    if (clearUploadButton) clearUploadButton.hidden = false;
    renderBeatLibrary();
    updateStatus(`${file.name} geladen`);
    if (wasPlaying) startBeat();
  } catch (_error) {
    updateStatus("Datei ist kein abspielbares Audio", false);
  }
}

function clearUpload() {
  if (playMode === "upload" && transportOn) stopBeat({ silent: true });
  upload = null;
  playMode = "library";
  if (uploadMeta) uploadMeta.textContent = "WAV, MP3 oder M4A. Bleibt lokal im Browser.";
  if (clearUploadButton) clearUploadButton.hidden = true;
  renderBeatLibrary();
  updateStatus("Upload entfernt");
}

function startLibraryScheduler(beat) {
  const bpm = Number(bpmInput.value) || beat.bpm;
  const stepDur = (60 / bpm) / 4;
  nextStepTime = audioContext.currentTime + 0.05;
  stepIndex = 0;
  ambienceStop = window.FlowBeats.startAmbience(audioContext, beatGain, beat);
  const swing = beat.swing || 0;

  const tick = () => {
    const horizon = audioContext.currentTime + 0.14;
    while (nextStepTime < horizon) {
      let time = nextStepTime;
      if (stepIndex % 2 === 1) time += stepDur * swing;
      const info = window.FlowBeats.hit(audioContext, beatGain, beat, stepIndex, time);
      if (info.kick) {
        vizFlash = 1;
        vizKind = "kick";
      } else if (info.snare) {
        vizFlash = Math.max(vizFlash, 0.75);
        vizKind = "snare";
      } else if (info.hat && vizFlash < 0.35) {
        vizFlash = 0.35;
        vizKind = "hat";
      }
      nextStepTime += stepDur;
      stepIndex += 1;
    }
  };

  tick();
  schedulerId = window.setInterval(tick, 25);
}

function startUploadPlayback() {
  uploadSource = audioContext.createBufferSource();
  uploadSource.buffer = upload.buffer;
  uploadSource.loop = true;
  uploadSource.connect(beatGain);
  uploadSource.start();
}

function startBeat() {
  ensureAudioContext();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (transportOn) return;

  beatStartedAt = performance.now();
  activeBarIndex = -1;
  lastBarFloor = -1;
  lastLoopMark = 0;
  transportOn = true;

  if (playMode === "upload" && upload) {
    startUploadPlayback();
    bumpStreak();
    paintCards();
    updateStatus("Eigener Beat läuft");
    return;
  }

  const beat = currentBeat();
  if (!beat) {
    transportOn = false;
    updateStatus("Kein Beat gewählt", false);
    return;
  }

  startLibraryScheduler(beat);
  bumpStreak();
  paintCards();
  updateStatus(`${beat.name} läuft`);
}

function stopBeat(opts = {}) {
  transportOn = false;
  if (schedulerId) {
    window.clearInterval(schedulerId);
    schedulerId = undefined;
  }
  if (ambienceStop) {
    ambienceStop();
    ambienceStop = null;
  }
  if (uploadSource) {
    try {
      uploadSource.stop();
    } catch (_error) {
      // already stopped
    }
    try {
      uploadSource.disconnect();
    } catch (_error) {
      // node may already be disconnected
    }
    uploadSource = null;
  }

  barPositionText.textContent = "0.0";
  activeBarText.textContent = "–";
  lastBarFloor = -1;
  lastLoopMark = 0;
  setActiveLyric(-1);
  paintPocket(null);
  paintCards();
  if (!opts.silent) updateStatus("Beat gestoppt", false);
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

function currentAbsoluteBars() {
  if (!transportOn || !beatStartedAt) return 0;
  const elapsed = (performance.now() - beatStartedAt) / 1000;
  return (elapsed * (Number(bpmInput.value) / 60)) / 4;
}

function practiceBars(absolute) {
  if (!loopBars) return absolute;
  const into = absolute - loopOrigin;
  const wrapped = ((into % loopBars) + loopBars) % loopBars;
  return loopOrigin + wrapped;
}

function calculateBarPosition() {
  if (!beatStartedAt || !transportOn) return;

  const absolute = currentAbsoluteBars();
  const shown = practiceBars(absolute);
  barPositionText.textContent = shown.toFixed(2);
  paintPocket(shown - Math.floor(shown));

  const floorAbs = Math.floor(absolute);
  if (lastBarFloor < 0) lastBarFloor = floorAbs;
  else if (floorAbs > lastBarFloor) {
    addPracticeBars(floorAbs - lastBarFloor);
    lastBarFloor = floorAbs;
  }

  if (loopBars > 0) {
    const mark = Math.floor((absolute - loopOrigin) / loopBars);
    if (mark > lastLoopMark) {
      addPracticeLoops(mark - lastLoopMark);
      lastLoopMark = mark;
    }
  }

  if (lyricLines.length > 0) {
    const idx = Math.min(lyricLines.length - 1, Math.max(0, Math.floor(shown)));
    setActiveLyric(idx);
    if (idx !== lastCoachedBar && window.FlowRhymes) {
      lastCoachedBar = idx;
      const input = document.getElementById("rhymeInput");
      if (!input || document.activeElement !== input) {
        const word = window.FlowRhymes.lastWord(lyricLines[idx].line);
        if (word) showRhymes(word);
      }
    }
  }

  if (freestyle && !freestyle.done) {
    const bar = Math.floor(absolute);
    if (bar !== freestyle.shown && bar < freestyle.length) {
      freestyle.shown = bar;
      const cue = window.FlowRhymes.cueFor(freestyle.seed, bar);
      freestyle.history[bar] = cue;
      paintFreestyleCue(`${bar + 1}/${freestyle.length}  ${cue}`);
    }
    if (bar >= freestyle.length) finishFreestyle();
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

function flowTargetValue() {
  const input = document.getElementById("flowTarget");
  return Number(input && input.value) || 3;
}

function flowVerdict(density) {
  const delta = density - flowTargetValue();
  if (delta > 0.6) return { key: "hot", label: "zu dicht" };
  if (delta < -0.6) return { key: "thin", label: "Luft" };
  return { key: "ok", label: "sitzt" };
}

function refreshLine(entry, row) {
  const syllables = estimateSyllables(entry.line);
  const density = syllables / 4;
  entry.syllables = syllables;
  entry.density = density.toFixed(1);
  const verdict = flowVerdict(density);
  row.dataset.flow = verdict.key;
  const meta = row.querySelector(".lyric-meta");
  if (meta) {
    meta.textContent = `~${syllables} Silben · ${entry.density}/Beat · Ziel ${flowTargetValue().toFixed(1)} · ${verdict.label}`;
  }
}

function paintScheme() {
  if (!window.FlowRhymes) return;
  const letters = window.FlowRhymes.scheme(lyricLines.map((entry) => entry.line));
  lyricsOutput.querySelectorAll(".lyric-row").forEach((row, index) => {
    const badge = row.querySelector(".scheme");
    if (badge) badge.textContent = letters[index] || "·";
  });
  const schemeLine = document.getElementById("schemeLine");
  if (schemeLine) schemeLine.textContent = letters.filter((letter) => letter && letter !== "·").join(" ") || "–";
}

function renderLyrics(lines) {
  lyricLines = lines;
  lyricsOutput.replaceChildren();
  lastCoachedBar = -1;

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "channel-empty";
    empty.textContent = "Noch kein Text. Trag mindestens zwei Schlagwörter ein.";
    lyricsOutput.append(empty);
    paintScheme();
    return;
  }

  lines.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "lyric-row";
    row.dataset.bar = String(entry.bar);

    const top = document.createElement("div");
    top.className = "lyric-top";

    const barNo = document.createElement("span");
    barNo.className = "bar-no";
    barNo.textContent = `Bar ${String(entry.bar).padStart(2, "0")}`;

    const scheme = document.createElement("span");
    scheme.className = "scheme";
    scheme.textContent = "·";

    const text = document.createElement("span");
    text.className = "lyric-text lyric-main";
    text.contentEditable = "true";
    text.spellcheck = false;
    text.setAttribute("role", "textbox");
    text.setAttribute("aria-label", `Bar ${entry.bar}`);
    text.textContent = entry.line;
    text.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    text.addEventListener("input", () => {
      entry.line = text.textContent.replace(/\n/g, " ");
      refreshLine(entry, row);
      paintScheme();
    });
    text.addEventListener("focus", () => {
      const index = lyricLines.indexOf(entry);
      if (index >= 0) setActiveLyric(index);
    });

    top.append(barNo, scheme, text);

    const meta = document.createElement("p");
    meta.className = "lyric-meta";
    row.append(top, meta);
    refreshLine(entry, row);
    lyricsOutput.append(row);
  });

  paintScheme();
  setActiveLyric(-1);
}

function loadPractice() {
  const today = todayKey();
  try {
    const data = JSON.parse(localStorage.getItem(PRACTICE_KEY) || "null");
    const best = data && Number(data.freestyleBest) ? Number(data.freestyleBest) : 0;
    if (!data || data.day !== today) return { day: today, bars: 0, loops: 0, freestyleBest: best };
    return {
      day: today,
      bars: Number(data.bars) || 0,
      loops: Number(data.loops) || 0,
      freestyleBest: best,
    };
  } catch (_error) {
    return { day: today, bars: 0, loops: 0, freestyleBest: 0 };
  }
}

function savePractice(data) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(data));
}

function renderPractice() {
  const data = loadPractice();
  const bars = document.getElementById("statBars");
  const loops = document.getElementById("statLoops");
  const free = document.getElementById("statFree");
  if (bars) bars.textContent = String(data.bars);
  if (loops) loops.textContent = String(data.loops);
  if (free) free.textContent = data.freestyleBest ? String(data.freestyleBest) : "–";
}

function addPracticeBars(count) {
  if (!count) return;
  const data = loadPractice();
  data.bars += count;
  savePractice(data);
  renderPractice();
}

function addPracticeLoops(count) {
  if (!count) return;
  const data = loadPractice();
  data.loops += count;
  savePractice(data);
  renderPractice();
}

function buildPocket() {
  const root = document.getElementById("pocket");
  if (!root || root.childElementCount) return;
  for (let beat = 0; beat < 4; beat += 1) {
    const column = document.createElement("div");
    column.className = "pocket-beat";
    const label = document.createElement("span");
    label.textContent = String(beat + 1);
    column.append(label);
    for (let step = 0; step < 4; step += 1) {
      const tick = document.createElement("i");
      tick.dataset.step = String(beat * 4 + step);
      column.append(tick);
    }
    root.append(column);
  }
}

function paintPocket(fraction) {
  const root = document.getElementById("pocket");
  if (!root) return;
  const active = fraction == null ? -1 : Math.min(15, Math.floor(fraction * 16));
  root.querySelectorAll("i").forEach((tick) => {
    tick.classList.toggle("is-on", Number(tick.dataset.step) === active);
  });
  root.querySelectorAll(".pocket-beat").forEach((column, index) => {
    column.classList.toggle("is-down", active >= 0 && index === Math.floor(active / 4));
  });
}

function setLoop(bars) {
  loopBars = bars;
  const absolute = currentAbsoluteBars();
  loopOrigin = Math.floor(absolute);
  if (bars > 0 && lyricLines.length) {
    loopOrigin = Math.min(loopOrigin, Math.max(0, lyricLines.length - bars));
  }
  lastLoopMark = 0;
  document.querySelectorAll("[data-loop]").forEach((button) => {
    button.classList.toggle("is-on", Number(button.dataset.loop) === bars);
  });
  updateStatus(bars ? `Loop ${bars} ${bars === 1 ? "Takt" : "Takte"}` : "Loop aus");
}

function showRhymes(raw) {
  const input = document.getElementById("rhymeInput");
  const host = document.getElementById("rhymeResults");
  if (!host || !window.FlowRhymes) return;
  const word = String(raw || "").trim();
  if (input && word && document.activeElement !== input) input.value = word;
  const query = (input && input.value.trim()) || word;
  host.replaceChildren();
  if (!query) return;

  const extra = lyricLines.flatMap((entry) => entry.line.split(/\s+/));
  const result = window.FlowRhymes.suggest(query, extra);
  const groups = [
    ["Mehrsilbig", result.multi],
    ["Perfekt", result.perfect],
    ["Assonanz", result.family],
  ];
  groups.forEach(([label, list]) => {
    if (!list.length) return;
    const block = document.createElement("div");
    block.className = "rhyme-group";
    const title = document.createElement("p");
    title.className = "rhyme-label";
    title.textContent = label;
    const chips = document.createElement("div");
    chips.className = "chips";
    list.forEach((rhyme) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rhyme-chip";
      button.textContent = rhyme;
      button.addEventListener("click", () => insertRhyme(rhyme));
      chips.append(button);
    });
    block.append(title, chips);
    host.append(block);
  });
  if (!host.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "channel-empty";
    empty.textContent = "Kein Treffer im Lexikon. Anderes Wort versuchen.";
    host.append(empty);
  }
}

function insertRhyme(word) {
  const index = activeBarIndex >= 0 ? activeBarIndex : 0;
  const entry = lyricLines[index];
  const fields = lyricsOutput.querySelectorAll(".lyric-text");
  const field = fields[index];
  if (!entry || !field) {
    updateStatus(`„${word}“ – erst eine Zeile erzeugen`, false);
    return;
  }
  const current = field.textContent.replace(/\s+$/g, "");
  field.textContent = current ? `${current} ${word}` : word;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  updateStatus(`„${word}“ in Bar ${index + 1}`);
}

function paintFreestyleCue(text) {
  const cue = document.getElementById("freestyleCue");
  if (!cue) return;
  cue.hidden = false;
  cue.textContent = text;
}

function startFreestyle() {
  if (!window.FlowRhymes) return;
  const length = Math.min(16, Math.max(4, Number(barsInput.value) || 8));
  freestyle = {
    length,
    seed: Math.floor(Math.random() * 1000),
    shown: -1,
    history: [],
    done: false,
  };
  const button = document.getElementById("freestyleToggle");
  if (button) {
    button.classList.add("is-on");
    button.textContent = "Runde läuft";
  }
  const adopt = document.getElementById("adoptFreestyle");
  if (adopt) adopt.hidden = true;
  if (loopBars) setLoop(0);
  if (transportOn) stopBeat({ silent: true });
  startBeat();
  updateStatus(`Freestyle · ${length} Takte`);
}

function finishFreestyle() {
  if (!freestyle || freestyle.done) return;
  freestyle.done = true;
  const score = freestyle.history.filter(Boolean).length;
  const data = loadPractice();
  if (score > data.freestyleBest) data.freestyleBest = score;
  savePractice(data);
  renderPractice();
  const button = document.getElementById("freestyleToggle");
  if (button) {
    button.classList.remove("is-on");
    button.textContent = "Freestyle-Runde";
  }
  const adopt = document.getElementById("adoptFreestyle");
  if (adopt) adopt.hidden = freestyle.history.length === 0;
  paintFreestyleCue(`Runde ${score}/${freestyle.length}. Schreib sie auf, solange sie noch im Kopf ist.`);
  updateStatus(`Freestyle ${score}/${freestyle.length}`);
}

function stopFreestyle() {
  freestyle = null;
  const button = document.getElementById("freestyleToggle");
  if (button) {
    button.classList.remove("is-on");
    button.textContent = "Freestyle-Runde";
  }
  const cue = document.getElementById("freestyleCue");
  if (cue) cue.hidden = true;
  const adopt = document.getElementById("adoptFreestyle");
  if (adopt) adopt.hidden = true;
}

function adoptFreestyle() {
  if (!freestyle || !freestyle.history.length) return;
  const lines = freestyle.history.filter(Boolean).map((cue, index) => {
    const line = cue.replace(" · ", " und ");
    const syllables = estimateSyllables(line);
    return {
      bar: index + 1,
      line,
      syllables,
      density: (syllables / 4).toFixed(1),
    };
  });
  renderLyrics(lines);
  updateStatus("Cues stehen im Text");
}

function playCountClicks() {
  ensureAudioContext();
  const bpm = Number(bpmInput.value) || 96;
  const beat = 60 / bpm;
  const start = audioContext.currentTime + 0.05;
  for (let i = 0; i < 4; i += 1) {
    const time = start + i * beat;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "square";
    osc.frequency.value = i === 0 ? 880 : 660;
    gain.gain.setValueAtTime(i === 0 ? 0.18 : 0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }
  return beat * 4 * 1000;
}

function renderTakes() {
  const host = document.getElementById("takes");
  if (!host) return;
  host.replaceChildren();
  takes.forEach((take, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn tiny muted take-btn";
    button.textContent = `Take ${takes.length - index} · ${take.bars.toFixed(1)} Takte`;
    button.addEventListener("click", () => {
      playback.src = take.url;
      playback.play().catch(() => {});
      host.querySelectorAll(".take-btn").forEach((node) => node.classList.remove("is-on"));
      button.classList.add("is-on");
    });
    host.append(button);
  });
}

function pushTake(blob, type, startedAt) {
  const seconds = Math.max(0, (performance.now() - startedAt) / 1000);
  const bars = (seconds * (Number(bpmInput.value) / 60)) / 4;
  const url = URL.createObjectURL(blob);
  takes.unshift({ url, type, bars });
  if (takes.length > 4) {
    const dropped = takes.pop();
    URL.revokeObjectURL(dropped.url);
  }
  renderTakes();
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
  if (lyricLines[0] && window.FlowRhymes) {
    showRhymes(window.FlowRhymes.lastWord(lyricLines[0].line));
  }
  updateStatus("Lyrics erzeugt");
}

function recorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function toggleRecording() {
  ensureAudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordToggleButton.textContent = "● Aufnahme starten";
    updateStatus("Aufnahme gestoppt");
    return;
  }

  if (countingIn) {
    countToken += 1;
    countingIn = false;
    recordToggleButton.textContent = "● Aufnahme starten";
    updateStatus("Count-in abgebrochen", false);
    return;
  }

  if (!mediaStream) {
    try {
      await setupMicrophone();
    } catch (_error) {
      updateStatus("Mikrofonzugriff verweigert", false);
      return;
    }
  }

  const token = countToken + 1;
  countToken = token;
  const useCount = document.getElementById("countIn")?.checked;
  if (useCount && !transportOn) {
    countingIn = true;
    recordToggleButton.textContent = "■ Count-in";
    const wait = playCountClicks();
    updateStatus("Count-in · 1 2 3 4");
    await new Promise((resolve) => window.setTimeout(resolve, wait));
    countingIn = false;
    if (token !== countToken) return;
  } else if (useCount && transportOn) {
    countingIn = true;
    recordToggleButton.textContent = "■ Count-in";
    const wait = playCountClicks();
    updateStatus("Count-in über dem Beat");
    await new Promise((resolve) => window.setTimeout(resolve, wait));
    countingIn = false;
    if (token !== countToken) return;
  }

  if (!transportOn) startBeat();

  recordedChunks = [];
  const mime = recorderMime();
  const startedAt = performance.now();
  mediaRecorder = mime
    ? new MediaRecorder(recordDestination.stream, { mimeType: mime })
    : new MediaRecorder(recordDestination.stream);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(recordedChunks, { type });
    const url = URL.createObjectURL(blob);
    const ext = type.includes("mp4") ? "m4a" : "webm";
    playback.src = url;
    downloadLink.href = url;
    downloadLink.download = `flowforge-aufnahme.${ext}`;
    downloadLink.hidden = false;
    pushTake(blob, type, startedAt);
    updateStatus("Take liegt bereit – Beat und Stimme");
  };

  mediaRecorder.start();
  recordToggleButton.textContent = "■ Aufnahme stoppen";
  updateStatus("Aufnahme läuft · Beat ist mit drauf");
}

function roundBar(ctx, x, y, w, h) {
  const radius = Math.min(3, w / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function drawBeatViz() {
  if (!beatViz) return;

  const ctx = beatViz.getContext("2d");
  const width = beatViz.width;
  const height = beatViz.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#17150f";
  ctx.fillRect(0, 0, width, height);

  const bpm = Number(bpmInput.value) || 96;
  const stepDur = (60 / bpm) / 4;
  const elapsed = transportOn ? (performance.now() - beatStartedAt) / 1000 : 0;

  if (playMode === "upload" && upload && upload.peaks) {
    const peaks = upload.peaks;
    const gap = 2;
    const barW = (width - gap * (peaks.length + 1)) / peaks.length;
    const pos = transportOn ? (elapsed % upload.buffer.duration) / upload.buffer.duration : 0;
    peaks.forEach((peak, i) => {
      const h = Math.max(3, peak * (height - 16));
      const x = gap + i * (barW + gap);
      const y = (height - h) / 2;
      const played = i / peaks.length <= pos;
      ctx.fillStyle = played ? "rgba(223, 242, 90, 0.9)" : "rgba(246, 241, 231, 0.28)";
      roundBar(ctx, x, y, barW, h);
    });
    vizFlash *= 0.86;
    requestAnimationFrame(drawBeatViz);
    return;
  }

  const beat = currentBeat();
  const cells = 32;
  const gap = 3;
  const barW = (width - gap * (cells + 1)) / cells;
  const playStep = transportOn && beat ? Math.floor(elapsed / stepDur) % beat.kick.length : -1;

  for (let i = 0; i < cells; i += 1) {
    const idx = beat ? i % beat.kick.length : i;
    let level = 0.08;
    let color = "rgba(246, 241, 231, 0.16)";
    if (beat && beat.hat[idx]) {
      level = 0.28;
      color = "rgba(246, 241, 231, 0.38)";
    }
    if (beat && beat.snare[idx]) {
      level = 0.62;
      color = "rgba(255, 193, 74, 0.85)";
    }
    if (beat && beat.kick[idx]) {
      level = 0.95;
      color = "rgba(223, 242, 90, 0.92)";
    }
    const flashBoost = i === playStep ? vizFlash : 0;
    const h = Math.max(4, (level * 0.75 + flashBoost * 0.25) * (height - 14));
    const x = gap + i * (barW + gap);
    const y = (height - h) / 2;
    ctx.fillStyle = i === playStep ? "#f6f1e7" : color;
    roundBar(ctx, x, y, barW, h);
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
    pattern,
    start = true,
  } = options;

  if (pattern) selectPattern(pattern);

  if (bpm) setBpmValue(bpm, false);

  if (bars) {
    barsInput.value = String(bars);
  }

  const words = keywords || (wordPack && wordPack.words) || [];
  if (words.length > 0) {
    keywordsInput.value = words.slice(0, 3).join(", ");
  }

  generateLyrics();

  if (start) {
    stopBeat({ silent: true });
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
  isBeatRunning: () => transportOn,
  setBpm: (bpm) => setBpmValue(bpm, true),
  selectBeat,
  selectPattern,
  beats: () => window.FlowBeats.BEATS.map((beat) => ({
    id: beat.id,
    name: beat.name,
    genre: beat.genre,
    bpm: beat.bpm,
    pattern: beat.pattern,
  })),
  renderCurrentWav: (bars = 4) => {
    const beat = currentBeat();
    return window.FlowBeats.renderWav(beat, Number(bpmInput.value), bars);
  },
  useUploadBuffer(buffer, name) {
    upload = {
      file: new File([], name || "upload.wav"),
      buffer,
      name: name || "upload.wav",
      peaks: makePeaks(buffer),
    };
    playMode = "upload";
    if (clearUploadButton) clearUploadButton.hidden = false;
    if (uploadMeta) uploadMeta.textContent = `${upload.name} · ${formatClock(buffer.duration)} · lokal`;
    renderBeatLibrary();
  },
  state: () => ({
    transportOn,
    playMode,
    selectedId,
    bpm: Number(bpmInput.value),
    status: statusText.textContent,
    bar: barPositionText.textContent,
    step: stepIndex,
    loopBars,
    freestyle: freestyle ? { length: freestyle.length, done: freestyle.done, history: freestyle.history.slice() } : null,
    takes: takes.length,
    practice: loadPractice(),
  }),
  suggest: (word) => window.FlowRhymes.suggest(word),
  setLoop,
  startFreestyle,
  showRhymes,
};

bpmInput.addEventListener("input", () => {
  bpmValue.textContent = bpmInput.value;
  updateNowPlaying();
  if (suppressBpm) return;
  if (transportOn && playMode === "library") {
    stopBeat({ silent: true });
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
stopBeatButton.addEventListener("click", () => stopBeat());
recordToggleButton.addEventListener("click", toggleRecording);

if (beatVolInput) {
  beatVolInput.addEventListener("input", () => {
    if (beatGain) beatGain.gain.value = Number(beatVolInput.value) / 100;
  });
}
if (micVolInput) {
  micVolInput.addEventListener("input", () => {
    if (micGain) micGain.gain.value = Number(micVolInput.value) / 100;
  });
}
if (downloadBeatButton) {
  downloadBeatButton.addEventListener("click", () => {
    if (playMode === "upload" && upload) {
      if (upload.file && upload.file.size) {
        rememberDownload(upload.file, upload.file.name || "eigener-beat");
      } else {
        rememberDownload(window.FlowBeats.audioBufferToWav(upload.buffer), "flowforge-eigener-beat.wav");
      }
      updateStatus("Eigener Beat bereit");
      return;
    }
    const bars = Number(exportBarsInput && exportBarsInput.value) || 8;
    downloadLibraryBeat(currentBeat(), Number(bpmInput.value), bars);
  });
}
if (beatUpload) {
  beatUpload.addEventListener("change", () => {
    const file = beatUpload.files && beatUpload.files[0];
    beatUpload.value = "";
    loadUploadFile(file);
  });
}
if (clearUploadButton) {
  clearUploadButton.addEventListener("click", clearUpload);
}
if (beatBay) {
  beatBay.addEventListener("dragover", (event) => {
    event.preventDefault();
    beatBay.classList.add("is-drag");
  });
  beatBay.addEventListener("dragleave", () => beatBay.classList.remove("is-drag"));
  beatBay.addEventListener("drop", (event) => {
    event.preventDefault();
    beatBay.classList.remove("is-drag");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    loadUploadFile(file);
  });
}

document.querySelectorAll("[data-loop]").forEach((button) => {
  button.addEventListener("click", () => setLoop(Number(button.dataset.loop) || 0));
});

const freestyleToggle = document.getElementById("freestyleToggle");
if (freestyleToggle) {
  freestyleToggle.addEventListener("click", () => {
    if (freestyle && !freestyle.done) finishFreestyle();
    else startFreestyle();
  });
}

const adoptFreestyleButton = document.getElementById("adoptFreestyle");
if (adoptFreestyleButton) adoptFreestyleButton.addEventListener("click", adoptFreestyle);

const rhymeInput = document.getElementById("rhymeInput");
const rhymeFromLine = document.getElementById("rhymeFromLine");
if (rhymeInput) {
  rhymeInput.addEventListener("input", () => showRhymes(rhymeInput.value));
}
if (rhymeFromLine) {
  rhymeFromLine.addEventListener("click", () => {
    const index = activeBarIndex >= 0 ? activeBarIndex : 0;
    const entry = lyricLines[index];
    const word = entry && window.FlowRhymes ? window.FlowRhymes.lastWord(entry.line) : "";
    if (word) showRhymes(word);
    else updateStatus("Keine Zeile für den Reim", false);
  });
}

const flowTarget = document.getElementById("flowTarget");
if (flowTarget) {
  flowTarget.addEventListener("change", () => {
    lyricsOutput.querySelectorAll(".lyric-row").forEach((row, index) => {
      if (lyricLines[index]) refreshLine(lyricLines[index], row);
    });
  });
}

window.setInterval(calculateBarPosition, 50);
renderStreak();
renderPractice();
buildPocket();
renderBeatLibrary();
selectBeat(selectedId);
drawBeatViz();
if (keywordsInput.value.trim()) generateLyrics();
else renderLyrics([]);
