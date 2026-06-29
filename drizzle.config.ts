import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: {
    url: "./eous.db"
  },
  strict: true,
  verbose: true
});
