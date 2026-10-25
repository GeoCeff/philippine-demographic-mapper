import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";

const root = realpathSync(".");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const types = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".gz": "application/gzip",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const target = join(root, safePath === "/" ? "index.html" : safePath);
  if (!insideRoot(target)) return null;
  return target;
}
function insideRoot(path) { const part = relative(root, path); return part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part); }

const server = createServer((request, response) => {
  let target;
  try { target = resolveRequestPath(request.url || "/"); }
  catch { response.writeHead(400); response.end("Bad request"); return; }
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end("Method not allowed"); return; }
  if (!target) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stats = statSync(target);
    const filePath = stats.isDirectory() ? join(target, "index.html") : target;
    if (!insideRoot(realpathSync(filePath))) { response.writeHead(403); response.end("Forbidden"); return; }
    const file = statSync(filePath);
    if (!file.isFile()) { response.writeHead(404); response.end("Not found"); return; }
    const headers = { "Content-Type": types[extname(filePath)] || "application/octet-stream", "Content-Length": file.size };
    if (request.method === "HEAD") { response.writeHead(200, headers); response.end(); return; }
    const stream = createReadStream(filePath);
    stream.once("error", () => {
      if (response.headersSent) response.destroy();
      else { response.writeHead(404); response.end("Not found"); }
    });
    stream.once("open", () => { response.writeHead(200, headers); stream.pipe(response); });
    response.once("close", () => stream.destroy());
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Demographic Map Maker running at http://${host}:${server.address().port}/`);
});
