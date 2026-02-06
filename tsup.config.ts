import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    context: "src/context.ts",
    buffer: "src/buffer.ts",
    play: "src/play.ts",
    emitter: "src/emitter.ts",
    nodes: "src/nodes.ts",
    waveform: "src/waveform.ts",
    fade: "src/fade.ts",
    scheduler: "src/scheduler.ts",
    synth: "src/synth.ts",
    adapters: "src/adapters.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  target: "es2020",
});
