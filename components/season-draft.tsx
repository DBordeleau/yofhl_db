'use client';

import DraftBoard from '@/components/draft-class/draft-board';
// Keep views synchronous so loading cannot collapse the page during tab changes or hash navigation.
import Hindsight from '@/components/draft-class/hindsight';
import Redraft from '@/components/draft-class/redraft';
import styles from '@/components/draft-class/draft-class.module.css';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { rankDraft, type DraftView } from '@/lib/draft/hindsight';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { seasonLabel } from '@/lib/league';

const VIEWS: [DraftView, string][] = [['board', 'Full board'], ['hindsight', 'Hindsight'], ['redraft', 'Redraft']];

// The redraft view paints a red "RE" onto the title: 'in' and 'out' play the wipe, 'on' and 'off' rest.
type TitlePhase = 'off' | 'in' | 'on' | 'out';

interface DraftProps { year: number; picks: SeasonDraftSelection[] }

// URL selections are client state so all season pages stay statically cached.
export default function SeasonDraft(props: DraftProps) {
    return <Suspense fallback={<DraftViews {...props} view="board" />}><DraftQuery {...props} /></Suspense>;
}

function DraftQuery(props: DraftProps) {
    const query = useSearchParams();
    const draft = query.get('draft');
    const view: DraftView = draft === 'redraft' ? 'redraft'
        : ['hindsight', 'steals', 'regrets'].includes(draft ?? '') ? 'hindsight' : 'board';
    const team = query.get('team');
    const initialTeam = team && props.picks.some(pick => String(pick.franchiseId) === team) ? team : undefined;
    const pick = query.get('pick');
    const initialPick = pick && /^\d{1,6}$/.test(pick) ? Number(pick) : undefined;
    return <DraftViews key={`${initialTeam}-${initialPick}`} {...props} view={view} initialTeam={initialTeam} initialPick={initialPick} />;
}

function DraftViews({ year, picks, view, initialTeam, initialPick }: DraftProps & {
    view: DraftView; initialTeam?: string; initialPick?: number;
}) {
    const [title, setTitle] = useState<TitlePhase>(view === 'redraft' ? 'on' : 'off');
    const ranked = useMemo(() => rankDraft(picks), [picks]);

    // Animate URL changes from either the tabs or browser history.
    useEffect(() => {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTitle(phase => view === 'redraft'
            ? (phase === 'on' || phase === 'in' ? phase : still ? 'on' : 'in')
            : (phase === 'off' || phase === 'out' ? phase : still ? 'off' : 'out'));
    }, [view]);

    function show(value: DraftView) {
        const url = new URL(window.location.href);
        url.searchParams.set('draft', value);
        window.history.replaceState(null, '', url);
    }

    return (
        <section id="draft-class" aria-labelledby="draft-class-title" className={`${styles.section} w-full scroll-mt-28 xl:scroll-mt-6`}>
            <div className={styles.header}>
                <h2 id="draft-class-title" className={`${styles.title} font-wide text-lg font-extrabold uppercase md:text-xl xl:text-2xl 3xl:text-3xl`} data-re={title}>
                    {title !== 'off' && <span className={styles.reSlot}><span className={styles.re}>Re</span></span>}
                    Draft class<span className={styles.season}>{seasonLabel(year)}</span>
                    {(title === 'in' || title === 'out') && <span aria-hidden="true" className={styles.paint}
                        onAnimationEnd={event => event.target === event.currentTarget && setTitle(phase => phase === 'in' ? 'on' : phase === 'out' ? 'off' : phase)} />}
                </h2>
                {picks.length > 0 && <nav aria-label="Draft views" className={styles.tabs}>
                    {VIEWS.map(([value, label]) => <button key={value} type="button" className={styles.tab} aria-pressed={view === value} onClick={() => show(value)}>{label}</button>)}
                </nav>}
            </div>
            {!picks.length ? (
                <p className={styles.empty}>Draft records are unavailable for {seasonLabel(year)}.</p>
            ) : view === 'hindsight' ? (
                <Hindsight year={year} picks={picks} ranked={ranked} initialPick={initialPick} />
            ) : view === 'redraft' ? (
                <Redraft picks={picks} ranked={ranked} />
            ) : (
                <DraftBoard picks={picks} ranked={ranked} initialTeam={initialTeam} />
            )}
        </section>
    );
}
