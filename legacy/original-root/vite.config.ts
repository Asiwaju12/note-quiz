import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The checked-in project is currently flat (components, game and utils
// files are at the repository root), so resolve the historical aliases there.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      {
        find: /^@\/(?:components|game|utils)\//,
        replacement: `${__dirname}/`,
      },
      {
        find: "@",
        replacement: __dirname,
      },
    ],
  },
});
