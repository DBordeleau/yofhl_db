'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOutOwner } from '@/app/owner/actions';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';

export default function SignOutButton() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function signOut() {
        setBusy(true); setError('');
        try {
            await signOutOwner();
            refreshOwnerNavigation();
            router.refresh();
        } catch { setError('Could not sign out. Please try again.'); }
        finally { setBusy(false); }
    }
    return <div><button type="button" onClick={signOut} disabled={busy} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-bold disabled:opacity-50">{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}</div>;
}
