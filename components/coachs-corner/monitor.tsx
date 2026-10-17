'use client';

import { memo, useEffect, useRef } from 'react';
import type { Graphic } from '@/lib/coachs-corner/script';
import { findPlayer, findTeam, type StudioPlayer, type StudioTeam } from '@/lib/coachs-corner/teams';
import { seasonLabel } from '@/lib/league';
import styles from './coachs-corner.module.css';

// The desk monitor. Each graphic is a small broadcast package; teams named in the script pull their
// real logo and colours.

function Snow({ running }: { running: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        const g = canvas?.getContext('2d');
        if (!canvas || !g) return;
        const img = g.createImageData(canvas.width, canvas.height);
        let raf = 0;
        let last = 0;
        const draw = (now: number) => {
            if (now - last > 45) {
                last = now;
                for (let i = 0; i < img.data.length; i += 4) {
                    const v = Math.random() * 255;
                    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                    img.data[i + 3] = 255;
                }
                g.putImageData(img, 0, 0);
            }
            if (running) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [running]);
    return <canvas ref={ref} width={160} height={90} className={styles.snow} aria-hidden="true" />;
}

const Logo = ({ team, className }: { team: StudioTeam | null; className?: string }) =>
    team?.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={team.logo} alt="" className={`${styles.gLogo} ${className ?? ''}`} />
        : <span className={`${styles.gLogo} ${styles.gLogoBlank} ${className ?? ''}`}>{team?.abbreviation ?? ''}</span>;

const teamVars = (team: StudioTeam | null, prefix = '--team') => team
    ? { [`${prefix}`]: team.primary, [`${prefix}-2`]: team.secondary } as React.CSSProperties
    : undefined;

const Heart = ({ style }: { style?: React.CSSProperties }) => (
    <svg viewBox="0 0 24 22" className={styles.gHeart} style={style} aria-hidden="true">
        <path d="M12 21.5 10.3 20C4.2 14.6.5 11.3.5 6.9.5 3.4 3.3.7 6.7.7c2 0 3.9.9 5.3 2.4C13.4 1.6 15.3.7 17.3.7c3.4 0 6.2 2.7 6.2 6.2 0 4.4-3.7 7.7-9.8 13.1Z" />
    </svg>
);

// floating hearts at fixed, uneven offsets so none of them rise in step
const HEARTS = [[8, 0, 1.1], [22, 1.3, .7], [36, .5, .9], [61, 1.9, 1.2], [74, .8, .75], [88, 1.6, 1], [50, 2.6, .8], [14, 3.1, .95], [82, 3.4, .7]];

function Picture({ graphic, teams, players, running }: { graphic: Graphic; teams: StudioTeam[]; players: StudioPlayer[]; running: boolean }) {
    switch (graphic.type) {
        case 'off':
            return null;
        case 'static':
            return <Snow running={running} />;
        case 'bars':
            return (
                <div className={styles.gBars}>
                    <div className={styles.gBarsTop}>{['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].map(c => <i key={c} style={{ background: c }} />)}</div>
                    <div className={styles.gBarsBottom}>{['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'].map((c, i) => <i key={i} style={{ background: c }} />)}</div>
                    <span className={styles.gBarsIdent}>YOFHL</span>
                </div>
            );
        case 'logo':
            return (
                <div className={styles.gCard}>
                    <span className={styles.gSlab}>Coach&rsquo;s Corner</span>
                    <span className={styles.gStripes} />
                </div>
            );
        case 'title':
            return (
                <div className={styles.gCard}>
                    <b className={styles.gTitle}>{graphic.title}</b>
                    {graphic.sub && <span className={styles.gSub}>{graphic.sub}</span>}
                    <span className={styles.gStripes} />
                </div>
            );
        case 'team': {
            const team = findTeam(teams, graphic.team);
            return (
                <div className={styles.gTeam} style={teamVars(team)}>
                    <Logo team={team} className={styles.gTeamLogo} />
                    <div className={styles.gTeamText}>
                        <b>{team?.name ?? graphic.team}</b>
                        {team?.owner && <span>{team.owner}</span>}
                        {graphic.caption && <em>{graphic.caption}</em>}
                    </div>
                </div>
            );
        }
        case 'matchup': {
            const home = findTeam(teams, graphic.home);
            const away = findTeam(teams, graphic.away);
            const scored = graphic.homeScore !== undefined && graphic.awayScore !== undefined;
            const lead = scored ? Math.sign(Number(graphic.homeScore) - Number(graphic.awayScore)) : 0;
            const side = (team: StudioTeam | null, ref: string, score: string | undefined, leading: boolean, cls: string) => (
                <div className={`${styles.gSide} ${cls}`} style={teamVars(team)} data-lead={leading || undefined}>
                    <Logo team={team} />
                    <b>{team?.abbreviation ?? ref}</b>
                    <span>{team?.name ?? ''}</span>
                    {score !== undefined && <strong>{score}</strong>}
                    {leading && <em className={styles.gLeads}>Leads</em>}
                </div>
            );
            return (
                <div className={styles.gMatchup}>
                    {side(home, graphic.home, graphic.homeScore, lead > 0, styles.gHome)}
                    {side(away, graphic.away, graphic.awayScore, lead < 0, styles.gAway)}
                    <span className={styles.gVs}>vs</span>
                    {graphic.caption && <span className={styles.gTicker}>{graphic.caption}</span>}
                </div>
            );
        }
        case 'pick': {
            const team = findTeam(teams, graphic.team);
            return (
                <div className={styles.gPick} style={teamVars(team)}>
                    <div className={styles.gPickNo}><small>Pick</small><b>{graphic.pick}</b></div>
                    <div className={styles.gPickWho}>
                        <b>{graphic.player}</b>
                        {(team || graphic.detail) && (
                            <span>{team && <Logo team={team} />}{[team?.name, graphic.detail].filter(Boolean).join(' · ')}</span>
                        )}
                    </div>
                </div>
            );
        }
        case 'stat': {
            const team = findTeam(teams, graphic.team);
            return (
                <div className={styles.gStat} style={teamVars(team)}>
                    {team && <Logo team={team} className={styles.gStatMark} />}
                    <b className={styles.gStatValue}>{graphic.value}</b>
                    <div className={styles.gStatText}>
                        {graphic.label && <strong>{graphic.label}</strong>}
                        {graphic.detail && <span>{graphic.detail}</span>}
                    </div>
                    {team && <span className={styles.gStatTeam}>{team.name}</span>}
                </div>
            );
        }
        case 'compare': {
            const home = findTeam(teams, graphic.home);
            const away = findTeam(teams, graphic.away);
            const head = (team: StudioTeam | null, ref: string, score?: string) => (
                <div className={styles.gCmpTeam} style={teamVars(team)}>
                    <Logo team={team} />
                    <b>{team?.abbreviation ?? ref}</b>
                    {score !== undefined && <strong>{score}</strong>}
                </div>
            );
            return (
                <div className={styles.gCompare}>
                    <div className={styles.gCmpHead}>
                        {head(home, graphic.home, graphic.homeScore)}
                        {head(away, graphic.away, graphic.awayScore)}
                    </div>
                    <ol>
                        {graphic.rows.map((row, i) => {
                            const diff = Number(row.home) - Number(row.away);
                            return (
                                <li key={row.label} data-hl={row.highlight || undefined} style={{ '--row': i } as React.CSSProperties}>
                                    <span data-win={diff > 0 || undefined} data-lose={diff < 0 || undefined}>{row.home}</span>
                                    <b>{row.label}</b>
                                    <span data-win={diff < 0 || undefined} data-lose={diff > 0 || undefined}>{row.away}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            );
        }
        case 'numbers': {
            const team = findTeam(teams, graphic.team);
            return (
                <div className={styles.gNumbers} style={teamVars(team)}>
                    {team && <div className={styles.gNumTeam}><Logo team={team} /><span>{team.name}</span></div>}
                    <div className={styles.gNumRow}>
                        {graphic.items.map((item, i) => (
                            <div key={i} className={styles.gNum} style={{ '--row': i } as React.CSSProperties}>
                                <b>{item.value}</b>
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        case 'player': {
            const player = findPlayer(players, graphic.name);
            const team = findTeam(teams, graphic.team);
            const line = player?.fpts != null
                ? [`${player.fpts.toLocaleString('en-CA', { maximumFractionDigits: 1 })} FPts`, player.fpg != null ? `${player.fpg.toFixed(2)} FP/G` : null, player.games ? `${player.games} GP` : null].filter(Boolean).join(' · ')
                : null;
            return (
                <div className={styles.gPlayer} data-mood={graphic.mood} style={teamVars(team)}>
                    {graphic.mood === 'hearts' && HEARTS.map(([x, delay, size], i) => (
                        <Heart key={i} style={{ left: `${x}%`, animationDelay: `${delay}s`, '--size': size } as React.CSSProperties} />
                    ))}
                    <div className={styles.gShot}>
                        {player?.headshot
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={player.headshot} alt="" referrerPolicy="no-referrer" />
                            : <span>{graphic.name.split(/\s+/).map(w => w[0]).join('')}</span>}
                        {graphic.mood === 'hearts' && <Heart />}
                    </div>
                    <div className={styles.gPlayerText}>
                        <b>{player?.name ?? graphic.name}</b>
                        {graphic.caption && <em>{graphic.caption}</em>}
                        {line && <span><small>{player?.season ? seasonLabel(player.season) : 'Last season'}</small>{line}</span>}
                        {team && <i><Logo team={team} />{team.name}</i>}
                    </div>
                </div>
            );
        }
        case 'gap': {
            const fmt = (n: number) => n.toLocaleString('en-CA', { maximumFractionDigits: 2 });
            const base = findPlayer(players, graphic.base);
            const people = [graphic.base, ...graphic.others].map(name => ({ name, player: findPlayer(players, name) }));
            const season = base?.season ?? people.find(p => p.player?.season)?.player?.season;
            return (
                <div className={styles.gGap}>
                    <span className={styles.gSlab}>{season ? `${seasonLabel(season)} FPts` : 'Last season FPts'}</span>
                    <ol>
                        {people.map(({ name, player }, i) => {
                            const diff = i > 0 && player?.fpts != null && base?.fpts != null ? player.fpts - base.fpts : null;
                            return (
                                <li key={name} data-base={i === 0 || undefined} style={{ '--row': i } as React.CSSProperties}>
                                    <div className={styles.gGapShot}>
                                        {player?.headshot
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img src={player.headshot} alt="" referrerPolicy="no-referrer" />
                                            : <span>{name.split(/\s+/).map(w => w[0]).join('')}</span>}
                                    </div>
                                    <b>{(player?.name ?? name).split(/\s+/).slice(-1)[0]}</b>
                                    <strong>{player?.fpts != null ? fmt(player.fpts) : '—'}</strong>
                                    {diff !== null && <em>{diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff))}</em>}
                                </li>
                            );
                        })}
                    </ol>
                </div>
            );
        }
        case 'list':
            return (
                <div className={styles.gList}>
                    {graphic.title && <span className={styles.gSlab}>{graphic.title}</span>}
                    <ol data-cols={graphic.rows.length > 5 ? 2 : 1}>
                        {graphic.rows.map((row, i) => {
                            const team = findTeam(teams, row.team);
                            return (
                                <li key={i} style={{ '--row': i } as React.CSSProperties}>
                                    {row.team !== undefined && <Logo team={team} />}
                                    <b>{team?.name ?? row.label ?? row.team}</b>
                                    <span>{row.value}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            );
    }
}

/** the dominant colour a graphic throws onto the set */
export const spillColour = (graphic: Graphic, teams: StudioTeam[]) => {
    switch (graphic.type) {
        case 'off': return 'transparent';
        case 'static': return '#9aa7b8';
        case 'bars': return '#7d9ad0';
        case 'team': return findTeam(teams, graphic.team)?.primary ?? '#2a4d9c';
        case 'pick': return findTeam(teams, graphic.team)?.primary ?? '#c8102e';
        case 'stat': return findTeam(teams, graphic.team)?.primary ?? '#2a4d9c';
        case 'matchup': return findTeam(teams, graphic.home)?.primary ?? '#2a4d9c';
        case 'compare': return findTeam(teams, graphic.home)?.primary ?? '#2a4d9c';
        case 'numbers': return findTeam(teams, graphic.team)?.primary ?? '#2a4d9c';
        case 'player': return graphic.mood === 'hearts' ? '#ff4f7b' : findTeam(teams, graphic.team)?.primary ?? '#2a4d9c';
        default: return '#2a4d9c';
    }
};

/** a re-cut to the same compare (only the highlighted row changed) updates in place */
const sameScene = (graphic: Graphic, previous: Graphic | undefined) =>
    graphic.type === 'compare' && previous?.type === 'compare' && previous.home === graphic.home && previous.away === graphic.away;

function Monitor({ graphic, index, previous, teams, players, running }: { graphic: Graphic; index: number; previous?: Graphic; teams: StudioTeam[]; players: StudioPlayer[]; running: boolean }) {
    const on = graphic.type !== 'off';
    const keyRef = useRef(index);
    if (!sameScene(graphic, previous)) keyRef.current = index;
    return (
        <div className={styles.monitor}>
            <div className={styles.mount} aria-hidden="true" />
            <div className={styles.bezel}>
                <div className={styles.screen} data-on={on || undefined}>
                    {/* keyed so each cut replays its entrance */}
                    <div key={keyRef.current} className={styles.picture} data-type={graphic.type}>
                        <Picture graphic={graphic} teams={teams} players={players} running={running} />
                    </div>
                    {keyRef.current > 0 && <div key={`cut${keyRef.current}`} className={styles.cut} aria-hidden="true" />}
                    <div className={styles.glass} aria-hidden="true" />
                </div>
                <i className={styles.standby} data-on={on || undefined} aria-hidden="true" />
            </div>
        </div>
    );
}

export default memo(Monitor);
