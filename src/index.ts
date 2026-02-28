import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import habitRoutes from './routes/habits';
import { runMigrations } from './db/pool';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/auth', authRoutes);
app.use('/habits', habitRoutes);

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all 404
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

async function main() {
    try {
        await runMigrations();
        app.listen(PORT, () => {
            console.log(`🚀 DBTC API running on http://localhost:${PORT}`);
            console.log(`CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);
            console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

main();
