import { platform, homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

export function getAppDataDir(): string {
  switch (platform()) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "role-radar");
    case "win32":
      return join(
        process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
        "role-radar"
      );
    default:
      return join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
        "role-radar"
      );
  }
}

export function getResumesDir(): string {
  const dir = join(getAppDataDir(), "resumes");
  mkdirSync(dir, { recursive: true });
  return dir;
}
