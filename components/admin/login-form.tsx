'use client';

import { FC, FormEvent, useState, useTransition } from 'react';
import { login } from '@/app/admin/actions';

const LoginForm: FC<{ next: string; configured: boolean }> = ({ next, configured }) => {
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
            const result = await login(data);
            if (result?.error) setError(result.error);
        });
    };

    const field = 'h-12 w-full rounded-2xl border border-line-strong bg-white px-4 text-[15px] text-ink outline-none focus:border-rink-blue focus:shadow-[0_0_0_3px_rgba(31,111,194,.15)]';

    return (
        <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-line bg-white p-6 shadow-card md:p-8">
            <h1 className="font-wide text-2xl font-extrabold uppercase">Admin</h1>
            {!configured ? (
                <p className="mt-4 text-sm text-ink-soft">
                    Sign-in isn&apos;t set up. Add <code className="font-bold">ADMIN_USERNAME</code> and <code className="font-bold">ADMIN_PASSWORD</code> to the environment and restart the server.
                </p>
            ) : (
                <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                    <input type="hidden" name="next" value={next} />
                    <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-soft">
                        Username
                        <input name="username" autoComplete="username" required className={field} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-bold text-ink-soft">
                        Password
                        <input name="password" type="password" autoComplete="current-password" required className={field} />
                    </label>
                    {error && <p className="rounded-xl bg-award-multi px-3 py-2 text-sm font-semibold text-rink-red" role="alert">{error}</p>}
                    <button type="submit" disabled={pending} className="mt-1 min-h-12 rounded-2xl bg-ink font-bold text-white transition-colors hover:bg-[#232C4A] disabled:opacity-60">
                        {pending ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default LoginForm;
