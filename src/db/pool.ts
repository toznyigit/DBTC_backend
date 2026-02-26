import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function runMigrations(): Promise<void> {
    const migrationDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
        await pool.query(sql);
        console.log(`✓ Migration applied: ${file}`);
    }
}
