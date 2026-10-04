'use client';

import { useEffect, useState } from 'react';
import TeamBadge from '@/components/team-badge';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';
import { CALDER_SEASON, CALDER_SEASON_LABEL, KEEPER_LIMITS, KEEPER_TOTAL_LIMIT, KEEPER_DEADLINE_LABEL, KEEPER_SEASON_LABEL, POSITION_LABELS, isMinor, refreshedSelection, currentRookieReview, keeperPosition, rosterFingerprint, validateKeepers, submissionStatus, remainingKeeperAllowance,
    type KeeperPlayer, type KeeperSubmission, type KeeperInput, type KeeperSaveResult, type KeeperPosition } from '@/lib/keepers/model';
import { useKeeperDeadline } from './use-deadline';
import styles from './keepers.module.css';
import PlayerStats from './player-stats';
import UnusedAllowanceDialog from './unused-allowance-dialog';
import RosterRefresh from './roster-refresh';
import type { refreshKeeperRoster } from '@/app/owner/keepers/actions';

interface Props {
    team: { name: string; logo: string | null; abbreviation: string };
    roster: KeeperPlayer[]; initialSubmission: KeeperSubmission | null; serverNow: string;
    saveAction: (input: KeeperInput) => Promise<KeeperSaveResult>;
    fetchedAt: string;
    fantraxUrl: string;
    refreshAction: typeof refreshKeeperRoster;
}
const submittedTime = (time: string) => new Date(time).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function KeeperEditor({ team, roster: initialRoster, initialSubmission, serverNow, fetchedAt: initialFetchedAt, fantraxUrl, saveAction, refreshAction }: Props) {
    const [saved, setSaved] = useState(initialSubmission);
    const [liveRoster, setLiveRoster] = useState(initialRoster);
    const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
    const [clock, setClock] = useState(serverNow);
    const closed = useKeeperDeadline(clock);
    const roster = closed && saved ? saved.roster : liveRoster;
    const [keptIds, setKeptIds] = useState(() => initialSubmission?.keptIds.filter(id => roster.some(p => p.id === id)) ?? []);
    const [rookieId, setRookieId] = useState<string | null>(() => roster.some(p => p.id === initialSubmission?.rookieId && !isMinor(p)) ? initialSubmission!.rookieId : null);
    const [declared, setDeclared] = useState(Boolean(initialSubmission?.rookieDeclared && initialSubmission.rookieSeason === CALDER_SEASON));
    const [busy, setBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMessage, setRefreshMessage] = useState('');
    const [refreshError, setRefreshError] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [confirmUnused, setConfirmUnused] = useState(false);
    useEffect(() => {
        if (!closed) return;
        setKeptIds(saved?.keptIds ?? []);
        setRookieId(saved?.rookieId ?? null);
        setDeclared(saved?.rookieDeclared ?? false);
        setRefreshMessage(''); setRefreshError('');
        setMessage(''); setError('');
        setConfirmUnused(false);
    }, [closed, saved]);
    const selection = { keptIds, rookieId, rookieDeclared: declared, rookieSeason: rookieId ? CALDER_SEASON : null };
    const validation = validateKeepers(roster, selection, saved?.rookieReviews);
    const remaining = remainingKeeperAllowance(validation, rookieId);
    const kept = new Set(validation.keptIds);
    const dirty = !saved || JSON.stringify([...validation.keptIds].sort()) !== JSON.stringify([...saved.keptIds].sort()) || rookieId !== saved.rookieId || declared !== saved.rookieDeclared || selection.rookieSeason !== (saved.rookieSeason ?? null) || rosterFingerprint(roster) !== rosterFingerprint(saved.roster);
    const status = submissionStatus(saved, roster);
    const review = rookieId ? currentRookieReview(saved?.rookieReviews[rookieId]) : null;
    const disabled = closed || busy || refreshing;

    function toggle(player: KeeperPlayer) {
        setError(''); setMessage('');
        setKeptIds(ids => kept.has(player.id) ? ids.filter(id => id !== player.id) : [...ids, player.id]);
        if (rookieId === player.id) { setRookieId(null); setDeclared(false); }
    }
    function chooseRookie(id: string) {
        setRookieId(id || null); setDeclared(false); setMessage(''); setError('');
        if (id) setKeptIds(ids => ids.includes(id) ? ids : [...ids, id]);
    }
    async function refresh() {
        if (disabled) return;
        setRefreshing(true); setRefreshMessage(''); setRefreshError(''); setMessage(''); setError('');
        try {
            const result = await refreshAction();
            if (result.error) { setRefreshError(result.error); return; }
            if (!result.roster) return;
            const next = refreshedSelection(result.roster, { ...selection, keptIds: validation.keptIds });
            const removed = roster.filter(player => kept.has(player.id) && !result.roster.some(current => current.id === player.id));
            setLiveRoster(result.roster); setFetchedAt(result.fetchedAt); setClock(result.serverNow);
            setKeptIds(next.keptIds); setRookieId(next.rookieId); setDeclared(next.rookieDeclared);
            setRefreshMessage(`Roster refreshed. Your keeper choices have been preserved. Review and submit any changes.${removed.length ? ` No longer on this roster: ${removed.map(player => player.name).join(', ')}.` : ''}${rookieId && !next.rookieId ? ' The free rookie selection was cleared because the player moved to the minors or left the roster.' : ''}`);
        } catch { setRefreshError('Could not refresh from Fantrax. Your selections are unchanged. Please try again.'); }
        finally { setRefreshing(false); }
    }
    function submit(event: React.FormEvent) {
        event.preventDefault();
        if (disabled || !validation.valid) return;
        if (remaining.regular > 0 || remaining.rookie) {
            setConfirmUnused(true);
            return;
        }
        void saveSelection();
    }
    async function saveSelection() {
        if (disabled || !validation.valid) return;
        setConfirmUnused(false);
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await saveAction({ ...selection, rosterFingerprint: rosterFingerprint(roster), version: saved?.version ?? 0 });
            if (result.error) setError(result.error);
            else if (result.submission) {
                setSaved(result.submission); setKeptIds(result.submission.keptIds);
                setLiveRoster(result.submission.roster);
                setDeclared(result.submission.rookieDeclared);
                setRefreshMessage(''); setRefreshError('');
                setMessage('Your keeper list has been submitted. You can update it until the deadline.');
                refreshOwnerNavigation();
            }
        } catch { setError('Could not confirm the submission. Reload to check its status before trying again.'); }
        finally { setBusy(false); }
    }

    return <div className={styles.editor}>
        {confirmUnused && !closed && <UnusedAllowanceDialog allowance={remaining} minorCount={validation.minorCount} onReview={() => setConfirmUnused(false)} onConfirm={() => { void saveSelection(); }} />}
        <header className={styles.hero}>
            <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={72} ring="none" />
            <div><p className={styles.eyebrow}>{KEEPER_SEASON_LABEL} keepers</p><h1>{team.name}</h1><p className={styles.deadline}>{closed ? 'Submissions closed' : 'Submit by'} · {KEEPER_DEADLINE_LABEL}</p></div>
        </header>
        <div className={styles.statusBar}>
            <span className={status === 'submitted' ? styles.goodStatus : styles.attentionStatus}>{status === 'submitted' ? '✓ Submitted' : status === 'missing' ? 'Not submitted' : status === 'roster_changed' ? 'Roster changed · resubmit your list' : 'Correction needed'}</span>
            <span>{saved ? `Last submitted ${submittedTime(saved.submittedAt)} Eastern` : closed ? 'No keeper list was submitted.' : 'Selections are saved when you submit.'}</span>
        </div>
        {closed && <p className={styles.notice}>{saved ? 'The deadline has passed. Your submitted list is read-only.' : 'The deadline has passed. No keeper list was submitted for your team.'}</p>}
        {!closed && <RosterRefresh minorCount={validation.minorCount} fantraxUrl={fantraxUrl} checkedAt={submittedTime(fetchedAt)} disabled={disabled} refreshing={refreshing} error={refreshError} message={refreshMessage} onRefresh={refresh} />}
        {(!closed || saved) && <><div className={styles.mobileCounts} aria-label="Keeper allowances" aria-live="polite"><span className={`${styles.mobileTotal} ${validation.regularCount > KEEPER_TOTAL_LIMIT ? styles.overLimit : ''}`}><b>Regular keepers · includes goalies</b><strong>{validation.regularCount}/{KEEPER_TOTAL_LIMIT}</strong></span>{(['F', 'D', 'G'] as const).map(position => <span key={position} className={validation.counts[position] > KEEPER_LIMITS[position] ? styles.overLimit : ''}><b>{POSITION_LABELS[position]}</b> {validation.counts[position]}/{KEEPER_LIMITS[position]}</span>)}<span><b>Free rookie</b> {rookieId ? '1' : '0'}/1</span></div>
        <form onSubmit={submit} className={styles.form}>
            <div className={styles.roster}>
                <div className={styles.rosterHeading}><h2>{closed ? 'Submitted keepers' : 'Choose your keepers'}</h2><p>Keep up to {KEEPER_TOTAL_LIMIT} regular players, including goalies. Minors and the free rookie are extra.</p><p>Checked players stay. Unchecked players are not kept.</p><p>Stats are from the 2025–2026 regular season.</p></div>
                {(['F', 'D', 'G', 'OTHER'] as KeeperPosition[]).map(position => {
                    const players = roster.filter(player => !isMinor(player) && keeperPosition(player) === position);
                    if (!players.length) return null;
                    return <fieldset key={position} className={styles.positionGroup} disabled={disabled}>
                        <legend>{POSITION_LABELS[position]} <span>{position === 'OTHER' ? 'Position review required' : `Up to ${KEEPER_LIMITS[position]}`}</span></legend>
                        {players.map(player => <label key={player.id} className={`${styles.player} ${kept.has(player.id) ? styles.kept : ''}`}>
                            <input type="checkbox" checked={kept.has(player.id)} onChange={() => toggle(player)} aria-label={`Keep ${player.name}`} />
                            <span className={styles.playerName}>{player.name}<small>{player.position.replaceAll(',', '/')} · {player.nhlTeam === '(N/A)' ? 'FA' : player.nhlTeam} · Age {player.details?.age ?? '—'}{player.status === 'INJURED_RESERVE' && <b className={styles.ir}>IR</b>}</small><PlayerStats player={player} /></span>
                            <span className={rookieId === player.id ? styles.rookieTag : styles.choice}>{rookieId === player.id ? 'Free rookie' : kept.has(player.id) ? 'Kept' : 'Not kept'}</span>
                        </label>)}
                    </fieldset>;
                })}
                <section className={styles.minors} aria-labelledby="minor-keepers-heading">
                    <h3 id="minor-keepers-heading">Minor bench <span>All kept · free</span></h3>
                    <p>To make a change to your minor bench configuration, make the roster change in Fantrax and then refresh this keeper form.</p>
                    {roster.filter(isMinor).map(player => <div className={styles.minorPlayer} key={player.id}><span aria-hidden="true">✓</span><div><strong>{player.name}</strong><small>{player.position.replaceAll(',', '/')} · {player.nhlTeam === '(N/A)' ? 'FA' : player.nhlTeam} · Age {player.details?.age ?? '—'}</small><PlayerStats player={player} /></div><span className={styles.choice}>Kept</span></div>)}
                    {!roster.some(isMinor) && <p>No players on the minor bench.</p>}
                    {!closed && <><div className={styles.refreshActions}><button type="button" disabled={disabled} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh from Fantrax'}</button><small>Roster last checked {submittedTime(fetchedAt)} Eastern</small></div>
                        {refreshError && <p className={styles.refreshError}>{refreshError}</p>}
                        {refreshMessage && <p className={styles.refreshMessage}>{refreshMessage}</p>}</>}
                </section>
            </div>
            <aside className={styles.summary} aria-label="Keeper selection summary">
                <div className={styles.allowances} aria-live="polite">
                    <h2>Keeper allowance</h2>
                    <div className={`${styles.regularTotal} ${validation.regularCount > KEEPER_TOTAL_LIMIT ? styles.overLimit : ''}`}><span>Regular keepers</span><strong>{validation.regularCount} <small>/ {KEEPER_TOTAL_LIMIT}</small></strong></div>
                    <p className={styles.allowanceNote}>Includes goalies. Minors and the free rookie do not count.</p>
                    {(['F', 'D', 'G'] as const).map(position => <div key={position} className={validation.counts[position] > KEEPER_LIMITS[position] ? styles.overLimit : ''}><span>{POSITION_LABELS[position]}</span><strong>{validation.counts[position]} <small>/ {KEEPER_LIMITS[position]}</small></strong></div>)}
                    <div className={styles.freeCount}><span>Minor bench</span><strong>{validation.minorCount} <small>free</small></strong></div>
                    <div className={styles.freeCount}><span>Free rookie</span><strong>{rookieId ? '1' : '0'} <small>/ 1</small></strong></div>
                </div>
                <fieldset disabled={disabled} className={styles.rookie}>
                    <legend>Free rookie keeper</legend>
                    <p>One player who was eligible for the <strong>{CALDER_SEASON_LABEL} Calder Memorial Trophy</strong> can be kept outside the {KEEPER_TOTAL_LIMIT}-player and position limits. Optional; subject to admin review.</p>
                    <label htmlFor="free-rookie" className="sr-only">Free rookie keeper</label>
                    <select id="free-rookie" value={rookieId ?? ''} onChange={event => chooseRookie(event.target.value)}>
                        <option value="">No free rookie</option>
                        {roster.filter(player => !isMinor(player)).map(player => <option value={player.id} key={player.id} disabled={currentRookieReview(saved?.rookieReviews[player.id])?.status === 'rejected'}>{player.name}{currentRookieReview(saved?.rookieReviews[player.id])?.status === 'rejected' ? ' — not eligible' : ''}</option>)}
                    </select>
                    {rookieId && <><label className={styles.declaration}><input type="checkbox" checked={declared} onChange={event => { setDeclared(event.target.checked); setMessage(''); }} />I confirm this player was eligible for the {CALDER_SEASON_LABEL} Calder Memorial Trophy.</label>
                        <p className={review?.status === 'rejected' ? styles.reviewRejected : styles.reviewStatus}>{review?.status === 'approved' ? '✓ Rookie eligibility approved' : review?.status === 'rejected' ? 'Rookie declaration rejected' : 'Owner declaration · admin review pending'}{review?.note && <span>{review.note}</span>}</p></>}
                </fieldset>
                <div className={styles.submitPanel}>
                    <div className={styles.totals} aria-live="polite"><span><strong>{kept.size}</strong> kept</span><span><strong>{roster.length - kept.size}</strong> not kept</span></div>
                    {validation.errors.length > 0 && <ul className={styles.errors}>{validation.errors.map(item => <li key={item}>{item}</li>)}</ul>}
                    {!closed && <><button type="submit" disabled={disabled || !validation.valid || (!dirty && status === 'submitted')} className={styles.submit}>{busy ? 'Submitting…' : saved ? 'Update submission' : 'Submit keepers'}</button><p>{dirty && saved ? 'You have unsubmitted changes.' : 'You can revise your list until the deadline.'}</p></>}
                    <p className={styles.manualNote}>The admin will use your submitted list to update Fantrax.</p>
                    {error && <p role="alert" className={styles.errors}>{error}</p>}
                    {message && <p role="status" className={styles.success}>{message}</p>}
                </div>
            </aside>
        </form></>}
    </div>;
}
