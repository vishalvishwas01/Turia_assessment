import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), "../../.env") });

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_OWNER_URL,
  });
  await client.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = resolve(process.cwd(), "../../migrations");
    const migrations = (await readdir(directory))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    for (const name of migrations) {
      const done = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (done.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(resolve(directory, name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
          name,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const runtimeRole = decodeURIComponent(
      new URL(process.env.DATABASE_URL!).username,
    );
    const quotedRole = `"${runtimeRole.replace(/"/g, '""')}"`;
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
