import Database from "better-sqlite3";
import { env } from "../config/env.js";

export function openDatabase(databasePath = env.databasePath): Database.Database {
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}
