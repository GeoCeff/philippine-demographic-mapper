import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const scripts = await Promise.all(["data", "state", "utils", "csv", "export", "ui", "project-session", "app"].map(async (name) => [name, await readFile(`src/${name}.js`, "utf8")]));
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function fixture() {
  const nodes = new Map(), documentEvents = new Map(), windowEvents = new Map(), timers = new Map();
  let timerId = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: "", textContent: "", style: {}, dataset: {}, open: false, listeners: new Map(),
      addEventListener(type, handler) { this.listeners.set(type, handler); },
      setAttribute() {}, focus() {}, close() { this.open = false; }, showModal() { this.open = true; }
    });
    return nodes.get(id);
  }
  const context = vm.createContext({
    console, Blob, Intl, URL, Map, Set, Number, String, Math,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    window: { addEventListener(type, handler) { windowEvents.set(type, handler); } },
    document: { addEventListener(type, handler) { documentEvents.set(type, handler); }, getElementById: node, querySelectorAll: () => [], activeElement: null }
  });
  for (const [name, source] of scripts) vm.runInContext(source, context, { filename: `src/${name}.js` });
  const { state, projectSession: session, workspaceUi: workspace, el } = vm.runInContext("({ state, projectSession, workspaceUi, el })", context);
  el.areaFilterInput = node("areaFilterInput"); el.mapSvg = node("mapSvg"); el.sourceVersionNotice = node("sourceVersionNotice");
  context.render = () => {};
  context.bindProjectSession();
  const defaults = plain(vm.runInContext("PROJECT_STATE_DEFAULTS", context));
  return { context, state, session, workspace, nodes, documentEvents, windowEvents, timers, defaults };
}

await test("camera, metric persistence and native precision choices", async () => {
  const { context, state } = fixture();
  state.numberPrecision = "2";
  assert.equal(context.formatNumber(1.2345), "1.23", "native select precision strings must control formatting");
  assert.equal(context.formatNumber(1.2345, "auto"), "1.2345");
  assert.equal(context.formatNumber(1.2345, "3"), "1.235");
  assert.equal(context.formatNumber(1.2345, "02"), "1.2345", "only explicit valid precision choices may be coerced");
  Object.assign(state, { boundarySource: "fixture", scopeId: "PH", level: "region", metricUnit: "people", metricPeriod: "2025", metricSource: "Example source", boundaryMetadata: { snapshot: "2023" } });
  vm.runInContext('mapViewBox = [10, 20, 30, 40]; mapViewKey = "fixture:PH:region:1";', context);
  const payload = context.projectPayload(), candidate = context.validateProjectState(payload.state);
  assert.deepEqual(plain(candidate.camera.viewBox), [10, 20, 30, 40]);
  assert.equal(candidate.metricUnit, "people"); assert.equal(candidate.metricPeriod, "2025"); assert.equal(candidate.metricSource, "Example source");
  assert.equal(candidate.numberPrecision, "2");
  payload.state.camera.viewBox[0] = 999;
  assert.equal(context.captureProjectCamera().viewBox[0], 10, "saved camera must be a detached snapshot");
  const camera = plain(candidate.camera);
  for (const invalid of [
    { ...camera, scopeId: "CITY-137404" }, { ...camera, level: "barangay" }, { ...camera, boundarySource: "generated" },
    { ...camera, viewBox: [0, 0, 0, 1] }, { ...camera, viewBox: [0, 0, 1, -1] }, { ...camera, viewBox: [0, 0, Infinity, 1] },
    { ...camera, viewBox: [0, 0, NaN, 1] }, { ...camera, viewBox: [0, 0, 1e10, 1] }, { ...camera, viewBox: [1, 2, 3] }
  ]) assert.equal(context.validateProjectState({ scopeId: "PH", level: "region", boundarySource: "fixture", camera: invalid }).camera, null);
  assert.equal(context.validateProjectState({ scopeId: "PH", level: "region" }).camera, null, "old projects must not inherit another camera");
});

