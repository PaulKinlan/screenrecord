const $ = (s) => document.querySelector(s);
const els = {
  unsupported: $("#unsupported"), ready: $("#ready"), studio: $("#studio"), choose: $("#choose-source"),
  preview: $("#preview"), record: $("#record"), stop: $("#stop"), change: $("#change-source"), end: $("#end-session"),
  statusDot: $("#status-dot"), status: $("#status-text"), timer: $("#timer"), source: $("#source-label"),
  resolution: $("#resolution"), audio: $("#audio-status"), message: $("#message"), error: $("#error"),
  result: $("#result"), playback: $("#playback"), download: $("#download"), details: $("#result-details"), again: $("#record-again"),
};
let stream = null;
let recorder = null;
let chunks = [];
let resultUrl = "";
let timerId = 0;
let startedAt = 0;

const supported = Boolean(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder);
els.unsupported.hidden = supported;
els.ready.hidden = !supported;

function setError(message = "") { els.error.textContent = message; els.error.hidden = !message; }
function formatDuration(ms) { const total = Math.floor(ms / 1000); return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function chooseMime() { return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(MediaRecorder.isTypeSupported) || ""; }
function stopTimer() { clearInterval(timerId); timerId = 0; }
function startTimer() {
  startedAt = performance.now();
  els.timer.textContent = "00:00";
  timerId = setInterval(() => { const elapsed = performance.now() - startedAt; els.timer.textContent = formatDuration(elapsed); els.timer.dateTime = `PT${Math.floor(elapsed / 1000)}S`; }, 250);
}

function closeStream() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  els.preview.srcObject = null;
  els.studio.hidden = true;
  els.ready.hidden = !supported;
  stopTimer();
}

async function selectSource() {
  setError();
  if (!supported) return;
  closeStream();
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    els.preview.srcObject = stream;
    els.source.textContent = settings.displaySurface ? settings.displaySurface[0].toUpperCase() + settings.displaySurface.slice(1) : "Shared source";
    els.resolution.textContent = settings.width && settings.height ? `${settings.width}×${settings.height}` : "Browser managed";
    els.audio.textContent = stream.getAudioTracks().length ? "Shared" : "Not shared";
    els.ready.hidden = true;
    els.result.hidden = true;
    els.studio.hidden = false;
    els.status.textContent = "Source selected";
    els.statusDot.classList.remove("recording");
    els.record.hidden = false;
    els.stop.hidden = true;
    els.change.disabled = false;
    els.end.disabled = false;
    videoTrack.addEventListener("ended", () => {
      if (recorder?.state === "recording") recorder.stop();
      closeStream();
      els.message.textContent = "Screen sharing ended from the browser controls.";
    }, { once: true });
    els.studio.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } catch (error) {
    if (error.name === "NotAllowedError") setError("Screen sharing was cancelled or blocked. Nothing was captured—choose a source when you’re ready.");
    else setError(`Couldn’t start screen sharing: ${error.message}`);
  }
}

function startRecording() {
  setError();
  if (!stream?.active) { setError("Choose an active screen or window before recording."); return; }
  chunks = [];
  try {
    const mime = chooseMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
    recorder.onerror = () => setError(`Recording failed: ${recorder.error?.message || "unknown recorder error"}`);
    recorder.onstop = finishRecording;
    recorder.start(500);
    startTimer();
    els.status.textContent = "Recording";
    els.statusDot.classList.add("recording");
    els.record.hidden = true;
    els.stop.hidden = false;
    els.change.disabled = true;
    els.end.disabled = true;
    els.message.textContent = "Keep this tab open. Use the browser sharing control to stop in an emergency.";
  } catch (error) { setError(`Couldn’t begin recording: ${error.message}`); }
}

function stopRecording() { if (recorder?.state === "recording") recorder.stop(); }
function finishRecording() {
  stopTimer();
  const duration = performance.now() - startedAt;
  els.status.textContent = "Source selected";
  els.statusDot.classList.remove("recording");
  els.record.hidden = false;
  els.stop.hidden = true;
  els.change.disabled = false;
  els.end.disabled = false;
  if (!chunks.length) { setError("The browser stopped without producing recording data."); return; }
  const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(blob);
  els.playback.src = resultUrl;
  els.download.href = resultUrl;
  els.download.download = `screen-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
  els.details.textContent = `${formatDuration(duration)} · ${(blob.size / 1024 / 1024).toFixed(1)} MB · ${blob.type.split(";")[0]}`;
  els.result.hidden = false;
  els.message.textContent = "Recording complete. Your source is still shared until you end the capture.";
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

els.choose.addEventListener("click", selectSource);
els.change.addEventListener("click", selectSource);
els.record.addEventListener("click", startRecording);
els.stop.addEventListener("click", stopRecording);
els.end.addEventListener("click", closeStream);
els.again.addEventListener("click", () => { els.result.hidden = true; if (stream?.active) els.studio.scrollIntoView({ block: "start" }); else selectSource(); });
window.addEventListener("beforeunload", () => { closeStream(); if (resultUrl) URL.revokeObjectURL(resultUrl); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
