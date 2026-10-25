"use strict";

// ponytail: one recovery copy per origin; add per-project slots when multi-tab editing is required.

const projectSession = { ready: false, timer: null, history: [], cursor: -1, signature: "", cameraSignature: "", durableSignature: "", dirty: false, recoveryOk: false, pending: false, applying: false, message: "", storedSource: null, write: Promise.resolve(), revision: 0 };

function recoveryStore(action, value) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Local recovery is unavailable. Save a project file.")); return; }
    const request = window.indexedDB.open("philippine-demographic-mapper", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other map tabs to enable local recovery."));
    request.onsuccess = () => {
      const db = request.result;
      try {
      const transaction = db.transaction("projects", action === "get" ? "readonly" : "readwrite");
      const store = transaction.objectStore("projects");
      const operation = action === "get" ? store.get("recovery") : action === "put" ? store.put(value, "recovery") : store.delete("recovery");
      transaction.oncomplete = () => { db.close(); resolve(operation.result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Could not save local recovery.")); };
      } catch (error) { db.close(); reject(error); }
    };
  });
}

function projectEditSignature(payload = projectPayload()) {
  const { camera, ...settings } = payload.state;
  return JSON.stringify({ state: settings, drafts: [...workspaceUi.drafts] });
}

function updateProjectSessionStatus() {
  if (!el.projectSaveStatus) return;
  el.projectSaveStatus.textContent = projectSession.message || (projectSession.pending ? "Changes pending local recovery…" : projectSession.recoveryOk ? "Local recovery saved · Save downloads a project file" : "Save downloads an editable project file");
  el.undoProjectButton.disabled = projectSession.cursor <= 0;
  el.redoProjectButton.disabled = projectSession.cursor >= projectSession.history.length - 1;
}

function queueProjectSession(event) {
  if (event?.target?.id === "saveProjectButton") return;
  if (!projectSession.ready || projectSession.applying || projectSession.clearing) return;
  projectSession.pending = true;
  projectSession.message = "";
  clearTimeout(projectSession.timer);
  projectSession.timer = setTimeout(flushProjectSession, 650);
  updateProjectSessionStatus();
}

async function flushProjectSession() {
  clearTimeout(projectSession.timer);
  if (!projectSession.ready || projectSession.applying || projectSession.clearing) return;
  const payload = projectPayload(), signature = projectEditSignature(payload);
  const changed = signature !== projectSession.signature;
  if (JSON.stringify(payload.state.camera) !== projectSession.cameraSignature) projectSession.dirty = true;
  if (changed) {
    projectSession.history.splice(projectSession.cursor + 1);
    projectSession.history.push(signature);
    // ponytail: cap undo at 30 steps/16 MB; a single larger current state remains recoverable.
    while (projectSession.history.length > 1 && (projectSession.history.length > 30 || projectSession.history.reduce((sum, item) => sum + item.length * 2, 0) > 16_000_000)) projectSession.history.shift();
    projectSession.cursor = projectSession.history.length - 1;
    projectSession.signature = signature;
    projectSession.dirty = true;
  }
  const durableSignature = signature + "|" + JSON.stringify(payload.state.camera);
  if ((!changed && !projectSession.dirty) || durableSignature === projectSession.durableSignature) { projectSession.pending = false; updateProjectSessionStatus(); return; }
  const revision = ++projectSession.revision;
  projectSession.pending = true;
  try {
    const recovery = { payload, drafts: [...workspaceUi.drafts], updatedAt: new Date().toISOString() };
    projectSession.write = projectSession.write.catch(() => {}).then(() => recoveryStore("put", recovery));
    await projectSession.write;
    if (revision !== projectSession.revision) return;
    projectSession.recoveryOk = true;
    projectSession.cameraSignature = JSON.stringify(payload.state.camera);
    projectSession.durableSignature = durableSignature;
    projectSession.message = "";
  } catch (error) {
    if (revision !== projectSession.revision) return;
    projectSession.recoveryOk = false;
    projectSession.message = `${error.message || "Local recovery failed."} Save a project file to keep your work.`;
  } finally { if (revision === projectSession.revision) { projectSession.pending = false; updateProjectSessionStatus(); } }
}

function applySessionState(settings, drafts = []) {
  const candidate = validateProjectState(settings);
  if (!candidate) throw new Error("The saved map contains invalid settings.");
  const previous = { ...state }, previousDrafts = [...workspaceUi.drafts], previousView = mapViewBox;
  projectSession.applying = true;
  try {
  cancelMapGesture?.();
  Object.assign(state, candidate);
  state.selectedCode = null;
  layoutEditor.enabled = false;
  resetWorkspaceEdits();
  for (const [code, draft] of drafts) {
    if (/^(?:\d{10}|NAMRIA_[A-Za-z0-9_]+)$/.test(code) && draft && typeof draft.value === "string" && typeof draft.label === "string") workspaceUi.drafts.set(code, { value: draft.value.slice(0, 120), label: draft.label.slice(0, 160) });
  }
  mapViewBox = null;
  el.areaFilterInput.value = "";
  render();
  } catch (error) {
    Object.assign(state, previous);
    workspaceUi.drafts.clear();
    for (const [code, draft] of previousDrafts) workspaceUi.drafts.set(code, draft);
    mapViewBox = previousView;
    throw error;
  } finally { projectSession.applying = false; }
}

