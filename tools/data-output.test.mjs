import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";
import { writeOutputSet } from "./write-output-set.mjs";

const properties = { psgc_code: "1700000000", name: "Fixture region", level: "region" };
const polygon = { type: "Polygon", coordinates: [[[120, 12], [121, 12], [121, 13], [120, 12]]] };
async function directory() { return mkdtemp(join(tmpdir(), "map-data-output-")); }
async function cleanup(path) { assert(path.startsWith(resolve(tmpdir()) + sep) && basename(path).startsWith("map-data-output-")); await rm(path, { recursive: true, force: true }); }
function run(args) { return spawnSync(process.execPath, ["tools/data-pipeline.mjs", ...args], { encoding: "utf8" }); }
async function inputs(root, geometry = polygon) {
  await writeFile(join(root, "psgc.json"), JSON.stringify([properties]));
  await writeFile(join(root, "boundaries.geojson"), JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties, geometry }] }));
}
function args(root, report) { return ["--psgc", join(root, "psgc.json"), "--boundaries", join(root, "boundaries.geojson"), "--out", join(root, "out"), "--report", report, "--metadata", join(root, "metadata.json")]; }

test("publication errors roll back replaced files and remove newly published files", async () => {
  for (const existed of [true, false]) {
    const root = await directory();
    try {
      const first = join(root, "first"), second = join(root, "second");
      if (existed) await writeFile(first, "original");
      await writeFile(second, "second original");
      let promotions = 0;
      await assert.rejects(writeOutputSet([{ path: first, bytes: "new" }, { path: second, bytes: "new" }], async (source, target) => {
        if (++promotions === 2) throw Object.assign(new Error("injected metadata rename failure"), { code: "EIO" });
        await rename(source, target);
      }), /injected metadata/);
      if (existed) assert.equal(await readFile(first, "utf8"), "original");
      else assert(!(await readdir(root)).includes("first"));
      assert.equal(await readFile(second, "utf8"), "second original");
      assert(!(await readdir(root)).some((file) => /\.(tmp|bak)$/.test(file)));
    } finally { await cleanup(root); }
  }
});

test("output publication refuses linked ancestors and duplicate resolved destinations before changing files", async () => {
  const root = await directory();
  try {
    const first = join(root, "first"), target = join(root, "target"), alias = join(root, "alias");
    await writeFile(first, "original"); await mkdir(target); await writeFile(join(target, "second"), "untouched");
    await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(writeOutputSet([{ path: first, bytes: "new" }, { path: join(alias, "second"), bytes: "new" }]), /linked output path/);
    assert.equal(await readFile(first, "utf8"), "original"); assert.equal(await readFile(join(target, "second"), "utf8"), "untouched");
    await assert.rejects(writeOutputSet([{ path: first, bytes: "new" }, { path: join(root, "unused/../first"), bytes: "different" }]), /distinct/);
    assert.equal(await readFile(first, "utf8"), "original");
    assert(!(await readdir(root)).some((file) => /\.(tmp|bak)$/.test(file)));
  } finally { await cleanup(root); }
});

test("pipeline preflights all outputs and creates missing report directories without partial publication", async () => {
  const root = await directory();
  try {
    await inputs(root); await mkdir(join(root, "out")); await mkdir(join(root, "blocked-report"));
    for (const name of ["admin_boundaries.normalized.geojson", "admin_lookup.json"]) await writeFile(join(root, "out", name), "ORIGINAL");
    await writeFile(join(root, "metadata.json"), '{"marker":"original"}');
    const blocked = run(args(root, join(root, "blocked-report")));
    assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /not a file/);
    for (const name of ["admin_boundaries.normalized.geojson", "admin_lookup.json"]) assert.equal(await readFile(join(root, "out", name), "utf8"), "ORIGINAL");
    assert.deepEqual(JSON.parse(await readFile(join(root, "metadata.json"))), { marker: "original" });
    await writeFile(join(root, "metadata.json"), "invalid metadata");
    assert.notEqual(run(args(root, join(root, "report.md"))).status, 0);
    assert.equal(await readFile(join(root, "metadata.json"), "utf8"), "invalid metadata");
    assert.equal(await readFile(join(root, "out/admin_lookup.json"), "utf8"), "ORIGINAL");
    await writeFile(join(root, "metadata.json"), '{"marker":"original"}');
    const report = join(root, "new-report-directory/report.md"), result = run(args(root, report));
    assert.equal(result.status, 0, result.stderr); assert.match(await readFile(report, "utf8"), /PSGC Reconciliation Report/);
    assert.equal(JSON.parse(await readFile(join(root, "metadata.json"))).marker, "original");
  } finally { await cleanup(root); }
});

test("dense valid polygons build without argument limits and invalid geometry fails validation", async () => {
  const root = await directory();
  try {
    const ring = Array.from({ length: 200000 }, (_, n) => [120 + Math.cos(n * Math.PI * 2 / 200000), 12 + Math.sin(n * Math.PI * 2 / 200000)]); ring.push(ring[0]);
    await inputs(root, { type: "Polygon", coordinates: [ring] });
    const result = run(args(root, join(root, "report.md"))); assert.equal(result.status, 0, result.stderr);
    const lookup = JSON.parse(await readFile(join(root, "out/admin_lookup.json"))); assert.deepEqual(lookup[0].bbox, [119, 11, 121, 13]);
    const normalized = { type: "FeatureCollection", features: [{ type: "Feature", properties: { ...properties, match_status: "matched" }, geometry: { type: "Point", coordinates: ["bad", "coordinates"] } }] };
    const invalid = join(root, "invalid.json"); await writeFile(invalid, JSON.stringify(normalized));
    const validation = run(["--validate", invalid, "--lookup", join(root, "out/admin_lookup.json")]);
    assert.notEqual(validation.status, 0); assert.match(validation.stderr, /polygon geometry/);
    await inputs(root, normalized.features[0].geometry);
    assert.notEqual(run(args(root, join(root, "report.md"))).status, 0, "input validation must reject bad geometry before generating any output");
  } finally { await cleanup(root); }
});
