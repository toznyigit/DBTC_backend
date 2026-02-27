import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticate, AuthRequest } from '../middleware/auth';
import { calculateStreak, calculateLongestStreak } from '../utils/streak';

const router = Router();
router.use(authenticate);

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitType = 'boolean' | 'counter' | 'gauge';
type CounterDirection = 'gte' | 'lte';

interface HabitRow {
    id: string;
    name: string;
    color: string;
    type: HabitType;
    goal: string | null;     // Postgres NUMERIC comes back as string
    direction: CounterDirection | null;
    unit: string | null;
    created_at: string;
}

interface DailyTotal {
    completed_date: string;
    daily_total: string;     // NUMERIC → string from pg
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Given a habit and its today's accumulated value (null = nothing logged),
 * determine whether the habit is fulfilled today.
 */
function isFulfilled(habit: HabitRow, todayValue: number | null): boolean {
    if (habit.type === 'boolean') {
        return todayValue !== null && todayValue > 0;
    }
    if (todayValue === null || habit.goal === null) return false;
    const goal = Number(habit.goal);
    if (habit.type === 'counter') {
        return habit.direction === 'gte'
            ? todayValue >= goal
            : todayValue <= goal;
    }
    if (habit.type === 'gauge') {
        // Within ±5% of goal
        return todayValue >= goal * 0.95 && todayValue <= goal * 1.05;
    }
    return false;
}

/**
 * Fetch all daily totals for a habit and return:
 *   - completions: dates where habit was fulfilled (for streak)
 *   - todayValue:  today's accumulated value (null if nothing logged today)
 */
async function getDailyData(
    habitId: string,
    habit: HabitRow
): Promise<{ completions: string[]; todayValue: number | null }> {
    const result = await pool.query<DailyTotal>(
        `SELECT completed_date, daily_total
         FROM habit_daily_totals
         WHERE habit_id = $1
         ORDER BY completed_date DESC`,
        [habitId]
    );

    const today = todayUTC();
    let todayValue: number | null = null;
    const completions: string[] = [];

    for (const row of result.rows) {
        const val = Number(row.daily_total);
        if (row.completed_date === today) {
            todayValue = val;
        }
        if (isFulfilled(habit, val)) {
            completions.push(row.completed_date);
        }
    }

    return { completions, todayValue };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /habits
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const habitsResult = await pool.query<HabitRow>(
            `SELECT id, name, color, type, goal, direction, unit, created_at
             FROM habits
             WHERE user_id = $1
             ORDER BY created_at ASC`,
            [req.userId]
        );

        const enriched = await Promise.all(
            habitsResult.rows.map(async (habit) => {
                const { completions, todayValue } = await getDailyData(habit.id, habit);
                return {
                    ...habit,
                    goal: habit.goal !== null ? Number(habit.goal) : null,
                    streak: calculateStreak(completions),
                    longestStreak: calculateLongestStreak(completions),
                    completions,
                    todayValue,
                };
            })
        );

        res.json({ habits: enriched });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /habits — create habit
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, color, type = 'boolean', goal = null, direction = null, unit = null } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Habit name is required' });
        return;
    }
    if (name.trim().length > 100) {
        res.status(400).json({ error: 'Habit name must be 100 characters or fewer' });
        return;
    }

    // Validate type
    if (!['boolean', 'counter', 'gauge'].includes(type)) {
        res.status(400).json({ error: 'Invalid habit type' });
        return;
    }

    // Validate color
    const safeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)
        ? color
        : '#f59e0b';

    // Validate goal for non-boolean types
    if (type !== 'boolean') {
        if (goal === null || goal === undefined || isNaN(Number(goal)) || Number(goal) < 0) {
            res.status(400).json({ error: 'A non-negative goal is required for counter and gauge habits' });
            return;
        }
    }

    // Validate direction for counter type
    if (type === 'counter' && !['gte', 'lte'].includes(direction)) {
        res.status(400).json({ error: 'Direction must be "gte" or "lte" for counter habits' });
        return;
    }

    // Validate unit
    const safeUnit = typeof unit === 'string' && unit.trim().length > 0
        ? unit.trim().slice(0, 20)
        : null;

    try {
        const result = await pool.query<HabitRow>(
            `INSERT INTO habits (user_id, name, color, type, goal, direction, unit)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, color, type, goal, direction, unit, created_at`,
            [
                req.userId,
                name.trim(),
                safeColor,
                type,
                type !== 'boolean' ? Number(goal) : null,
                type === 'counter' ? direction : null,
                safeUnit,
            ]
        );

        const habit = result.rows[0];
        res.status(201).json({
            habit: {
                ...habit,
                goal: habit.goal !== null ? Number(habit.goal) : null,
                streak: 0,
                longestStreak: 0,
                completions: [],
                todayValue: null,
            },
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

// POST /habits/:id/checkin — boolean habits only (toggle today)
router.post('/:id/checkin', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const habitResult = await pool.query<HabitRow>(
            `SELECT id, name, color, type, goal, direction, unit
             FROM habits WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.userId]
        );
        if (habitResult.rowCount === 0) {
            res.status(404).json({ error: 'Habit not found' });
            return;
        }

        const habit = habitResult.rows[0];
        if (habit.type !== 'boolean') {
            res.status(400).json({ error: 'Use /log for counter and gauge habits' });
            return;
        }

        const today = todayUTC();

        // Check for existing log today
        const existing = await pool.query(
            `SELECT id FROM habit_logs WHERE habit_id = $1 AND completed_date = $2`,
            [habit.id, today]
        );

        let completed: boolean;
        if (existing.rowCount && existing.rowCount > 0) {
            // Toggle off — delete today's log
            await pool.query(
                'DELETE FROM habit_logs WHERE habit_id = $1 AND completed_date = $2',
                [habit.id, today]
            );
            completed = false;
        } else {
            // Toggle on — insert a log with value 1
            await pool.query(
                `INSERT INTO habit_logs (habit_id, completed_date, value) VALUES ($1, $2, 1)`,
                [habit.id, today]
            );
            completed = true;
        }

        const { completions, todayValue } = await getDailyData(habit.id, habit);

        res.json({
            completed,
            streak: calculateStreak(completions),
            longestStreak: calculateLongestStreak(completions),
            completions,
            todayValue,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /habits/:id/log — counter and gauge habits: add a value to today's total
router.post('/:id/log', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const habitResult = await pool.query<HabitRow>(
            `SELECT id, name, color, type, goal, direction, unit
             FROM habits WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.userId]
        );
        if (habitResult.rowCount === 0) {
            res.status(404).json({ error: 'Habit not found' });
            return;
        }

        const habit = habitResult.rows[0];
        if (habit.type === 'boolean') {
            res.status(400).json({ error: 'Use /checkin for boolean habits' });
            return;
        }

        const rawValue = req.body?.value;
        if (rawValue === undefined || rawValue === null || isNaN(Number(rawValue))) {
            res.status(400).json({ error: 'value must be a number' });
            return;
        }

        const value = Number(rawValue);
        if (value === 0) {
            res.status(400).json({ error: 'value must not be zero' });
            return;
        }

        const today = todayUTC();

        // Insert the entry — each call appends; SUM is computed in the view
        await pool.query(
            `INSERT INTO habit_logs (habit_id, completed_date, value) VALUES ($1, $2, $3)`,
            [habit.id, today, value]
        );

        const { completions, todayValue } = await getDailyData(habit.id, habit);
        const fulfilled = isFulfilled(habit, todayValue);

        res.json({
            completed: fulfilled,
            streak: calculateStreak(completions),
            longestStreak: calculateLongestStreak(completions),
            completions,
            todayValue,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;