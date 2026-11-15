import { Pool, types } from "pg";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });
// PostgreSQL sends BIGINT columns as strings by default. The API contract
// exposes epoch timestamps as JSON numbers, and the web date inputs expect ms.
types.setTypeParser(20, Number);
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