async function moveProjectHistory(amount) {
  await flushProjectSession();
  const next = projectSession.cursor + amount;
  if (next < 0 || next >= projectSession.history.length) return;
  const entry = JSON.parse(projectSession.history[next]);
  const camera = captureProjectCamera();
  if (camera && camera.scopeId === entry.state.scopeId && camera.level === entry.state.level && camera.boundarySource === entry.state.boundarySource) entry.state.camera = camera;
  applySessionState(entry.state, entry.drafts);
  projectSession.cursor = next;
  projectSession.signature = projectEditSignature();
  projectSession.history[next] = projectSession.signature;
  projectSession.dirty = true;
  await flushProjectSession();
}

async function initializeProjectSession() {
  const initialSignature = projectSession.signature || projectEditSignature();
  let saved;
  try { saved = await recoveryStore("get"); }
  catch (error) { projectSession.message = error.message || "Local recovery is unavailable. Save a project file."; }
  const currentSignature = projectEditSignature();
  projectSession.signature = currentSignature;
  projectSession.cameraSignature = JSON.stringify(captureProjectCamera());
  projectSession.history = initialSignature === currentSignature ? [currentSignature] : [initialSignature, currentSignature];
  projectSession.cursor = projectSession.history.length - 1;
  projectSession.dirty = initialSignature !== currentSignature;
  projectSession.ready = true;
  if (saved && validateProjectState(saved.payload?.state)) {
    projectSession.ready = false;
    el.recoveryProjectName.textContent = `${saved.payload.state.projectName || "Untitled map"} · ${new Date(saved.updatedAt).toLocaleString()}`;
    el.recoveryDialog.showModal();
    el.restoreRecoveryButton.onclick = async () => {
      applySessionState(saved.payload.state, Array.isArray(saved.drafts) ? saved.drafts.filter((entry) => Array.isArray(entry) && entry.length === 2) : []);
      projectSession.storedSource = saved.payload.boundaryMetadata;
      el.recoveryDialog.close();
      projectSession.ready = true;
      await flushProjectSession();
    };
    el.discardRecoveryButton.onclick = async () => {
      try { await recoveryStore("delete"); } catch { projectSession.message = "Could not clear local recovery. Save a project file."; }
      el.recoveryDialog.close();
      projectSession.ready = true;
      if (projectSession.dirty) await flushProjectSession();
      updateProjectSessionStatus();
    };
  }
  else if (projectSession.dirty) queueProjectSession();
  updateProjectSessionStatus();
}

