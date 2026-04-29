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
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/main.tsx",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "migrations/001_init.sql": "migrations/001_init.sql",
    },
  },
  scripts: {
    postBuild: "./scripts/post-build.ts",
  },
} satisfies ElectrobunConfig;
