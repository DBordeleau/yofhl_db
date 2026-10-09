'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { clientOwnerAuth } from '@/lib/owner/firebase-client';
import { claimTeam, signInOwner } from '@/app/owner/actions';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';
import { KEEPERS_ENABLED } from '@/lib/keepers/model';

const input = 'mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-ink focus:outline-none focus:ring-2 focus:ring-rink-blue';

export default function AccessForm({ initialEmail = '' }: { initialEmail?: string }) {
    const router = useRouter();
    const [mode, setMode] = useState<'sign-in' | 'claim' | 'reset'>('sign-in');
    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true); setError(''); setMessage('');
        try {
            const auth = await clientOwnerAuth();
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email.trim());
                setMessage('If an account exists for that email, a reset link is on its way. Check your spam folder too.');
                return;
            }
            let credential;
            if (mode === 'claim') {
                try { credential = await createUserWithEmailAndPassword(auth, email.trim(), password); }
                catch (cause) {
                    if ((cause as { code?: string }).code !== 'auth/email-already-in-use') throw cause;
                    credential = await signInWithEmailAndPassword(auth, email.trim(), password);
                }
            } else {
                credential = await signInWithEmailAndPassword(auth, email.trim(), password);
            }
            try {
                const token = await credential.user.getIdToken();
                if (mode === 'claim') {
                    const result = await claimTeam(token, code);
                    refreshOwnerNavigation();
                    if (result.error) { setError(`${result.error} Your account is ready; retry here with your invitation code and the same email and password.`); return; }
                } else {
                    await signInOwner(token);
                    refreshOwnerNavigation();
                }
                router.refresh();
            } finally { await signOut(auth); }
        } catch (cause) {
            const reason = (cause as { code?: string }).code;
            const errors: Record<string, string> = {
                'auth/invalid-credential': 'That email and password combination is incorrect.',
                'auth/wrong-password': 'That email and password combination is incorrect.',
                'auth/user-not-found': 'That email and password combination is incorrect.',
                'auth/weak-password': 'Choose a password with at least 12 characters.',
                'auth/password-does-not-meet-requirements': 'Choose a password with at least 12 characters.',
                'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
                'auth/network-request-failed': 'Could not connect. Check your connection and try again.',
            };
            if (mode === 'reset' && reason === 'auth/user-not-found') setMessage('If an account exists for that email, a reset link is on its way.');
            else setError(errors[reason ?? ''] ?? 'Could not complete this request. Please try again.');
        } finally { setBusy(false); }
    }

    return <section className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-6 shadow-card md:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-rink-red">Owners’ room</p>
        <h1 className="mt-2 font-wide text-3xl font-extrabold">{mode === 'reset' ? 'Reset your password' : mode === 'claim' ? 'Claim your team' : 'Sign in'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{mode === 'claim' ? 'Enter the code from your commissioner and create your owner account. If you already have an account, use its email and password.' : mode === 'reset' ? 'Enter the email you used to claim your owner account.' : KEEPERS_ENABLED ? 'Sign in to manage your team and submit your keepers.' : 'Sign in to manage your team.'}</p>
        {mode !== 'reset' && <div className="mt-6 flex gap-2" aria-label="Account options">
            {(['sign-in', 'claim'] as const).map((tab) => <button key={tab} type="button" disabled={busy} aria-pressed={mode === tab} onClick={() => { setMode(tab); setError(''); setMessage(''); }} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${mode === tab ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft'}`}>{tab === 'sign-in' ? 'Sign in' : 'Claim a team'}</button>)}
        </div>}
        <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block text-sm font-bold">Email<input className={input} type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {mode !== 'reset' && <label className="block text-sm font-bold">Password<input className={input} type="password" autoComplete={mode === 'claim' ? 'new-password' : 'current-password'} required minLength={mode === 'claim' ? 12 : undefined} maxLength={4096} value={password} onChange={(event) => setPassword(event.target.value)} />{mode === 'claim' && <span className="mt-1 block text-xs font-normal text-ink-soft">At least 12 characters.</span>}</label>}
            {mode === 'claim' && <label className="block text-sm font-bold">Invitation code<input className={`${input} font-mono text-sm`} autoComplete="off" spellCheck={false} required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></label>}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
            <button disabled={busy} className="min-h-12 w-full rounded-xl bg-ink px-4 font-bold text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'claim' ? 'Create account & claim team' : 'Sign in'}</button>
        </form>
        <button type="button" disabled={busy} className="mt-4 min-h-11 text-sm font-bold text-rink-blue hover:underline" onClick={() => { setMode(mode === 'reset' ? 'sign-in' : 'reset'); setError(''); setMessage(''); }}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button>
    </section>;
}
