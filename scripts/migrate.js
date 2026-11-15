const { config } = require("dotenv");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

config({ path: path.resolve(__dirname, "../.env") });

async function migrate() {
  if (!process.env.DATABASE_OWNER_URL || !process.env.DATABASE_URL) {
    throw new Error("DATABASE_OWNER_URL and DATABASE_URL must be set in the root .env file.");
  }
  const client = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await client.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const name = "001_core.sql";
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
    if (!applied.rowCount) {
      await client.query("BEGIN");
      try {
        await client.query(await readFile(path.resolve(__dirname, "../migrations", name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const runtimeRole = decodeURIComponent(new URL(process.env.DATABASE_URL).username);
    const quotedRole = `"${runtimeRole.replace(/"/g, '""')}"`;
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`);
    console.log("Database migration completed.");
  } finally {
    await client.end();
  }
}

migrate().catch(error => { console.error(error); process.exitCode = 1; });
