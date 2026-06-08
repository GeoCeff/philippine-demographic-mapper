import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const types = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(root, safePath === "/" ? "index.html" : safePath));
  if (!target.startsWith(root)) return null;
  return target;
}

const server = createServer((request, response) => {
  const target = resolveRequestPath(request.url || "/");
  if (!target) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stats = statSync(target);
    const filePath = stats.isDirectory() ? join(target, "index.html") : target;
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Demographic Map Maker running at http://${host}:${port}/`);
});
