'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TeamBadge from '@/components/team-badge';
import { allBackgroundStyles, backgroundStyles, signatureStyles, suggestedPalettes, fallbackColours, isHexColour, type TeamColours } from '@/lib/team-branding';
import { saveTeamBranding } from '@/app/owner/actions';
import TeamBranding from './team-branding';
import styles from './branding.module.css';

export interface BrandingTeam { id: number; name: string; logo: string | null; abbreviation: string; version: number; branding: TeamColours | null }

const presets = [
    { name: 'Crimson & gold', primary: '#A71930', secondary: '#E6B85C', tertiary: '#F7F0DA' },
    { name: 'Royal & ice', primary: '#1556A0', secondary: '#BEDDF4', tertiary: '#F1C75B' },
    { name: 'Forest & cream', primary: '#21614C', secondary: '#EAD9AB', tertiary: '#D76A4A' },
    { name: 'Purple & gold', primary: '#55328A', secondary: '#DAC456', tertiary: '#EAE3F2' },
    { name: 'Black & orange', primary: '#242832', secondary: '#F28C38', tertiary: '#E6E8EF' },
];

const teamPaletteNames: Record<number, string> = { 3: 'Honkers logo', 5: 'Jagrtown sunrise', 9: 'Reapers logo' };

export default function TeamColourEditor({ team }: { team: BrandingTeam }) {
    const [savedMessage, setSavedMessage] = useState('');
    const saved = team.branding ?? suggestedPalettes[team.id] ?? fallbackColours;
    return <><ColourForm key={`${team.id}-${team.version}`} team={team} saved={saved} onSaved={() => setSavedMessage('Team branding saved. Your new colours and style are now live across the site.')} onEdit={() => setSavedMessage('')} />
        {savedMessage && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">{savedMessage}</p>}</>;
}

function ColourForm({ team, saved, onSaved, onEdit }: { team: BrandingTeam; saved: TeamColours; onSaved: () => void; onEdit: () => void }) {
    const router = useRouter();
    const id = useId();
    const [draft, setDraft] = useState(saved);
    const [hex, setHex] = useState({ primary: saved.primary, secondary: saved.secondary, tertiary: saved.tertiary });
    const [busy, setBusy] = useState(false);
    const [refreshing, startRefresh] = useTransition();
    const saving = busy || refreshing;
    const [error, setError] = useState('');
    const valid = isHexColour(hex.primary) && isHexColour(hex.secondary) && isHexColour(hex.tertiary);
    const dirty = !team.branding || draft.primary !== saved.primary || draft.secondary !== saved.secondary || draft.tertiary !== saved.tertiary || draft.treatment !== saved.treatment || !valid;
    const teamSignatures = signatureStyles.filter(option => (option.teamIds as readonly number[]).includes(team.id));
    const teamPresetName = teamPaletteNames[team.id];
    const availablePresets = teamPresetName ? [{ name: teamPresetName, ...suggestedPalettes[team.id] }, ...presets] : presets;

    function styleOption(option: typeof allBackgroundStyles[number], signature = false) {
        return <label key={option.value} className={`${styles.styleChoice} ${signature ? styles.signatureChoice : ''}`}>
            <TeamBranding colours={{ ...draft, treatment: option.value }} data-brand-part="surface" className={styles.stylePreview} aria-hidden="true"><span className={styles.stylePreviewBadge} /><span className={styles.stylePreviewLines} /></TeamBranding>
            <span className="block p-3 sm:p-4"><span className="flex items-center gap-2 text-sm font-bold"><input type="radio" name={`${id}-treatment`} value={option.value} checked={draft.treatment === option.value} onChange={() => { setDraft(previous => ({ ...previous, treatment: option.value })); onEdit(); }} className="accent-[#267AC6]" />{option.label}</span><span className="mt-2 block text-xs leading-relaxed text-ink-muted">{option.description}</span>{'tertiaryFocus' in option && <span aria-hidden="true" className="mt-3 inline-block rounded-full bg-ice px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-soft">Made for 3 colours</span>}</span>
        </label>;
    }

    function colourChange(key: 'primary' | 'secondary' | 'tertiary', value: string) {
        setHex(previous => ({ ...previous, [key]: value }));
        if (isHexColour(value)) setDraft(previous => ({ ...previous, [key]: value.toUpperCase() }));
        setError('');
        onEdit();
    }

    function applyPreset(preset: typeof presets[number]) {
        setDraft(previous => ({ ...previous, primary: preset.primary, secondary: preset.secondary, tertiary: preset.tertiary }));
        setHex({ primary: preset.primary, secondary: preset.secondary, tertiary: preset.tertiary });
        setError('');
        onEdit();
    }

    async function saveColours(event: React.FormEvent) {
        event.preventDefault();
        if (!valid || saving || !dirty) return;
        setBusy(true); setError(''); onEdit();
        try {
            const result = await saveTeamBranding(team.id, team.version, draft);
            if (result.error) setError(result.error);
            else { onSaved(); startRefresh(() => router.refresh()); }
        } catch { setError('Could not save your branding. Please try again.'); }
        finally { setBusy(false); }
    }

    return <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card" aria-label={`${team.name} colour editor`}>
        <TeamBranding colours={draft}>
            <div className={styles.preview} data-brand-part="surface">
                <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={80} ring="none" />
                <div className="min-w-0"><div className={styles.previewLabel}>Live team preview</div><h3 className="font-wide">{team.name}</h3><p>{team.abbreviation} · Ye Olde Fantasy Hockey League</p></div>
            </div>
            <div data-brand-part="stripes" className="h-3.5" />
        </TeamBranding>
        <form onSubmit={saveColours} className="space-y-6 p-5 sm:p-7">
            <fieldset disabled={saving} className="min-w-0 space-y-6">
            {teamSignatures.length > 0 && <fieldset><legend className="mb-2 text-sm font-bold">Team signature</legend><p className="mb-3 text-xs leading-relaxed text-ink-muted">Made for {team.name}. Try it with your own three colours, or choose a league style below.</p>{teamSignatures.map(option => styleOption(option, true))}</fieldset>}
            <div><h2 className="font-wide text-xl font-extrabold">Team colours</h2><p className="mt-2 text-sm leading-relaxed text-ink-soft">Primary leads the design. Secondary adds the bands and colour contrast. Tertiary finishes it with fine lines and a narrow accent trim.</p></div>
            <div className="grid gap-4 sm:grid-cols-3">
                {(['primary', 'secondary', 'tertiary'] as const).map(key => <div key={key}>
                    <label htmlFor={`${id}-${key}-hex`} className="mb-2 block text-sm font-bold capitalize">{key} {key === 'tertiary' ? 'accent' : 'colour'}</label>
                    <div className={styles.colourField}>
                        <input type="color" aria-label={`Choose ${key} colour`} value={draft[key]} onChange={event => colourChange(key, event.target.value)} />
                        <input id={`${id}-${key}-hex`} type="text" aria-label={`${key[0].toUpperCase()}${key.slice(1)} colour hex`} aria-invalid={!isHexColour(hex[key])} aria-describedby={!isHexColour(hex[key]) ? `${id}-hex-help` : undefined} value={hex[key]} maxLength={7} spellCheck={false} onChange={event => colourChange(key, event.target.value)} />
                    </div>
                </div>)}
            </div>
            {!valid && <p id={`${id}-hex-help`} role="alert" className="text-sm text-red-700">Use a six-digit hex colour, such as #A71930.</p>}
            <fieldset><legend className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-muted">Try a palette</legend><div className="flex flex-wrap gap-2">
                {availablePresets.map(preset => <button key={preset.name} type="button" onClick={() => applyPreset(preset)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-xs font-semibold hover:bg-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue"><span aria-hidden="true" className="flex overflow-hidden rounded-full border border-black/10"><span className="h-4 w-2" style={{ background: preset.primary }} /><span className="h-4 w-2" style={{ background: preset.secondary }} /><span className="h-4 w-1" style={{ background: preset.tertiary }} /></span>{preset.name}</button>)}
            </div></fieldset>
            <fieldset><legend className="mb-3 text-sm font-bold">League styles</legend><div className="grid grid-cols-2 gap-3">
                {backgroundStyles.map(option => styleOption(option))}
            </div></fieldset>
            <p className="text-xs leading-relaxed text-ink-muted">Artwork and trim use your chosen colours. A soft shade behind the text keeps names readable while the artwork stays bright.</p>
            <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
                <button type="submit" disabled={!valid || !dirty || saving} className="min-h-12 rounded-xl bg-ink px-5 text-sm font-bold text-white hover:bg-[#26365F] disabled:opacity-40">{saving ? 'Saving…' : 'Save branding'}</button>
                <button type="button" disabled={!dirty} onClick={() => { setDraft(saved); setHex({ primary: saved.primary, secondary: saved.secondary, tertiary: saved.tertiary }); setError(''); onEdit(); }} className="min-h-11 px-2 text-sm font-semibold text-ink-muted hover:underline disabled:opacity-40">Discard changes</button>
                <span className="text-xs text-ink-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">Saved branding appears throughout the league site. Your team name and logo are managed separately.</p>
            </fieldset>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </form>
    </section>;
}
