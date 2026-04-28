import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";

export function createTestDatabase(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-test-"));
  const databasePath = path.join(dir, "test.sqlite");

  migrate(databasePath);
  return openDatabase(databasePath);
}
