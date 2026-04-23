import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// In production (Render.com / CI), PORT and BASE_PATH may not be set.
// Provide sensible defaults so `vite build` always succeeds.
const port = Number(process.env.PORT || "8080");
const basePath = process.env.BASE_PATH || "/";
const isDev = process.env.NODE_ENV !== "production";
const isReplit = process.env.REPL_ID !== undefined;

export default defineConfig(async () => ({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(isDev && isReplit
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default()
          ),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            })
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner()
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Produce smaller chunks for faster PWA caching
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
