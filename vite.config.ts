import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const tauriEnv = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};
const tauriDevHost = tauriEnv.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: tauriDevHost || false,
    port: 1420,
    strictPort: true,
    hmr: tauriDevHost
      ? {
          protocol: "ws",
          host: tauriDevHost,
          port: 1421
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  envPrefix: ["VITE_", "TAURI_"]
});
