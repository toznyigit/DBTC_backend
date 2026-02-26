import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';
import { calculateStreak, calculateLongestStreak } from '../utils/streak';

const router = Router();

// All habits routes require authentication
router.use(authenticate);

// GET /habits — list all habits with current streak + completion dates
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const habitsResult = await pool.query(
            'SELECT id, name, color, created_at FROM habits WHERE user_id = $1 ORDER BY created_at ASC',
            [req.userId]
        );
        const habits = habitsResult.rows;

        const enriched = await Promise.all(
            habits.map(async (habit) => {
                const compResult = await pool.query(
                    'SELECT completed_date::text FROM completions WHERE habit_id = $1 ORDER BY completed_date DESC',
                    [habit.id]
                );
                const dates: string[] = compResult.rows.map((r: { completed_date: string }) => r.completed_date);
                return {
                    ...habit,
                    streak: calculateStreak(dates),
                    longestStreak: calculateLongestStreak(dates),
                    completions: dates,
                };
            })
        );

        res.json({ habits: enriched });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /habits — create new habit
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Habit name is required' });
        return;
    }
    try {
        const result = await pool.query(
            'INSERT INTO habits (user_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color, created_at',
            [req.userId, name.trim(), color || '#f59e0b']
        );
        const habit = result.rows[0];
        res.status(201).json({
            habit: { ...habit, streak: 0, longestStreak: 0, completions: [] },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /habits/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'DELETE FROM habits WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.userId]
        );
        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Habit not found' });
            return;
        }
        res.json({ message: 'Habit deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /habits/:id/checkin — toggle today's completion
router.post('/:id/checkin', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Verify ownership
        const habitResult = await pool.query(
            'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        if (habitResult.rowCount === 0) {
            res.status(404).json({ error: 'Habit not found' });
            return;
        }

        const today = new Date().toISOString().slice(0, 10);

        // Check if already completed today
        const existing = await pool.query(
            'SELECT id FROM completions WHERE habit_id = $1 AND completed_date = $2',
            [req.params.id, today]
        );

        let completed: boolean;
        if (existing.rowCount && existing.rowCount > 0) {
            // Toggle off
            await pool.query('DELETE FROM completions WHERE habit_id = $1 AND completed_date = $2', [req.params.id, today]);
            completed = false;
        } else {
            // Toggle on
            await pool.query(
                'INSERT INTO completions (habit_id, completed_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.params.id, today]
            );
            completed = true;
        }

        // Return updated streak
        const compResult = await pool.query(
            'SELECT completed_date::text FROM completions WHERE habit_id = $1 ORDER BY completed_date DESC',
            [req.params.id]
        );
        const dates: string[] = compResult.rows.map((r: { completed_date: string }) => r.completed_date);

        res.json({
            completed,
            streak: calculateStreak(dates),
            longestStreak: calculateLongestStreak(dates),
            completions: dates,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
