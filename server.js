/**
 * BAGGY AMAR 3 DA — Production Server
 * Serves the built static game files with proper headers for PWA + offline play.
 * Works on Render.com, Railway, Fly.io, VPS — anywhere Node.js runs.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, "artifacts", "baggy-amar", "dist", "public");

// MIME types for every file the game uses
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};

function serveFile(res, filePath, status) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  // Cache strategy:
  // • Vite hashed assets (e.g. index-Abc12345.js) → immutable 1 year
  // • HTML / SW / manifest                         → always revalidate
  // • Everything else                              → 1 day
  const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2?)(\?.*)?$/.test(filePath);
  const isHtml = ext === ".html";
  const isSW = filePath.endsWith("sw.js");
  const cacheControl =
    isHashed
      ? "public, max-age=31536000, immutable"
      : isHtml || isSW
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=86400";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Required so SW can intercept requests at the root scope
  res.setHeader("Service-Worker-Allowed", "/");
  // Allow cross-origin for font/audio assets
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(status || 200);
    res.end(content);
  } catch (err) {
    console.error("[Server] Cannot read:", filePath, err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

const server = http.createServer((req, res) => {
  // Only handle GET / HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {}

  // Prevent path traversal attacks
  const filePath = path.normalize(path.join(DIST, pathname));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const exists = fs.existsSync(filePath);
  const isDir = exists && fs.statSync(filePath).isDirectory();

  if (exists && !isDir) {
    // Exact file found — serve it
    serveFile(res, filePath);
  } else if (isDir) {
    // Directory — try index.html inside it
    const indexPath = path.join(filePath, "index.html");
    if (fs.existsSync(indexPath)) {
      serveFile(res, indexPath);
    } else {
      // SPA fallback
      serveFile(res, path.join(DIST, "index.html"));
    }
  } else {
    // Unknown path → SPA fallback (React handles routing client-side)
    serveFile(res, path.join(DIST, "index.html"));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🎮  BAGGY AMAR 3 DA`);
  console.log(`    Server  : http://0.0.0.0:${PORT}`);
  console.log(`    Serving : ${DIST}`);
  console.log(`    PWA     : offline-ready via service worker\n`);
});

server.on("error", (err) => {
  console.error("[Server] Fatal error:", err.message);
  process.exit(1);
});
