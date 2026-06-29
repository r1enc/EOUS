import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationsPath = "drizzle";
const databasePath = "eous.db";

const expectedTables = [
  "__drizzle_migrations",
  "app_settings",
  "conversation_messages",
  "conversations",
  "memories",
  "providers",
  "tools"
];

if (!existsSync(migrationsPath)) {
  throw new Error(`Migration output directory not found: ${migrationsPath}`);
}

const migrationFiles = readdirSync(migrationsPath).filter((fileName) =>
  fileName.endsWith(".sql")
);

if (migrationFiles.length === 0) {
  throw new Error("No SQL migration files were found.");
}

const journalPath = join(migrationsPath, "meta", "_journal.json");

if (!existsSync(journalPath)) {
  throw new Error(`Drizzle migration journal not found: ${journalPath}`);
}

if (!existsSync(databasePath)) {
  throw new Error(`Database file not found: ${databasePath}`);
}

const database = new DatabaseSync(databasePath);

try {
  const rows = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all();
  const tableNames = new Set(rows.map((row) => row.name));
  const missingTables = expectedTables.filter((tableName) => !tableNames.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(`Missing migrated tables: ${missingTables.join(", ")}`);
  }

  console.log("Database lifecycle validation succeeded.");
} finally {
  database.close();
}
