/*
 * LNZ.STD — Audio Uploader (developer tool)
 *
 * Load MP3/OGG → cut, speed, pitch, fades → optional cover → export MP3
 * → upload to Roblox through Open Cloud and get the asset IDs back.
 *
 * Everything except the upload runs in the browser. Uploads go through a
 * small relay (worker/roblox-proxy.js) because Roblox's API can't be called
 * from a web page directly.
 *
 * Shared upload, allowance and library code lives in roblox.js.
 */

// Roblox audio upload limits at the time of writing — check Creator Hub docs if uploads get rejected.
const ROBLOX_AUDIO_MAX_SECONDS = 7 * 60;
const ROBLOX_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
const SAMPLE_RATE = 44100;
const MP3_KBPS = 192;
const COVER_SIZE = 512;
const MIN_SELECTION = 0.1;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));

const state = {
  ctx: null,
  source: null,
  fileName: "",
  start: 0,
  end: 0,
  peaks: null,
  rendered: null,
  renderedKey: "",
  player: null,
  coverBlob: null,
  coverUrl: null,
  drag: null,
  busy: false,
};

/* ---------- UI helpers ---------- */

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function setBusy(busy) {
  state.busy = busy;
  ["upload-btn", "download-btn", "play"].forEach((id) => ($(id).disabled = busy || !state.source));
}

function settings() {
  return {
    speed: parseFloat($("speed").value),
    semis: parseInt($("pitch").value, 10),
    linked: $("link").checked,
    fadeIn: Math.max(0, parseFloat($("fade-in").value) || 0),
    fadeOut: Math.max(0, parseFloat($("fade-out").value) || 0),
  };
}

function outputSeconds() {
  const s = settings();
  return (state.end - state.start) / s.speed;
}

function refreshAdjustLabels() {
  const s = settings();
  $("speed-out").textContent = `${s.speed.toFixed(2)}×`;
  if (s.linked) {
    const st = 12 * Math.log2(s.speed);
    $("pitch-out").textContent = `${st >= 0 ? "+" : ""}${st.toFixed(1)} st`;
    $("pitch").disabled = true;
  } else {
    $("pitch-out").textContent = `${s.semis > 0 ? "+" : ""}${s.semis} st`;
    $("pitch").disabled = false;
  }
  if (state.source) {
    const secs = outputSeconds();
    const over = secs > ROBLOX_AUDIO_MAX_SECONDS;
    $("out-length").textContent = `Output length ${fmtTime(secs)}${over ? " — over Roblox's 7:00 limit, cut it shorter" : ""}`;
    $("out-length").classList.toggle("is-error", over);
  }
}

function invalidate() {
  state.rendered = null;
  stopPlay();
  refreshAdjustLabels();
}

/* ---------- audio loading & waveform ---------- */

async function loadAudio(file) {
  if (!/\.(mp3|ogg)$/i.test(file.name) && !/^audio\/(mpeg|mp3|ogg)/.test(file.type)) {
    showFileError("Only MP3 and OGG files are supported.");
    return;
  }
  try {
    state.ctx ||= new AudioContext({ sampleRate: SAMPLE_RATE });
    state.source = await state.ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    showFileError("Couldn't read this file. Some browsers (e.g. Safari) can't open OGG — try an MP3.");
    return;
  }
  state.fileName = file.name.replace(/\.[^.]+$/, "");
  state.start = 0;
  state.end = state.source.duration;
  if (!$("asset-name").value) $("asset-name").value = state.fileName.slice(0, 50);

  $("file-error").hidden = true;
  $("audio-drop").hidden = true;
  $("editor").hidden = false;
  $("file-name").textContent = file.name;
  $("file-meta").textContent = `${fmtTime(state.source.duration)} · ${state.source.numberOfChannels === 1 ? "mono" : "stereo"}`;
  $("trim-start").max = $("trim-end").max = state.source.duration.toFixed(1);

  invalidate();
  syncTrimInputs();
  sizeCanvas();
  setBusy(false);
}

function showFileError(msg) {
  $("file-error").textContent = msg;
  $("file-error").hidden = false;
}

function sizeCanvas() {
  const canvas = $("wave");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  computePeaks();
  drawWave();
}

function computePeaks() {
  if (!state.source) return;
  const cols = $("wave").width;
  const data = state.source.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / cols));
  const peaks = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    let max = 0;
    const from = c * per;
    for (let i = from; i < from + per && i < data.length; i += 4) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    peaks[c] = max;
  }
  state.peaks = peaks;
}