function bindProjectSession() {
  projectSession.signature = projectEditSignature();
  for (const id of ["projectSaveStatus", "newProjectButton", "undoProjectButton", "redoProjectButton", "recoveryDialog", "recoveryProjectName", "restoreRecoveryButton", "discardRecoveryButton", "newProjectDialog", "cancelNewProjectButton", "saveNewProjectButton", "confirmNewProjectButton", "focusMapButton", "mapCanvas", "pagePreviewInput", "borderPresetSelect", "metricUnitInput", "metricPeriodInput", "metricSourceInput", "numberPrecisionSelect", "sourceVersionNotice", "clearRecoveryButton"]) el[id] = document.getElementById(id);
  for (const type of ["input", "change", "click", "pointerup", "wheel"]) document.addEventListener(type, queueProjectSession);
  document.addEventListener("keydown", (event) => {
    if (el.recoveryDialog.open || el.newProjectDialog.open || el.boundaryDialog?.open || el.replaceDataDialog?.open) return;
    if (event.key === "Escape" && workspaceUi.focusMap && !workspaceUi.isOpen && !layoutEditor.enabled) setMapFocus(false);
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !["z", "y"].includes(event.key.toLowerCase()) || event.target.closest?.("input,textarea,select,[contenteditable]")) return;
    event.preventDefault();
    moveProjectHistory(event.key.toLowerCase() === "y" || event.shiftKey ? 1 : -1);
  });
  window.addEventListener("beforeunload", (event) => {
    const signature = projectEditSignature(), camera = JSON.stringify(captureProjectCamera());
    const changed = signature !== projectSession.signature || projectSession.dirty || (projectSession.ready && camera !== projectSession.cameraSignature);
    if (changed && signature + "|" + camera !== projectSession.durableSignature) { event.preventDefault(); event.returnValue = ""; }
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushProjectSession(); });
  el.undoProjectButton.addEventListener("click", () => moveProjectHistory(-1));
  el.redoProjectButton.addEventListener("click", () => moveProjectHistory(1));
  el.newProjectButton.addEventListener("click", () => el.newProjectDialog.showModal());
  el.cancelNewProjectButton.addEventListener("click", () => el.newProjectDialog.close());
  const startNew = async () => {
    await flushProjectSession();
    applySessionState({ ...PROJECT_STATE_DEFAULTS, scopeId: "PH", level: "province" });
    el.newProjectDialog.close();
    queueProjectSession();
  };
  el.confirmNewProjectButton.addEventListener("click", startNew);
  el.saveNewProjectButton.addEventListener("click", () => { saveProject(); startNew(); });
  el.focusMapButton.addEventListener("click", () => setMapFocus(!workspaceUi.focusMap));
  el.recoveryDialog.addEventListener("cancel", (event) => event.preventDefault());
  el.clearRecoveryButton.addEventListener("click", async () => {
    if (projectSession.clearing) return;
    const signature = projectEditSignature(), camera = JSON.stringify(captureProjectCamera()), hadPending = projectSession.pending;
    let cleared = false;
    clearTimeout(projectSession.timer);
    projectSession.clearing = true;
    projectSession.revision++;
    try {
      projectSession.write = projectSession.write.catch(() => {}).then(() => recoveryStore("delete"));
      await projectSession.write;
      cleared = true;
      projectSession.dirty = projectSession.pending = projectSession.recoveryOk = false;
      projectSession.signature = signature;
      projectSession.cameraSignature = camera;
      projectSession.durableSignature = "";
      projectSession.message = "Local recovery cleared. New edits create a new copy.";
    } catch { projectSession.message = "Could not clear local recovery."; }
    finally {
      projectSession.clearing = false;
      if (projectEditSignature() !== signature || JSON.stringify(captureProjectCamera()) !== camera || (!cleared && hadPending)) queueProjectSession();
      updateProjectSessionStatus();
    }
  });
  el.pagePreviewInput.addEventListener("change", () => { workspaceUi.pagePreview = el.pagePreviewInput.checked; updatePagePreview(); });
  for (const [id, key, limit] of [["metricUnitInput", "metricUnit", 60], ["metricPeriodInput", "metricPeriod", 60], ["metricSourceInput", "metricSource", 500]]) el[id].addEventListener("input", () => { state[key] = el[id].value.slice(0, limit); render(); });
  el.numberPrecisionSelect.addEventListener("change", () => { state.numberPrecision = el.numberPrecisionSelect.value; render(); });
  el.borderPresetSelect.addEventListener("change", () => {
    const preset = { clean: ["#ffffff", 0.3], detailed: ["#879088", 0.65], print: ["#404740", 0.6] }[el.borderPresetSelect.value];
    if (preset) { [state.borderColor, state.borderWidth] = preset; render(); }
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(updatePagePreview).observe(el.mapCanvas);
}

function setMapFocus(enabled) {
  workspaceUi.focusMap = enabled;
  if (enabled) closeWorkspacePanel();
  document.querySelector(".app-shell").classList.toggle("is-map-focused", enabled);
  el.focusMapButton.textContent = enabled ? "Exit focus" : "Focus map";
  el.focusMapButton.setAttribute("aria-pressed", String(enabled));
  updateWorkspacePanel();
  el.focusMapButton.focus();
}

function updatePagePreview() {
  if (!el.mapCanvas) return;
  el.mapCanvas.dataset.pagePreview = String(workspaceUi.pagePreview);
  if (!workspaceUi.pagePreview) { el.mapSvg.style.width = "100%"; el.mapSvg.style.height = "100%"; return; }
  const rect = el.mapCanvas.getBoundingClientRect(), ratio = state.exportWidth / state.exportHeight;
  const width = Math.max(1, Math.min(rect.width - 24, (rect.height - 24) * ratio));
  el.mapSvg.style.width = `${width}px`;
  el.mapSvg.style.height = `${width / ratio}px`;
}

function syncProjectWorkspace() {
  for (const [id, key] of [["metricUnitInput", "metricUnit"], ["metricPeriodInput", "metricPeriod"], ["metricSourceInput", "metricSource"], ["numberPrecisionSelect", "numberPrecision"]]) if (document.activeElement !== el[id]) el[id].value = state[key];
  const presets = { "#ffffff:0.3": "clean", "#879088:0.65": "detailed", "#404740:0.6": "print" };
  el.borderPresetSelect.value = presets[`${state.borderColor}:${state.borderWidth}`] || "custom";
  updatePagePreview();
  const source = projectSession.storedSource;
  const different = source && (source.snapshot !== state.boundaryMetadata.snapshot || source.releaseTag !== state.boundaryMetadata.releaseTag || source.namriaVersion !== state.boundaryMetadata.namriaVersion || source.detailVersion !== state.boundaryMetadata.detailVersion);
  el.sourceVersionNotice.hidden = !different;
  el.sourceVersionNotice.textContent = different ? `Project source: ${[source.snapshot, source.releaseTag].filter(Boolean).join(" · ") || "another boundary source"}. Installed: ${[state.boundaryMetadata.snapshot, state.boundaryMetadata.releaseTag].filter(Boolean).join(" · ") || "unavailable"}. Review place matches and framing.` : "";
}

function onProjectLoaded(payload) {
  projectSession.storedSource = payload.boundaryMetadata;
  queueProjectSession();
  syncProjectWorkspace();
}
