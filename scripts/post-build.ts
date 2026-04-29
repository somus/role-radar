import { execSync } from "child_process";
import { cpSync, existsSync } from "fs";
import { join } from "path";

const buildDir = join(import.meta.dir, "..", "build", "views", "mainview");

if (existsSync(join(buildDir, "main.css"))) {
  console.log("CSS already built by Bun.build");
} else {
  console.log("Post-build: Tailwind CSS processing skipped (handled by bundler)");
}
