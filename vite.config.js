import { defineConfig } from "vite";
import { workbenchApi } from "./workbench/api.js";

export default defineConfig({
  root: "workbench",
  plugins: [workbenchApi()],
  server: { host: "localhost", port: 5174, strictPort: true, watch: { ignored: ["**/vocabulary/**", "**/data/**"] } },
});
