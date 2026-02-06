import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      waa: resolve(__dirname, "../src"),
    },
  },
  base: "./",
  build: {
    outDir: "dist",
  },
});
