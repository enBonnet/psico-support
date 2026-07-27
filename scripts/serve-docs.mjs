// Serves the docs/ folder (incl. docs/app-map.html) and opens it in the browser.
// Zero dependencies — uses only Node's built-in http/fs modules.
//
//   node scripts/serve-docs.mjs              # default port 4173
//   node scripts/serve-docs.mjs --port 8080  # custom port
//   node scripts/serve-docs.mjs --no-open    # don't auto-open the browser
//   npm run docs                             # via package.json

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "..", "docs");
const DEFAULT_PAGE = "app-map.html";

// --- parse args ---
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const PORT = Number(getArg("port") ?? 4173);
const NO_OPEN = args.includes("--no-open");
const HOST = getArg("host") ?? "localhost";

if (!fs.existsSync(DOCS_DIR)) {
  console.error(`✗ No se encontró la carpeta docs/ en ${DOCS_DIR}`);
  process.exit(1);
}

// --- minimal MIME map (only types this folder actually uses) ---
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    // Strip query/hash, decode, normalize.
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0].split("#")[0]);

    // Resolve safely under DOCS_DIR (block path traversal).
    const filePath = path.normalize(path.join(DOCS_DIR, urlPath));
    if (!filePath.startsWith(DOCS_DIR)) {
      res.writeHead(403).end("403 Forbidden");
      return;
    }

    fs.stat(filePath, (err, stats) => {
      // Directory → serve the default page if present, else a listing.
      if (!err && stats.isDirectory()) {
        const indexFile = path.join(filePath, "index.html");
        const defaultFile = path.join(filePath, DEFAULT_PAGE);
        const candidate = fs.existsSync(indexFile)
          ? indexFile
          : fs.existsSync(defaultFile)
            ? defaultFile
            : null;
        if (candidate) return serveFile(candidate, res);
        return serveListing(filePath, DOCS_DIR, res);
      }
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end(`404 Not Found: ${urlPath}`);
        return;
      }
      serveFile(filePath, res);
    });
  } catch (e) {
    res.writeHead(500).end("500 Internal Server Error");
  }
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  // Stream the file so large PDFs don't load fully into memory.
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, { "content-type": type });
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  });
}

function serveListing(dir, root, res) {
  const rel = path.relative(root, dir) || "/";
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const rows = entries
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => {
      const slash = e.isDirectory() ? "/" : "";
      return `<li><a href="${path.posix.join("/", path.relative(root, dir), e.name)}${slash}">${e.name}${slash}</a></li>`;
    })
    .join("");
  const up = path.relative(root, path.join(dir, ".."));
  const upRow = rel !== "/" ? `<li><a href="${path.posix.join("/", up)}">../</a></li>` : "";
  const html = `<!doctype html><meta charset="utf-8"><title>${rel}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0b1228;color:#e8edff;margin:40px auto;max-width:720px}
a{color:#9ad7ff}h1{font-size:18px}ul{list-style:none;padding:0}li{padding:4px 0}</style>
<h1>docs${rel === "/" ? "/" : "/" + rel}</h1><ul>${upRow}${rows}</ul>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

// --- graceful shutdown ---
const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// --- find a free port (fall back a few times if 4173 is busy) ---
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && PORT_TRIES < 20) {
    PORT_TRIES += 1;
    const next = PORT + PORT_TRIES;
    server.listen(next, HOST);
  } else {
    console.error(`✗ No se pudo iniciar el servidor en ${HOST}:${PORT} — ${e.message}`);
    process.exit(1);
  }
});
let PORT_TRIES = 0;

server.listen(PORT, HOST, () => {
  const tries = PORT_TRIES;
  const port = PORT + tries;
  const url = `http://${HOST}:${port}/`;
  const fileUrl = `${url}${DEFAULT_PAGE}`;
  console.log(`\n  📖 Documentación de PsicoAyudaVen`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Diagrama: ${fileUrl}`);
  console.log(`  Índice:   ${url}`);
  console.log(`  (Ctrl+C para detener)\n`);

  if (!NO_OPEN) open(fileUrl);
});

// --- cross-platform "open URL in default browser" ---
function open(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    exec(`${cmd} "${url}"`, (err) => {
      if (err) console.log(`  (no se pudo abrir el navegador automáticamente — abre ${url})`);
    });
  } catch {
    /* ignore */
  }
}
