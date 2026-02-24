const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function exportDb() {
    console.log('Starting database export...');
    
    const connectionUrl = process.env.MYSQL_URL;
    if (!connectionUrl) {
        console.error('MYSQL_URL not defined in .env');
        process.exit(1);
    }

    const conn = await mysql.createConnection(connectionUrl);
    
    let sql = "SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n";

    try {
        const [tables] = await conn.query('SHOW TABLES');
        
        for (const row of tables) {
            const tableName = Object.values(row)[0];
            console.log(`Exporting table: ${tableName}`);

            // Get Create Table statement
            const [createRows] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
            sql += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            let createTable = createRows[0]['Create Table'];
            // Ensure table uses utf8mb4
            if (!createTable.includes('CHARSET=utf8mb4')) {
                 createTable = createTable.replace(/CHARSET=\w+/, 'CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
            }
            sql += `${createTable};\n\n`;

            // Get Data
            const [dataRows] = await conn.query(`SELECT * FROM \`${tableName}\``);
            
            if (dataRows.length > 0) {
                // Batch insert to avoid huge statements if many rows
                const chunkSize = 100;
                for (let i = 0; i < dataRows.length; i += chunkSize) {
                    const chunk = dataRows.slice(i, i + chunkSize);
                    sql += `INSERT INTO \`${tableName}\` VALUES `;
                    const values = chunk.map(r => {
                        return '(' + Object.values(r).map(v => conn.escape(v)).join(',') + ')';
                    }).join(',\n');
                    sql += values + ';\n';
                }
                sql += '\n';
            }
        }

        sql += "SET FOREIGN_KEY_CHECKS=1;\n";

        const outputPath = path.join(__dirname, '..', 'nyala_local_dump.sql');
        fs.writeFileSync(outputPath, sql);
        console.log(`Database dump created successfully at: ${outputPath}`);

    } catch (err) {
        console.error('Export failed:', err);
    } finally {
        await conn.end();
    }
}

exportDb();
