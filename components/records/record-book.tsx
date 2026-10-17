'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'framer-motion';
import TeamBadge from '@/components/team-badge';
import SeasonLinks from '@/components/season-links';
import { TrophyArt } from '@/components/trophy-icons';
import { getAwardDefinition } from '@/lib/awards';
import { PLAYER_STATS } from '@/lib/records/player-stats';
import { ChaseHero, number } from './chases';
import GoldDust from './gold-dust';
import type { getRecordBook } from '@/lib/records/data';
import type { Category, Entry, RecordList } from '@/lib/records/model';
import { seasonLabel } from '@/lib/league';
import styles from './records.module.css';

type Book = Awaited<ReturnType<typeof getRecordBook>>;
const categories: { id: Category; name: string }[] = [
    { id: 'teams', name: 'Teams' }, { id: 'players', name: 'Players' },
    { id: 'matchups', name: 'Matchups' }, { id: 'honours', name: 'Honours' },
];
const singular: Record<string, string> = { wins: 'win', cups: 'cup', finals: 'final', seasons: 'season', trophies: 'trophy' };
const ease = [.16, 1, .3, 1] as const;

function HolderMark({ entry, teams, size = 40 }: { entry: Entry; teams: Book['teams']; size?: number }) {
    const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
    if (entry.href.startsWith('/player/')) {
        return entry.portrait && entry.portrait !== failedPortrait
            ? <Image src={entry.portrait} alt="" width={size} height={size} className={styles.playerPortrait} unoptimized onError={() => setFailedPortrait(entry.portrait!)} />
            : null;
    }
    const team = teams.find(t => t.ID === entry.team);
    return team ? <TeamBadge logo={entry.logo ?? team.LogoUrl} abbreviation={entry.abbreviation ?? team.Abbreviation} teamName={entry.name} size={size} ring="none" />
        : null;
}