await test("serial recovery writes and unchanged interactions", async () => {
  const { context, state, session, windowEvents } = fixture(), writes = [], first = deferred(), second = deferred();
  context.recoveryStore = async (action, value) => {
    if (action === "get") return;
    writes.push(value);
    return writes.length === 1 ? first.promise : second.promise;
  };
  await context.initializeProjectSession();
  state.projectName = "First edit"; const saveFirst = context.flushProjectSession(); await tick();
  state.projectName = "Second edit"; const saveSecond = context.flushProjectSession(); await tick();
  assert.equal(writes.length, 1, "recovery writes must execute serially");
  first.resolve(); await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[0].payload.state.projectName, "First edit"); assert.equal(writes[1].payload.state.projectName, "Second edit");
  second.resolve(); await Promise.all([saveFirst, saveSecond]);
  assert.equal(session.recoveryOk, true);
  const count = writes.length;
  context.queueProjectSession();
  const unload = { preventDefault() { this.prevented = true; } };
  windowEvents.get("beforeunload")(unload);
  assert.equal(unload.prevented, undefined, "a non-edit click must not trigger an unsaved-work warning");
  await context.flushProjectSession();
  assert.equal(writes.length, count, "non-edit interactions must not rewrite unchanged large recovery payloads");
});

await test("recovery failure and latest-write status", async () => {
  const { context, state, session, windowEvents } = fixture(), failure = deferred(), success = deferred();
  let writes = 0;
  context.recoveryStore = (action) => action === "get" ? Promise.resolve() : ++writes === 1 ? failure.promise : success.promise;
  await context.initializeProjectSession();
  state.projectName = "Older edit"; const oldSave = context.flushProjectSession(); await tick();
  state.projectName = "Newer edit"; const newSave = context.flushProjectSession(); await tick();
  failure.reject(new Error("Quota exceeded")); await tick(); success.resolve();
  await Promise.all([oldSave, newSave]);
  assert.equal(session.recoveryOk, true); assert.equal(session.message, "", "an older failure must not mask newer successful recovery");
  context.recoveryStore = async () => { throw new Error("Storage unavailable"); };
  state.projectName = "Unsaved edit"; context.queueProjectSession(); await context.flushProjectSession();
  assert.equal(session.recoveryOk, false); assert.match(session.message, /Storage unavailable/);
  const unload = { preventDefault() { this.prevented = true; } };
  windowEvents.get("beforeunload")(unload);
  assert.equal(unload.prevented, true, "failed recovery must warn before active work is lost");
  assert.equal(state.projectName, "Unsaved edit", "storage failure must never remove active work");
});

await test("undo, redo, New and invalid candidate preservation", async () => {
  const { context, state, session, workspace, nodes, defaults } = fixture();
  context.recoveryStore = async () => undefined;
  await context.initializeProjectSession();
  state.projectName = "Applied edit"; state.placeOverrides = { "0100000000": { label: "Applied", value: "0" } };
  state.layoutPositions = { title: { x: 0.1, y: 0.1 }, legend: { x: 0.7, y: 0.1 } };
  workspace.drafts.set("0100000000", { value: "8", label: "Unfinished" });
  await context.flushProjectSession();
  state.projectName = "Later edit"; workspace.drafts.clear(); await context.flushProjectSession();
  await context.moveProjectHistory(-1);
  assert.equal(state.projectName, "Applied edit"); assert.equal(state.placeOverrides["0100000000"].value, "0");
  assert.equal(workspace.drafts.get("0100000000").label, "Unfinished");
  await context.moveProjectHistory(1); assert.equal(state.projectName, "Later edit");
  await nodes.get("newProjectButton").listeners.get("click")(); assert.equal(nodes.get("newProjectDialog").open, true);
  await nodes.get("cancelNewProjectButton").listeners.get("click")(); assert.equal(state.projectName, "Later edit");
  await nodes.get("confirmNewProjectButton").listeners.get("click")(); await context.flushProjectSession();
  assert.equal(state.projectName, defaults.projectName); assert.deepEqual(plain(state.placeOverrides), {}); assert.equal(workspace.drafts.size, 0);
  await context.moveProjectHistory(-1); assert.equal(state.projectName, "Later edit", "New must remain undoable");
  const before = JSON.stringify(state), beforeDrafts = JSON.stringify([...workspace.drafts]);
  assert.throws(() => context.applySessionState({ scopeId: "PH", level: "region", importedRows: [null] }), /invalid/);
  assert.equal(JSON.stringify(state), before); assert.equal(JSON.stringify([...workspace.drafts]), beforeDrafts); assert.equal(session.applying, false);
  context.render = () => { throw new Error("Rendering failed"); };
  assert.throws(() => context.applySessionState({ scopeId: "PH", level: "region" }), /Rendering failed/);
  assert.equal(session.applying, false, "failed rendering must not permanently disable future recovery");
});

