import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const dataDir = path.join(appRoot, "data");
const dbPath = path.join(dataDir, "control3d.sqlite");

function loadLocalEnv() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadLocalEnv();

const email = (
  process.env.CONTROL3D_DEFAULT_ADMIN_EMAIL ?? "admin@example.com"
)
  .trim()
  .toLowerCase();
const password = process.env.CONTROL3D_DEFAULT_ADMIN_PASSWORD ?? "ChangeMe123";
const permissions = ["*"];

async function hashPassword(input) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(input, salt, keyLength);
  return `scrypt$${salt}$${Buffer.from(derived).toString("base64url")}`;
}

function ensureAdminTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'map_manager',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

mkdirSync(dataDir, { recursive: true });
const existedBefore = existsSync(dbPath);
const db = new DatabaseSync(dbPath);
ensureAdminTable(db);

const existing = db
  .prepare("SELECT id, email, role, is_active FROM admins WHERE email = ?")
  .get(email);

if (existing) {
  db.prepare(
    `
      UPDATE admins
      SET password_hash = ?,
          role = 'super_admin',
          permissions_json = ?,
          is_active = 1,
          updated_at = ?
      WHERE email = ?
    `,
  ).run(await hashPassword(password), JSON.stringify(permissions), new Date().toISOString(), email);

  console.log(`Admin ensured active and password synced: ${email}`);
  db.close();
  process.exit(0);
}

const now = new Date().toISOString();
db.prepare(
  `
    INSERT INTO admins (
      id, email, password_hash, role, permissions_json, is_active, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'super_admin', ?, 1, NULL, ?, ?)
  `,
).run(
  randomUUID(),
  email,
  await hashPassword(password),
  JSON.stringify(permissions),
  now,
  now,
);

db.close();

console.log(`Admin seeded: ${email}`);
console.log(`Database: ${dbPath}${existedBefore ? "" : " (created)"}`);
