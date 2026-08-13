import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const localBuildRevision = () => {
  const commit = git("rev-parse", "--short=8", "HEAD");
  const dirty = git("status", "--porcelain").length > 0;

  return `${commit}${dirty ? "-dirty" : ""}`;
};

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_LOCAL_BUILD_REVISION": JSON.stringify(
      command === "serve" ? localBuildRevision() : null
    ),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
  },
  // to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}));