await test("explicit recovery restores applied work and drafts", async () => {
  const { context, state, workspace, nodes } = fixture();
  const saved = { payload: { version: 2, boundaryMetadata: { snapshot: "2023" }, state: { scopeId: "PH", level: "region", projectName: "Recovered map", placeOverrides: { "0100000000": { value: "0" } } } },
    drafts: [["0100000000", { value: "9", label: "Draft" }], null, ["invalid", { value: "1", label: "Ignore" }]], updatedAt: new Date(0).toISOString() };
  context.recoveryStore = async (action) => action === "get" ? saved : undefined;
  await context.initializeProjectSession(); assert.equal(nodes.get("recoveryDialog").open, true);
  assert.notEqual(state.projectName, "Recovered map", "recovery must wait for explicit restore");
  await nodes.get("restoreRecoveryButton").onclick();
  assert.equal(state.projectName, "Recovered map"); assert.equal(state.placeOverrides["0100000000"].value, "0");
  assert.equal(workspace.drafts.get("0100000000").label, "Draft"); assert.equal(workspace.drafts.size, 1);
  assert.equal(nodes.get("recoveryDialog").open, false);
});

await test("startup edits during a delayed recovery read survive", async () => {
  const { context, state } = fixture(), read = deferred(), writes = [];
  context.recoveryStore = (action, value) => action === "get" ? read.promise : (writes.push(value), Promise.resolve());
  const start = context.initializeProjectSession();
  state.projectName = "Edited during startup"; context.queueProjectSession();
  read.resolve(); await start; await context.flushProjectSession();
  assert.equal(writes.at(-1)?.payload.state.projectName, "Edited during startup", "edits during a delayed recovery read must remain recoverable");
});

await test("beforeunload protects the latest in-flight recovery", async () => {
  const { context, state, windowEvents } = fixture(), pending = deferred();
  context.recoveryStore = async () => undefined;
  await context.initializeProjectSession();
  state.projectName = "Durable edit"; await context.flushProjectSession();
  context.recoveryStore = () => pending.promise;
  state.projectName = "New edit awaiting storage";
  const saving = context.flushProjectSession(); await tick();
  const unload = { preventDefault() { this.prevented = true; } };
  windowEvents.get("beforeunload")(unload);
  pending.resolve(); await saving;
  assert.equal(unload.prevented, true, "an older successful save must not hide a newer in-flight write");
});

await test("pending saved camera survives while boundary geometry loads", async () => {
  const { context, state } = fixture();
  Object.assign(state, { scopeId: "CITY-137404", level: "barangay", boundarySource: "generated", boundaryMetadata: { snapshot: "2023" },
    camera: { scopeId: "CITY-137404", level: "barangay", boundarySource: "generated", snapshot: "2023", viewBox: [10, 20, 3, 4] } });
  vm.runInContext('mapViewBox = [0, 0, 900, 1100]; mapViewKey = "generated:CITY-137404:barangay:0";', context);
  assert.deepEqual(plain(context.projectPayload().state.camera.viewBox), [10, 20, 3, 4], "an empty loading frame must not replace a pending restored camera");
});

