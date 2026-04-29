import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Role Radar",
    identifier: "com.roleradar.app",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      external: ["@kreuzberg/node"],
    },
    views: {},
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets/": "views/mainview/assets/",
      "migrations/001_init.sql": "migrations/001_init.sql",
      "node_modules/@kreuzberg/": "node_modules/@kreuzberg/",
    },
  },
} satisfies ElectrobunConfig;
