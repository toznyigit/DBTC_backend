import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';

const router = Router();
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setCookieToken(res: Response, userId: string): void {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: TOKEN_EXPIRY });
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
    });
}

// POST /auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
        res.status(400).json({ error: 'Valid email and password (min 6 chars) required' });
        return;
    }
    try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: 'Email already registered' });
            return;
        }
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email.toLowerCase(), password_hash]
        );
        const user = result.rows[0];
        setCookieToken(res, user.id);
        res.status(201).json({ user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
    }
    try {
        const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        setCookieToken(res, user.id);
        res.json({ user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
    res.json({ message: 'Logged out' });
});

// GET /auth/me — session check
router.get('/me', async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.token;
    if (!token) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [payload.userId]);
        const user = result.rows[0];
        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        res.json({ user: { id: user.id, email: user.email } });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
