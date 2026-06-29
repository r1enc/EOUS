import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/database/schema.ts",
  dbCredentials: {
    url: "./eous.db"
  },
  strict: true,
  verbose: true
});
