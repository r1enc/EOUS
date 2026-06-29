import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const databasePath = "eous.db";

if (!existsSync(databasePath)) {
  throw new Error(`Database file not found: ${databasePath}`);
}

const database = new DatabaseSync(databasePath);

try {
  const tableCount = database
    .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table'")
    .get().count;

  if (tableCount === 0) {
    throw new Error("Seed workflow requires migrated database tables.");
  }

  console.log("No seed data is defined for the database foundation.");
} finally {
  database.close();
}
