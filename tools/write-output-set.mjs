import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

// Stage the whole set first; keep backups until every publication succeeds.
export async function writeOutputSet(outputs, promote = rename) {
  const files = outputs.map(({ path, bytes }) => ({ path: resolve(path), bytes }));
  if (new Set(files.map((file) => process.platform === "win32" ? file.path.toLowerCase() : file.path)).size !== files.length) throw new Error("Output destinations must be distinct");
  const token = `${process.pid}.${randomUUID()}`, staged = [], published = [];
  try {
    for (const file of files) {
      await assertNoLinks(file.path);
      await mkdir(dirname(file.path), { recursive: true });
      const current = await lstat(file.path).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      if (current && !current.isFile()) throw new Error("Output destination is not a file: " + file.path);
      if (current) await access(file.path, constants.W_OK);
      const item = { ...file, temporary: `${file.path}.${token}.tmp`, backup: current ? `${file.path}.${token}.bak` : null };
      staged.push(item);
      await writeFile(item.temporary, file.bytes, { flag: "wx" });
      if (item.backup) await copyFile(file.path, item.backup, constants.COPYFILE_EXCL);
    }
    for (const item of staged) { await promote(item.temporary, item.path); published.push(item); }
  } catch (error) {
    const failures = [];
    for (const item of published.reverse()) {
      try { if (item.backup) await rename(item.backup, item.path); else await unlink(item.path); }
      catch (rollbackError) { item.keepBackup = true; failures.push(rollbackError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "Output publication failed; a rollback failed. Preserved .bak files beside their destinations.");
    throw error;
  } finally {
    for (const item of staged) for (const path of [item.temporary, ...(item.backup && !item.keepBackup ? [item.backup] : [])]) {
      await unlink(path).catch((error) => { if (error.code !== "ENOENT") throw error; });
    }
  }
}

async function assertNoLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Refusing linked output path: " + current); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(current) === current) break;
  }
}
