import type { Database } from "bun:sqlite";
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { hostname, homedir } from "node:os";

const ALGO = "aes-256-gcm";
const ITERATIONS = 100_000;
const KEY_LEN = 32;
const INSTALL_ID_KEY = "_install_id";

function getInstallId(db: Database): string {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(INSTALL_ID_KEY) as { value: string } | null;
  if (row) return row.value;
  const id = randomBytes(32).toString("hex");
  db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run(INSTALL_ID_KEY, id);
  return id;
}

function deriveKey(db: Database, salt: Buffer): Buffer {
  const installId = getInstallId(db);
  const material = `${hostname()}:${homedir()}:${installId}:role-radar`;
  return pbkdf2Sync(material, salt, ITERATIONS, KEY_LEN, "sha256");
}

export function storeSecret(db: Database, name: string, plaintext: string): void {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(db, salt);

  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = JSON.stringify({
    c: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    s: salt.toString("base64"),
    t: tag.toString("base64"),
  });

  db.query(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(name, envelope);
}

export function getSecret(db: Database, name: string): string | null {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(name) as { value: string } | null;
  if (!row) return null;

  try {
    const { c, iv, s, t } = JSON.parse(row.value);
    const salt = Buffer.from(s, "base64");
    const key = deriveKey(db, salt);
    const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(t, "base64"));
    return decipher.update(Buffer.from(c, "base64")).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

export function deleteSecret(db: Database, name: string): void {
  db.query("DELETE FROM settings WHERE key = ?").run(name);
}
