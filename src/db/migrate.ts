import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "./connection.js";

export function migrate(databasePath?: string): void {
  const schemaPath = path.resolve("data/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    db.exec(schema);
  } finally {
    db.close();
  }
}
