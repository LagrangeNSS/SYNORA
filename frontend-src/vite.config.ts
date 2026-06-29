import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SYNORA frontend — builds to ../ai-society/frontend (served by FastAPI)
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: "../frontend",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
