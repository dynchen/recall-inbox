import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/view/client",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 17865,
    proxy: {
      "/api": "http://127.0.0.1:17864"
    }
  },
  build: {
    outDir: "../../../dist/view",
    emptyOutDir: true
  }
});
