'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import { saveTeam, createTeamInvitation } from '@/app/owner/actions';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';

export interface EditableTeam {
    id: number; name: string; logo: string | null; abbreviation: string; version: number;
    defunct: boolean; ownerEmail?: string | null; claimed?: boolean; inviteExpiresAt?: string | null;
}

export default function TeamEditor({ team, admin = false }: { team: EditableTeam; admin?: boolean }) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [code, setCode] = useState('');

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setError(''); setMessage('');
        try {
            const result = await saveTeam(new FormData(event.currentTarget));
            if (result.error) setError(result.error);
            else { setMessage('Team updated.'); formRef.current?.reset(); refreshOwnerNavigation(); router.refresh(); }
        } catch { setError('Could not save. Reload the page and try again.'); }
        finally { setBusy(false); }
    }

    async function invite() {
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await createTeamInvitation(team.id);
            if (result.error) setError(result.error);
            else { setCode(result.code!); router.refresh(); }
        } catch { setError('Could not create an invitation. Please try again.'); }
        finally { setBusy(false); }
    }

    return <section className="rounded-3xl border border-line bg-white p-6 shadow-card">
        <div className="mb-6 flex items-center gap-4">
            <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={64} ring="none" />
            <div className="min-w-0"><h2 className="break-words font-wide text-xl font-extrabold">{team.name}</h2><Link href={`/teams/${team.id}`} className="mt-1 inline-block text-sm font-bold text-rink-blue hover:underline">View team →</Link></div>
        </div>
        {admin && <p className="mb-5 break-words rounded-xl bg-ice p-3 text-sm text-ink-soft">{team.defunct ? 'Defunct franchise' : team.claimed ? `Claimed by ${team.ownerEmail}` : 'Unclaimed'}</p>}
        <form ref={formRef} onSubmit={save} className="space-y-5">
            <input type="hidden" name="id" value={team.id} /><input type="hidden" name="version" value={team.version} />
            <label className="block text-sm font-bold">Team name<input key={`${team.id}-${team.version}`} name="name" required minLength={2} maxLength={60} defaultValue={team.name} className="mt-2 min-h-12 w-full rounded-xl border border-line-strong px-4 focus:outline-none focus:ring-2 focus:ring-rink-blue" /></label>
            <label className="block text-sm font-bold">Replace logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ice file:px-3 file:py-3 file:font-bold file:text-ink" /><span className="mt-2 block text-xs font-normal text-ink-soft">PNG, JPEG or WebP, up to 2 MB. Your current logo stays until you save a replacement.</span></label>
            <button disabled={busy} className="min-h-12 rounded-xl bg-ink px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Save team'}</button>
        </form>
        <Link href={admin ? `/admin/teams/${team.id}/branding` : '/owner/branding'} className="mt-6 flex min-h-16 items-center justify-between gap-4 rounded-xl border border-line bg-ice p-4 text-sm font-bold hover:border-rink-blue hover:text-rink-blue"><span>Brand studio<span className="mt-1 block text-xs font-normal text-ink-muted">Team colours, signature artwork and banner styles</span></span><span aria-hidden="true">→</span></Link>
        {admin && !team.claimed && !team.defunct && <div className="mt-6 border-t border-line pt-5">
            <button disabled={busy} type="button" onClick={invite} className="min-h-11 rounded-xl border border-line-strong px-4 text-sm font-bold text-rink-blue disabled:opacity-50">{team.inviteExpiresAt ? 'Replace invitation code' : 'Generate invitation code'}</button>
            <p className="mt-2 text-xs text-ink-soft">Codes expire after 14 days. Generating another invalidates the previous code.</p>
            {code && <div className="mt-3 rounded-xl bg-ice p-4"><label className="block text-sm font-bold">Copy this code for the owner<input readOnly value={code} onFocus={(event) => event.target.select()} className="mt-2 w-full rounded border border-line bg-white p-2 font-mono text-xs" /></label><p className="mt-2 text-xs text-ink-soft">Send it with the link to /owner. The code is only shown here once.</p></div>}
        </div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    </section>;
}
