import 'dotenv/config';
import type { Config } from "drizzle-kit";

const url = process.env.MYSQL_URL;
if (!url) {
  throw new Error("MYSQL_URL not set");
}

const u = new URL(url);
const dbCredentials = {
  host: u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username || ""),
  password: decodeURIComponent(u.password || ""),
  database: (u.pathname || "").replace(/^\//, ""),
};

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials,
} satisfies Config;