await test("edits during recovery deletion remain protected and recoverable", async () => {
  const { context, state, session, workspace, nodes, windowEvents } = fixture(), deletion = deferred();
  let stored;
  context.recoveryStore = async (action, value) => {
    if (action === "get") return stored;
    if (action === "put") stored = value;
    if (action === "delete") { await deletion.promise; stored = undefined; }
  };
  await context.initializeProjectSession();
  state.projectName = "Durable before clear"; await context.flushProjectSession();
  const clearing = nodes.get("clearRecoveryButton").listeners.get("click")(); await tick();
  state.projectName = "Edited during clear";
  workspace.drafts.set("0100000000", { value: "0", label: "New draft" });
  context.queueProjectSession(); await context.flushProjectSession();
  assert.equal(stored.payload.state.projectName, "Durable before clear", "new writes must wait until deletion finishes");
  const during = { preventDefault() { this.prevented = true; } }; windowEvents.get("beforeunload")(during);
  assert.equal(during.prevented, true, "new work must remain protected while Clear is pending");
  deletion.resolve(); await clearing;
  assert.equal(stored, undefined); assert.equal(session.durableSignature, "", "a deleted recovery must never count as durable");
  assert.equal(session.pending, true, "edits and drafts made during deletion must queue a fresh recovery");
  const after = { preventDefault() { this.prevented = true; } }; windowEvents.get("beforeunload")(after);
  assert.equal(after.prevented, true, "new work must remain protected until its replacement recovery commits");
  await context.flushProjectSession();
  assert.equal(stored.payload.state.projectName, "Edited during clear");
  assert.equal(stored.drafts[0][1].label, "New draft");
  const durable = { preventDefault() { this.prevented = true; } }; windowEvents.get("beforeunload")(durable);
  assert.equal(durable.prevented, undefined);
});

await test("recovery deletion follows all queued writers and stays cleared without new edits", async () => {
  const { context, state, session, nodes } = fixture(), first = deferred(), second = deferred(), deletion = deferred(), operations = [];
  context.recoveryStore = (action, value) => {
    if (action === "get") return Promise.resolve();
    operations.push(action === "put" ? value.payload.state.projectName : "delete");
    return action === "delete" ? deletion.promise : operations.length === 1 ? first.promise : second.promise;
  };
  await context.initializeProjectSession();
  state.projectName = "Writer A"; const saveA = context.flushProjectSession(); await tick();
  state.projectName = "Writer B"; const saveB = context.flushProjectSession(); await tick();
  const clearing = nodes.get("clearRecoveryButton").listeners.get("click")(); await tick();
  assert.deepEqual(operations, ["Writer A"]);
  first.resolve(); await tick(); assert.deepEqual(operations, ["Writer A", "Writer B"]);
  second.resolve(); await tick(); assert.deepEqual(operations, ["Writer A", "Writer B", "delete"]);
  context.queueProjectSession(); await context.flushProjectSession();
  deletion.resolve(); await Promise.all([saveA, saveB, clearing]);
  assert.equal(session.recoveryOk, false); assert.equal(session.durableSignature, "");
  context.queueProjectSession(); await context.flushProjectSession();
  assert.deepEqual(operations, ["Writer A", "Writer B", "delete"], "an unchanged interaction must not recreate the explicitly cleared copy");
});

await test("failed recovery deletion preserves work and can be retried", async () => {
  const { context, state, session, nodes } = fixture();
  context.recoveryStore = async () => undefined;
  await context.initializeProjectSession();
  state.projectName = "Keep this map"; await context.flushProjectSession();
  context.recoveryStore = async () => { throw new Error("Delete unavailable"); };
  await nodes.get("clearRecoveryButton").listeners.get("click")();
  assert.equal(state.projectName, "Keep this map"); assert.equal(session.clearing, false); assert.match(session.message, /Could not clear/);
  context.recoveryStore = async () => undefined;
  await nodes.get("clearRecoveryButton").listeners.get("click")();
  assert.equal(session.durableSignature, ""); assert.equal(session.recoveryOk, false); assert.match(session.message, /Local recovery cleared/);
});
