import { getSqliteConnection } from "./connection";

type DatabaseValidationRow = {
  ok: number;
};

export async function validateDatabaseConnection(): Promise<boolean> {
  const database = await getSqliteConnection();
  const rows = await database.select<DatabaseValidationRow[]>("SELECT 1 as ok");

  return rows[0]?.ok === 1;
}
