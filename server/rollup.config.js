import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/main.ts",
  output: {
    file: "build/index.js",
    format: "es",
  },
  external: ["nakama-runtime"],
  treeshake: false,
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
    }),
  ],
};
