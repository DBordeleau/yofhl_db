// Shared presentation rules. Odds are percentages with at most two decimal places.
export const EASTERN_ZONE = 'America/Toronto';
export const INTRO_MS = 12_000;
export const REVEAL_MS = 10_000;
export const FINALE_MS = 15_000;
export const NAV_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface LotteryTeam {
    id: number;
    name: string;
    abbreviation: string;
    logo: string | null;
}

export interface LotteryEntry extends LotteryTeam {
    odds: number | null; // null means a fixed-order team outside the draw
}

export interface LotteryRecord {
    id: string;
    title: string;
    startsAt: string;
    entries: LotteryEntry[];
    version: number;
    isCurrent: boolean;
    cancelledAt: string | null;
    winnerId: number | null;
    drawnAt: string | null;
}

export interface LotteryInput {
    id: string | null;
    version: number;
    title: string;
    easternDateTime: string;
    entries: { id: number; odds: number | null }[];
}

export interface PublicLottery {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    entries: LotteryEntry[];
    phase: 'scheduled' | 'live' | 'complete';
    revealed: { pick: number; team: LotteryEntry }[];
    winnerId: number | null;
    nextRevealAt: string | null;
}

export interface LotteryResponse {
    serverNow: string;
    lottery: PublicLottery | null;
}

export const easternInput = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: EASTERN_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
};

// Round-trip both Eastern offsets: reject nonexistent spring times and ambiguous fall times.
// No dependency on the browser's or the server's local timezone.
export const easternToIso = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time in Eastern Time.');
    const matches = ['-04:00', '-05:00'].map((offset) => new Date(`${value}:00${offset}`))
        .filter((date) => Number.isFinite(date.getTime()) && easternInput(date.toISOString()) === value);
    if (!matches.length) throw new Error('That Eastern time does not exist. Choose a time outside the spring daylight saving change.');
    if (matches.length > 1) throw new Error('That Eastern time occurs twice during the fall daylight saving change. Choose a time before 1:00 AM or at/after 2:00 AM.');
    return matches[0].toISOString();
};

export const formatEastern = (iso: string, compact = false) => new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_ZONE, month: 'short', day: 'numeric',
    ...(compact ? {} : { year: 'numeric' as const }),
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(iso));

export function validateEntries(entries: LotteryInput['entries'], teams: LotteryTeam[]) {
    if (!Array.isArray(entries) || entries.length !== teams.length || entries.length < 2 || entries.length > 64)
        throw new Error('Include every active team exactly once in the starting draft order.');
    const ids = new Set(teams.map((team) => team.id));
    const seen = new Set<number>();
    let total = 0;
    let participants = 0;
    for (const entry of entries) {
        if (!entry || !ids.has(entry.id) || seen.has(entry.id)) throw new Error('Each team must appear exactly once.');
        seen.add(entry.id);
        if (entry.odds !== null) {
            if (typeof entry.odds !== 'number' || !Number.isFinite(entry.odds) || entry.odds <= 0 || entry.odds > 100 ||
                Math.abs(entry.odds * 100 - Math.round(entry.odds * 100)) > 0.000001)
                throw new Error('Lottery odds must be greater than 0%, with no more than two decimal places.');
            total += Math.round(entry.odds * 100);
            participants++;
        }
    }
    if (participants < 2) throw new Error('Select at least two lottery teams.');
    if (total !== 10_000) throw new Error('Lottery odds must add up to exactly 100%.');
    return entries.map((entry) => ({ ...teams.find((team) => team.id === entry.id)!, odds: entry.odds }));
}

// The ticket is drawn on the server with crypto.randomInt(10_000), never by a viewer.
export function pickWinner(entries: LotteryEntry[], ticket: number) {
    if (!Number.isInteger(ticket) || ticket < 0 || ticket >= 10_000) throw new Error('Invalid lottery ticket.');
    let cumulative = 0;
    for (const team of entries) {
        cumulative += Math.round((team.odds ?? 0) * 100);
        if (ticket < cumulative) return team.id;
    }
    throw new Error('Invalid lottery odds.');
}

export function draftOrder(entries: LotteryEntry[], winnerId: number) {
    const winner = entries.find((team) => team.id === winnerId && team.odds !== null);
    if (!winner) throw new Error('The winner must be a lottery participant.');
    return [winner, ...entries.filter((team) => team.id !== winnerId)];
}

// Promoting a winner can only change positions through the last lottery participant.
// With the default setup this is picks 1–4; every position below that is already known.
export const lotteryPickCount = (entries: LotteryEntry[]) =>
    entries.reduce((count, entry, index) => entry.odds !== null ? index + 1 : count, 0);

export const finalRevealAt = (startsAt: string, entries: LotteryEntry[]) =>
    new Date(startsAt).getTime() + INTRO_MS + Math.max(0, lotteryPickCount(entries) - 2) * REVEAL_MS;

export function publicLottery(record: LotteryRecord, now: number): PublicLottery {
    const start = new Date(record.startsAt).getTime();
    const pickCount = lotteryPickCount(record.entries);
    const finale = finalRevealAt(record.startsAt, record.entries);
    const ends = finale + FINALE_MS;
    const complete = now >= ends && record.winnerId !== null;
    const revealed: PublicLottery['revealed'] = [];
    let nextRevealAt: number | null = now < start + INTRO_MS ? start + INTRO_MS : null;
    if (record.winnerId !== null && now >= start) {
        draftOrder(record.entries, record.winnerId).forEach((team, index) => {
            // Reveal the final two together to preserve the first-pick announcement.
            const at = index >= pickCount ? start : index < 2 ? finale : start + INTRO_MS + (pickCount - index - 1) * REVEAL_MS;
            if (now >= at) revealed.push({ pick: index + 1, team });
            else nextRevealAt = nextRevealAt === null ? at : Math.min(nextRevealAt, at);
        });
    }
    return {
        id: record.id, title: record.title, startsAt: new Date(start).toISOString(),
        endsAt: new Date(ends).toISOString(), entries: record.entries,
        phase: now < start ? 'scheduled' : complete ? 'complete' : 'live',
        revealed, winnerId: now >= finale && now >= start ? record.winnerId : null,
        nextRevealAt: nextRevealAt === null ? null : new Date(nextRevealAt).toISOString(),
    };
}

export const navVisible = (lottery: Pick<PublicLottery, 'startsAt'>, now: number) =>
    now >= new Date(lottery.startsAt).getTime() - NAV_WINDOW_MS;
