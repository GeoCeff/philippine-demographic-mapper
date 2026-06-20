import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const files = [
  "server.mjs",
  "tools/data-pipeline.mjs",
  "tools/check-syntax.mjs",
  "tools/smoke-test.mjs",
  "tools/validate-samples.mjs",
  ...(await listJsFiles("src"))
];

for (const file of files) {
  const result = spawnSync("node", ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax checked ${files.length} files`);

async function listJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}
