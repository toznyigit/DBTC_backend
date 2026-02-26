/**
 * Streak Calculation Algorithm
 *
 * Rules:
 * - If today is completed → start counting from today backwards.
 * - If today is NOT completed but yesterday IS → streak is still valid (user hasn't missed yet).
 * - If yesterday is also missing → streak = 0.
 */

function toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function subDays(d: Date, n: number): Date {
    const copy = new Date(d);
    copy.setUTCDate(copy.getUTCDate() - n);
    return copy;
}

export function calculateStreak(completionDates: string[]): number {
    if (completionDates.length === 0) return 0;

    // Build a set for O(1) lookup
    const dateSet = new Set(completionDates);

    const todayStr = toDateStr(new Date());
    const yesterdayStr = toDateStr(subDays(new Date(), 1));

    // Determine where to start counting
    let cursor: Date;
    if (dateSet.has(todayStr)) {
        cursor = new Date(todayStr + 'T00:00:00Z');
    } else if (dateSet.has(yesterdayStr)) {
        // Today not done yet but chain still intact
        cursor = new Date(yesterdayStr + 'T00:00:00Z');
    } else {
        return 0;
    }

    let streak = 0;
    while (dateSet.has(toDateStr(cursor))) {
        streak++;
        cursor = subDays(cursor, 1);
    }
    return streak;
}

export function calculateLongestStreak(completionDates: string[]): number {
    if (completionDates.length === 0) return 0;
    const sorted = [...completionDates].sort();
    let longest = 1;
    let current = 1;

    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
        const curr = new Date(sorted[i] + 'T00:00:00Z');
        const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
        if (diffDays === 1) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 1;
        }
    }
    return longest;
}