function drawWave() {
  const canvas = $("wave");
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim();
  const dim = css.getPropertyValue("--line-strong").trim();
  g.clearRect(0, 0, w, h);
  if (!state.peaks) return;

  const dur = state.source.duration;
  const x0 = (state.start / dur) * w;
  const x1 = (state.end / dur) * w;
  const mid = h / 2;

  for (let x = 0; x < w; x++) {
    const amp = Math.max(1, state.peaks[x] * (h / 2 - 6));
    g.fillStyle = x >= x0 && x <= x1 ? accent : dim;
    g.fillRect(x, mid - amp, 1, amp * 2);
  }

  const dpr = window.devicePixelRatio || 1;
  g.fillStyle = "rgba(10,10,10,0.55)";
  g.fillRect(0, 0, x0, h);
  g.fillRect(x1, 0, w - x1, h);
  g.fillStyle = "#ffffff";
  for (const x of [x0, x1]) {
    g.fillRect(x - dpr, 0, 2 * dpr, h);
    g.fillRect(x - 5 * dpr, 0, 10 * dpr, 10 * dpr);
  }
}

function syncTrimInputs() {
  $("trim-start").value = state.start.toFixed(1);
  $("trim-end").value = state.end.toFixed(1);
  drawWave();
  refreshAdjustLabels();
}

function setTrim(which, t) {
  const dur = state.source.duration;
  if (which === "start") state.start = Math.min(Math.max(0, t), state.end - MIN_SELECTION);
  else state.end = Math.max(Math.min(dur, t), state.start + MIN_SELECTION);
  invalidate();
  syncTrimInputs();
}

function setupWavePointer() {
  const canvas = $("wave");
  const timeAt = (e) => {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * state.source.duration;
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.source) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const sx = (state.start / state.source.duration) * r.width;
    const ex = (state.end / state.source.duration) * r.width;
    state.drag = Math.abs(x - sx) <= Math.abs(x - ex) ? "start" : "end";
    canvas.setPointerCapture(e.pointerId);
    setTrim(state.drag, timeAt(e));
  });
  canvas.addEventListener("pointermove", (e) => {
    if (state.drag) setTrim(state.drag, timeAt(e));
  });
  const end = () => (state.drag = null);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

/* ---------- DSP ---------- */

// Linear-interpolation resample: factor > 1 = faster and higher.
function resample(x, factor) {
  const n = Math.floor(x.length / factor);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * factor;
    const j = p | 0;
    const t = p - j;
    const a = x[j];
    const b = j + 1 < x.length ? x[j + 1] : a;
    y[i] = a + (b - a) * t;
  }
  return y;
}

// WSOLA time-stretch: changes length by `ratio` without changing pitch.
function stretch(chans, ratio) {
  const N = 2048;
  const Hs = N / 2;
  const tol = 256;
  const len = chans[0].length;
  const outLen = Math.round(len * ratio);
  const Ha = Hs / ratio;

  let mono = chans[0];
  if (chans.length > 1) {
    mono = new Float32Array(len);
    for (const ch of chans) for (let i = 0; i < len; i++) mono[i] += ch[i] / chans.length;
  }

  const positions = [0];
  let prev = 0;
  for (let k = 1; k * Hs < outLen; k++) {
    const nominal = Math.round(k * Ha);
    const natural = prev + Hs;
    let best = Math.max(0, Math.min(nominal, len - N));
    if (natural + N <= len) {
      let bestScore = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const c = nominal + d;
        if (c < 0) continue;
        if (c + N > len) break;
        let xy = 0;
        let yy = 0;
        for (let i = 0; i < N; i += 8) {
          const a = mono[c + i];
          xy += a * mono[natural + i];
          yy += a * a;
        }
        const score = xy / Math.sqrt(yy + 1e-9);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    positions.push(best);
    prev = best;
  }

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  return chans.map((x) => {
    const acc = new Float32Array(outLen + N);
    const wsum = new Float32Array(outLen + N);
    positions.forEach((pos, k) => {
      const o = k * Hs;
      for (let i = 0; i < N && pos + i < len; i++) {
        acc[o + i] += x[pos + i] * win[i];
        wsum[o + i] += win[i];
      }
    });
    const y = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) y[i] = wsum[i] > 1e-3 ? acc[i] / wsum[i] : 0;
    return y;
  });
}

