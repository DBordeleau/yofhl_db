export const EVENING_REFRESH_TIMES = ['20:00', '21:00', '22:00', '23:30'] as const;
export const UTC_REFRESH_SLOTS = ['00:00', '01:00', '02:00', '03:00', '03:30', '04:30'] as const;

// Daily UTC jobs cover both Eastern offsets. The two unused slots do no refresh work.
export function scheduledRefreshTime(slot: string | null, now: number): string | null {
    if (!UTC_REFRESH_SLOTS.some(value => value === slot)) return null;
    const [hour, minute] = slot!.split(':').map(Number);
    const scheduled = new Date(now);
    scheduled.setUTCHours(hour, minute, 0, 0);
    if (scheduled.getTime() > now) scheduled.setUTCDate(scheduled.getUTCDate() - 1);
    // Hobby jobs may arrive during the following hour. Evaluate the scheduled time, not arrival time.
    if (now - scheduled.getTime() >= 60 * 60 * 1000) return null;
    const eastern = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(scheduled);
    return EVENING_REFRESH_TIMES.some(value => value === eastern) ? eastern : null;
}
