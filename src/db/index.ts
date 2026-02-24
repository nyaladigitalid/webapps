import 'dotenv/config';

console.log("MYSQL_URL =", process.env.MYSQL_URL);

import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

const url = process.env.MYSQL_URL;

if (!url) {
  throw new Error('MYSQL_URL environment variable is not set');
}

const pool = mysql.createPool(url);
export const db = drizzle(pool);