function applyFades(chans, sr, fadeIn, fadeOut) {
  const len = chans[0].length;
  const fi = Math.min(len, Math.round(fadeIn * sr));
  const fo = Math.min(len, Math.round(fadeOut * sr));
  for (const ch of chans) {
    for (let i = 0; i < fi; i++) ch[i] *= i / fi;
    for (let i = 0; i < fo; i++) ch[len - 1 - i] *= i / fo;
  }
}

function render() {
  const src = state.source;
  const sr = src.sampleRate;
  const s0 = Math.floor(state.start * sr);
  const s1 = Math.floor(state.end * sr);
  let chans = [];
  for (let c = 0; c < Math.min(2, src.numberOfChannels); c++) chans.push(src.getChannelData(c).slice(s0, s1));

  const s = settings();
  if (s.linked) {
    if (s.speed !== 1) chans = chans.map((ch) => resample(ch, s.speed));
  } else {
    const factor = 2 ** (s.semis / 12);
    if (factor !== 1) chans = chans.map((ch) => resample(ch, factor));
    const ratio = factor / s.speed;
    if (Math.abs(ratio - 1) > 1e-3) chans = stretch(chans, ratio);
  }
  applyFades(chans, sr, s.fadeIn, s.fadeOut);

  const out = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: sr });
  chans.forEach((ch, i) => out.copyToChannel(ch, i));
  return out;
}

async function getRendered() {
  const key = JSON.stringify([state.start, state.end, settings()]);
  if (state.rendered && state.renderedKey === key) return state.rendered;
  $("render-status").textContent = "Rendering…";
  await nextFrame();
  try {
    state.rendered = render();
    state.renderedKey = key;
  } finally {
    $("render-status").textContent = "";
  }
  return state.rendered;
}

/* ---------- playback ---------- */

async function togglePlay() {
  if (state.player) {
    stopPlay();
    return;
  }
  setBusy(true);
  try {
    const buf = await getRendered();
    await state.ctx.resume();
    const node = state.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(state.ctx.destination);
    node.onended = () => state.player === node && stopPlay();
    node.start();
    state.player = node;
    $("play").textContent = "■ Stop";
  } finally {
    setBusy(false);
  }
}

function stopPlay() {
  if (state.player) {
    try {
      state.player.stop();
    } catch {}
  }
  state.player = null;
  $("play").textContent = "▶ Play";
}

/* ---------- MP3 export ---------- */