function RecordStandings({ record, teams, scoped }: { record: RecordList; teams: Book['teams']; scoped: boolean }) {
    const reducedMotion = useReducedMotion();
    const first = record.entries[0];
    if (!first) return <div className={styles.empty}><h2 id="selected-record-heading">{record.title}</h2><p>No results for this selection.</p></div>;
    const holders = record.entries.filter(e => e.rank === 1);
    const values = record.entries.map(e => e.value);
    const max = Math.max(...values), min = Math.min(...values);
    // Small whole-number counts read better as pips than as bars.
    const pips = record.unit !== '%' && max <= 12 && values.every(Number.isInteger);
    // Ranked values sit close together, so the track starts below the lowest one rather than at zero.
    const floor = max === min ? 0 : Math.max(0, min - (max - min) * .6);
    const people = record.category === 'players' || record.id.startsWith('award-');
    const trophy = getAwardDefinition(record.id === 'cups' || record.id === 'repeat-cups' ? 'Jagr Cup' : record.id === 'scoring-titles' ? "Prime Minister's Trophy" : record.title);
    const gold = record.unit === 'cups' || record.unit === 'trophies' || record.id.startsWith('award-');
    const delay = (index: number) => reducedMotion ? 0 : Math.min(index, 12) * .028;
    return <>
        <div className={styles.recordHero}>
            <div className={styles.recordHeroCopy}>
                <span className={styles.recordKicker}>{scoped ? 'Franchise best' : holders.length > 1 ? 'Record holders' : 'Record holder'}{holders.length > 1 ? ` · ${holders.length} tied` : ''}</span>
                <h2 id="selected-record-heading">{record.title}</h2>
                {trophy ? <p className={styles.trophyHonor}>{trophy.honor}</p> : null}
                {holders.length > 1
                    // Shared records list every holder side by side; past four, the rest are counted.
                    ? <ul className={styles.recordHolders}>
                        {holders.slice(0, 4).map(holder => <li key={holder.id} className={styles.recordHolder}>
                            <HolderMark entry={holder} teams={teams} size={holders.length === 2 ? 60 : 48} />
                            <div><Link href={holder.href}>{holder.name}</Link><p><SeasonLinks text={holder.detail} /></p></div>
                        </li>)}
                        {holders.length > 4 ? <li className={styles.moreHolders}>+{holders.length - 4} more</li> : null}
                    </ul>
                    : <div className={styles.recordHolder}>
                        <HolderMark entry={first} teams={teams} size={76} />
                        <div><Link href={first.href}>{first.name}</Link><p><SeasonLinks text={first.detail} /></p></div>
                    </div>}
            </div>
            <div className={styles.recordHeroStat}>
                {trophy ? <motion.span className={styles.recordTrophy} initial={reducedMotion ? false : { opacity: 0, y: 18, rotate: -8, scale: .9 }} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} transition={{ duration: .8, ease: [.2, .7, .2, 1] }}>
                    <TrophyArt award={trophy.name} title={trophy.label} className={styles.recordTrophyArt} sizes="(max-width: 650px) 120px, 180px" />
                </motion.span> : null}
                <div className={styles.recordValue}>{number(first.value)}<span>{first.value === 1 ? singular[record.unit] ?? record.unit : record.unit}</span></div>
            </div>
        </div>
        <div className={`${styles.board} ${gold ? styles.goldBoard : ''}`}>
            <div className={styles.boardHead} aria-hidden="true"><span>#</span><span>{people ? 'Player' : 'Team'}</span><span className={styles.vizHead} /><span className={styles.right}>{record.unit}</span><span className={`${styles.right} ${styles.backHead}`}>Back</span></div>
            <ol className={styles.rows} aria-label={`${record.title} rankings`}>{record.entries.map((entry, index) => {
                const back = Math.round((first.value - entry.value) * 100) / 100;
                return <motion.li key={entry.id} className={`${styles.row} ${entry.rank === 1 ? styles.firstPlace : ''}`}
                    initial={reducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay: delay(index) }}>
                    <span className={styles.rank}>{String(entry.rank).padStart(2, '0')}</span>
                    <div className={styles.rankedName}><HolderMark entry={entry} teams={teams} /><span><Link href={entry.href}><b>{entry.name}</b></Link><small><SeasonLinks text={entry.detail} /></small></span></div>
                    <span className={styles.viz} aria-hidden="true">{pips
                        ? <span className={styles.pips}>{Array.from({ length: entry.value }, (_, pip) => <motion.span key={pip} className={styles.pip}
                            initial={reducedMotion ? false : { opacity: 0, y: 8, scale: .6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 22, delay: delay(index) + .12 + pip * .045 }} />)}</span>
                        : <span className={styles.track}><motion.span className={styles.trackFill} style={{ width: `${max > floor ? (entry.value - floor) / (max - floor) * 100 : 100}%` }}
                            initial={{ scaleX: reducedMotion ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: .6, ease, delay: delay(index) }} /></span>}
                    </span>
                    <strong className={styles.value}>{number(entry.value)}</strong>
                    <span className={styles.backGap}>{entry.rank === 1 ? '' : `−${number(back)}`}</span>
                </motion.li>;
            })}</ol>
        </div>
    </>;
}

