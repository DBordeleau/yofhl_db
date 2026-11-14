'use client';

// What the Fantrax and Season sync panels on /admin share: running a server action, its result, the button and
// the times they show.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type AdminActionResult = { message: string } | { error: string };

export const ADMIN_BUTTON = 'min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-[#232C4A] disabled:cursor-wait disabled:opacity-50';

const easternFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** a time in Eastern, as the admin panels show it */
export const easternTime = (value: string) => `${easternFormat.format(new Date(value))} ET`;

/**
 * Runs an admin server action in a transition and keeps its result. The page refreshes after a success, or after
 * any result with `refreshAfterError` (an action that records its failure on the page).
 */
export function useAdminAction({ refreshAfterError = false } = {}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<AdminActionResult | null>(null);
    const run = (action: () => Promise<AdminActionResult>) => {
        setResult(null);
        startTransition(async () => {
            try {
                const value = await action();
                setResult(value);
                if (refreshAfterError || 'message' in value) router.refresh();
            } catch {
                setResult({ error: 'The request failed. Reload the page and try again.' });
            }
        });
    };
    return { pending, result, run, clearResult: () => setResult(null) };
}

/** the action's progress, then its result, announced politely */
export function AdminActionStatus({ pending, pendingText, result }: { pending: boolean; pendingText: string; result: AdminActionResult | null }) {
    return <div className="mt-3 text-sm" aria-live="polite">{pending ? pendingText : result && ('error' in result ? <p role="alert" className="text-rink-red">{result.error}</p> : <p>{result.message}</p>)}</div>;
}
