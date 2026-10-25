import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";

test("bad URLs, absent directory indexes and linked paths cannot crash or escape the server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "map-server-test-")), root = join(directory, "site");
  await mkdir(root); await mkdir(join(root, "empty")); await mkdir(join(directory, "outside"));
  await writeFile(join(root, "index.html"), "fixture"); await writeFile(join(directory, "outside/secret.txt"), "outside");
  await symlink(join(directory, "outside"), join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  const child = spawn(process.execPath, [resolve("server.mjs")], { cwd: root, env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((done) => child.once("exit", done));
  try {
    const port = await new Promise((done, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("server did not start")), 5000);
      child.once("error", reject);
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); done(Number(match[1])); } });
    });
    const get = (path, method = "GET") => new Promise((done, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path, method }, (response) => {
        let body = ""; response.on("data", (chunk) => { body += chunk; }); response.on("end", () => done({ status: response.statusCode, body, headers: response.headers }));
      }); req.on("error", reject); req.end();
    });
    for (const [path, status] of [["/bad%ZZ", 400], ["/empty/", 404], ["/absent", 404], ["/linked/secret.txt", 403]]) {
      assert.equal((await get(path)).status, status, path);
      assert.equal((await get("/")).body, "fixture", "the server must remain usable after each rejected request");
    }
    assert.equal((await get("/", "POST")).status, 405);
    const head = await get("/", "HEAD"); assert.equal(head.status, 200); assert.equal(head.body, ""); assert.equal(head.headers["content-length"], "7");
    assert.equal(child.exitCode, null); assert.equal(stderr, "");
  } finally {
    child.kill(); await exited;
    assert(directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith("map-server-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
