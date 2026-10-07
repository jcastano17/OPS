import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores(["data/", "node_modules/"]),
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "server.js",
      "eslint.config.js",
      "lib/**/*.js",
      "scripts/**/*.js",
      "tests/**/*.js",
    ],
    languageOptions: { globals: globals.node },
  },
]);