async function encodeMp3(buf) {
  if (typeof lamejs === "undefined") throw new Error("The MP3 encoder didn't load. Check your connection and reload the page.");
  const channels = Math.min(2, buf.numberOfChannels);
  const enc = new lamejs.Mp3Encoder(channels, buf.sampleRate, MP3_KBPS);
  const toI16 = (f) => {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return o;
  };
  const left = toI16(buf.getChannelData(0));
  const right = channels === 2 ? toI16(buf.getChannelData(1)) : null;
  const parts = [];
  const block = 1152;
  for (let i = 0, n = 0; i < left.length; i += block, n++) {
    const l = left.subarray(i, i + block);
    const chunk = right ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if (n % 400 === 0) {
      $("render-status").textContent = `Encoding MP3… ${Math.round((i / left.length) * 100)}%`;
      await sleep(0);
    }
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  $("render-status").textContent = "";
  return new Blob(parts, { type: "audio/mpeg" });
}

async function buildMp3() {
  const buf = await getRendered();
  if (buf.duration > ROBLOX_AUDIO_MAX_SECONDS) {
    throw new Error(`The result is ${fmtTime(buf.duration)} long. Roblox accepts up to 7:00 — cut it shorter.`);
  }
  return encodeMp3(buf);
}

async function downloadMp3() {
  if (!state.source || state.busy) return;
  setBusy(true);
  try {
    const blob = await buildMp3();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFileName($("asset-name").value || state.fileName || "audio")}.mp3`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    log(`Downloaded MP3 (${(blob.size / 1024 / 1024).toFixed(1)} MB).`, "ok");
  } catch (e) {
    log(e.message, "err");
  } finally {
    setBusy(false);
  }
}

/* ---------- cover ---------- */

async function loadCover(file) {
  if (!file.type.startsWith("image/")) return;
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = COVER_SIZE;
  canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
  state.coverBlob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  state.coverUrl = URL.createObjectURL(state.coverBlob);
  $("cover-preview").src = state.coverUrl;
  $("cover-preview").hidden = false;
  $("cover-empty").hidden = true;
  $("cover-remove").hidden = false;
}

function removeCover() {
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  state.coverBlob = state.coverUrl = null;
  $("cover-file").value = "";
  $("cover-preview").hidden = true;
  $("cover-empty").hidden = false;
  $("cover-remove").hidden = true;
}

/* ---------- upload ---------- */

async function upload(e) {
  e.preventDefault();
  if (!state.source || state.busy) return;
  const form = readUploadForm();
  if (!form) return;
  const member = Member.get();
  const { apiKey, name, description, folderId } = form;

  setBusy(true);
  $("result").hidden = true;
  try {
    log("Looking up your Roblox account…");
    const user = await resolveUser(form.username);
    log(`Found ${user.name} (ID ${user.id}).`, "ok");

    log("Rendering and encoding MP3…");
    const mp3 = await buildMp3();
    if (mp3.size > ROBLOX_AUDIO_MAX_BYTES) throw new Error("The MP3 is over 20 MB. Cut it shorter.");

    log("Uploading audio to Roblox… (moderation can take a minute)");
    const base = safeFileName(name);
    const audioId = await createAsset("Audio", { userId: user.id, apiKey, name, description, blob: mp3, filename: `${base}.mp3` });
    countUpload(member);
    updateQuota();
    log(`Audio uploaded: ${audioId}`, "ok");

    let coverId = null;
    if (state.coverBlob) {
      log("Uploading cover image…");
      try {
        coverId = await createAsset("Decal", {
          userId: user.id,
          apiKey,
          name: `${name} cover`.slice(0, 50),
          description,
          blob: state.coverBlob,
          filename: `${base}-cover.png`,
        });
        log(`Cover uploaded: ${coverId}`, "ok");
      } catch (err) {
        log(`Cover upload failed: ${err.message} The audio is uploaded fine.`, "err");
      }
    }

    const thumb = state.coverBlob ? await makeThumb(state.coverBlob) : null;
    Library.addItem(member, { type: "audio", name, assetId: audioId, coverId, thumb, folderId: folderId || null });
    log("Saved to your library.", "ok");
    showResult({ name, audioId, coverId });
    renderRecent("audio");
  } catch (err) {
    log(err.message, "err");
  } finally {
    setBusy(false);
  }
}

function showResult({ name, audioId, coverId }) {
  const box = $("result-ids");
  box.innerHTML = "";
  $("result-name").textContent = name;
  box.append(idRow("Audio ID", audioId));
  if (coverId) box.append(idRow("Cover (decal) ID", coverId));
  $("result").hidden = false;
}

/* ---------- wiring ---------- */

function initTool() {
  if (!$("tool") || !$("audio-drop")) return;
  const member = Member.get();
  if (!member) {
    $("tool-locked").hidden = false;
    return;
  }
  $("tool").hidden = false;
  $("tool-member").textContent = `Signed in as ${member.username}`;
  updateQuota();
  renderRecent("audio");
  initUploadForm();

  setupDrop("audio-drop", "audio-file", loadAudio);
  setupDrop("cover-drop", "cover-file", loadCover);
  $("change-file").addEventListener("click", () => $("audio-file").click());
  $("cover-remove").addEventListener("click", removeCover);
  setupWavePointer();

  $("trim-start").addEventListener("change", (e) => setTrim("start", parseFloat(e.target.value) || 0));
  $("trim-end").addEventListener("change", (e) => setTrim("end", parseFloat(e.target.value) || 0));
  ["speed", "pitch", "link", "fade-in", "fade-out"].forEach((id) => $(id).addEventListener("input", invalidate));
  $("reset-adjust").addEventListener("click", () => {
    $("speed").value = 1;
    $("pitch").value = 0;
    $("link").checked = true;
    $("fade-in").value = 0;
    $("fade-out").value = 0;
    invalidate();
  });

  $("play").addEventListener("click", togglePlay);
  $("download-btn").addEventListener("click", downloadMp3);
  $("upload-form").addEventListener("submit", upload);

  window.addEventListener("resize", () => state.source && sizeCanvas());
  refreshAdjustLabels();
  setBusy(false);
}

document.addEventListener("DOMContentLoaded", initTool);
