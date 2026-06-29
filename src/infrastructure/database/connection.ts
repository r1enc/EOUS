import Database from "@tauri-apps/plugin-sql";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { RemoteCallback } from "drizzle-orm/sqlite-proxy";

import { databaseUrl } from "./config";

let sqliteConnection: Promise<Database> | undefined;
let drizzleConnection: Promise<SqliteRemoteDatabase> | undefined;

export function getSqliteConnection(): Promise<Database> {
  sqliteConnection ??= Database.load(databaseUrl);

  return sqliteConnection;
}

export function getDatabase(): Promise<SqliteRemoteDatabase> {
  drizzleConnection ??= createDrizzleConnection();

  return drizzleConnection;
}

async function createDrizzleConnection(): Promise<SqliteRemoteDatabase> {
  const sqlite = await getSqliteConnection();

  const query: RemoteCallback = async (sql, params, method) => {
    if (method === "run") {
      const result = await sqlite.execute(sql, params);

      return { rows: [result] };
    }

    const rows = await sqlite.select<unknown[]>(sql, params);

    return { rows };
  };

  return drizzle(query);
}