export default function RecordBook({ book, team, position }: { book: Book; team?: number; position?: string }) {
    const router = useRouter();
    const search = useSearchParams();
    const [pending, startTransition] = useTransition();
    const reducedMotion = useReducedMotion();
    const category = categories.find(c => c.id === search.get('category'))?.id ?? 'teams';
    const records = book.records.filter(r => r.category === category);
    const record = records.find(r => r.id === search.get('record')) ?? records[0];
    const selectedTeam = book.teams.find(t => t.ID === team);

    function navigate(values: Record<string, string>, fetch = false) {
        const params = new URLSearchParams(search.toString());
        for (const [key, value] of Object.entries(values)) value ? params.set(key, value) : params.delete(key);
        const url = `/records${params.size ? `?${params}` : ''}`;
        // Category and metric changes use the rankings already on the page.
        if (fetch) startTransition(() => router.push(url, { scroll: false }));
        else window.history.pushState(null, '', url);
    }

    const title = <><p className={styles.brand}><span>YOFHL</span></p><h1 className={styles.title}>Record<span>book</span></h1></>;
    return <MotionConfig reducedMotion="user"><main className={styles.page}>
        <section className={styles.hero} aria-labelledby="chases-heading">
            <GoldDust />
            {book.liveYear ? <ChaseHero chases={book.chases} teams={book.teams} year={book.liveYear}>{title}</ChaseHero>
                : <div className={`${styles.wrap} ${styles.heroGrid}`}><div className={styles.heroTitle}>{title}</div><div className={styles.horizon}><h2 id="chases-heading" className={styles.horizonHeading}>On the horizon</h2><p className={styles.heroEmpty}>Current scoring is unavailable.</p></div></div>}
        </section>
        <section id="record-archive" className={`${styles.wrap} ${styles.archive}`} aria-label="League records">
            <div className={styles.archiveToolbar}>
                <nav aria-label="Record categories" className={styles.tabs}>{categories.map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => navigate({ category: c.id, record: '' })}>
                    {category === c.id ? <motion.span className={styles.activeTab} layoutId="record-category" transition={{ type: 'spring', stiffness: 460, damping: 38 }} /> : null}<span>{c.name}</span>
                </button>)}</nav>
                <div className={styles.filters}>
                    {category === 'players' ? <>
                        <label className={styles.select}><span>Stat</span><select disabled={pending} value={book.stat ?? ''} onChange={event => navigate({ stat: event.target.value, record: '', ...(event.target.value && position === 'G' ? { position: '' } : {}) }, true)}><option value="">FPts</option>{PLAYER_STATS.map(stat => <option key={stat.id} value={stat.id}>{stat.label}</option>)}</select></label>
                        <label className={styles.select}><span>Position</span><select disabled={pending} value={position ?? ''} onChange={event => navigate({ position: event.target.value }, true)}><option value="">All positions</option>{(book.stat ? ['C', 'LW', 'RW', 'D'] : ['C', 'LW', 'RW', 'D', 'G']).map(p => <option key={p}>{p}</option>)}</select></label>
                    </> : <label className={`${styles.select} ${styles.wideSelect}`}><span>Franchise</span><select disabled={pending} value={team ?? ''} onChange={event => navigate({ team: event.target.value }, true)}><option value="">All franchises</option>{[...book.teams].sort((a, b) => Number(a.defunct) - Number(b.defunct) || a.Team.localeCompare(b.Team)).map(t => <option key={t.ID} value={t.ID}>{t.Team}{t.defunct ? ' (defunct)' : ''}</option>)}</select></label>}
                    {category === 'matchups' ? <label className={styles.select}><span>Format</span><select disabled={pending} value={book.format} onChange={event => navigate({ format: event.target.value }, true)}>{book.formats.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label> : null}
                </div>
            </div>
            <div className={styles.explorer}>
                <aside className={styles.recordMenu}>
                    <p className={styles.archiveDate}>Through {seasonLabel(book.through)}</p>
                    <nav aria-label="Choose a record">{records.map((item, index) => <button type="button" key={item.id} aria-pressed={record?.id === item.id} onClick={() => navigate({ record: item.id })}>
                        <span className={styles.menuIndex}>{String(index + 1).padStart(2, '0')}</span><span>{item.title}</span>
                    </button>)}</nav>
                    {category === 'matchups' ? <p className={styles.scope}>Regular season</p> : null}
                </aside>
                <div className={styles.results} aria-busy={pending} aria-labelledby="selected-record-heading">
                    {pending ? <motion.div className={styles.loadingLine} initial={{ scaleX: 0 }} animate={{ scaleX: .9 }} transition={{ duration: 2, ease: 'easeOut' }} role="status"><span className="sr-only">Updating records</span></motion.div> : null}
                    <AnimatePresence mode="wait" initial={false}>
                        {record ? <motion.div key={`${record.id}-${team}-${position}-${book.format}`} initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: pending ? .45 : 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -5 }} transition={{ duration: reducedMotion ? 0 : .16 }}>
                            <RecordStandings record={record} teams={book.teams} scoped={!!selectedTeam && category !== 'players'} />
                        </motion.div> : <p className={styles.empty}>No records available.</p>}
                    </AnimatePresence>
                </div>
            </div>
        </section>
    </main></MotionConfig>;
}
