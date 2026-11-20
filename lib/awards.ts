import { GM_OF_THE_YEAR } from './award-vote/model';

/**
 * how an award's winners are decided: the Final (`final`), the most regular-season fantasy points (`points`), winners
 * stored by hand or from an award vote (`stored`), or a team award vote's published tallies (`teamVote`)
 */
export type AwardDecidedBy = 'final' | 'points' | 'stored' | 'teamVote';

export interface AwardDefinition {
    id: string;
    /** Preserve the database name so existing winner records and URLs keep working. */
    name: string;
    label: string;
    /** the label shortened to fit share cards */
    shortName: string;
    scope: 'team' | 'player';
    honor: string;
    description: string;
    /** its trophy art, or null for one with no art yet (the trophy components show a plain trophy) */
    image: string | null;
    /**
     * false for an award the league owner hasn't released: it is on the award vote's ballot and in its tallies, but
     * no list of awards shows it (navigation, the award gallery, search, the award API, share cards, trophy shelves and
     * the franchise trophy case; see listedAwards). Its own award page still shows its published winners.
     */
    released?: false;
    decidedBy: AwardDecidedBy;
    /** true for an award a season can only give once its playoffs are played */
    needsPlayoffs?: true;
    /** true for an award a player can win only once, so it has no per-award record in the record book */
    oncePerPlayer?: true;
}

/** every award, released or not */
export const AWARD_CATALOGUE: readonly AwardDefinition[] = [
    {
        id: 'jagr-cup', name: 'Jagr Cup', label: 'Jagr Cup', shortName: 'Jagr Cup', decidedBy: 'final', scope: 'team', honor: 'League champion',
        description: 'The highest honour in YOFHL. The Jagr Cup belongs to the team that wins the championship playoffs and finishes the season on top.',
        image: '/trophies/jagr-cup.webp',
    },
    {
        id: 'prime-minister', name: "Prime Minister's Trophy", label: 'Prime Minister’s Trophy', shortName: 'PM Trophy', decidedBy: 'points', scope: 'team', honor: 'Top-scoring team',
        description: 'Awarded to the team with the most fantasy points in the regular season. It honours the roster that sets the scoring standard across the full campaign.',
        image: '/trophies/prime-minister.webp',
    },
    {
        id: 'wayne-gretzky', name: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', shortName: 'Gretzky', decidedBy: 'stored', scope: 'player', honor: 'Most outstanding player',
        description: 'Presented to the league’s most outstanding player. YOFHL’s counterpart to the Ted Lindsay Award recognises an exceptional individual season.',
        image: '/trophies/wayne-gretzky.webp',
    },
    {
        id: 'le-magnifique', name: 'Le Magnifique', label: 'Le Magnifique', shortName: 'Magnifique', decidedBy: 'stored', scope: 'player', honor: 'Most valuable player',
        description: 'YOFHL’s most valuable player award. Our counterpart to the Hart Trophy honours the player whose contributions singlehandedly transformed the direction of their team’s season.',
        image: '/trophies/le-magnifique.webp',
    },
    {
        id: 'bobby-orr', name: 'Bobby Orr Award', label: 'Bobby Orr Award', shortName: 'Orr', decidedBy: 'stored', scope: 'player', honor: 'Top defenseman',
        description: 'Awarded to the top defenseman in YOFHL. This is our counterpart to the Norris Trophy, recognising the standout season on the blue line.',
        image: '/trophies/bobby-orr.webp',
    },
    {
        id: 'hasek', name: 'Hasek Trophy', label: 'Hasek Trophy', shortName: 'Hasek', decidedBy: 'stored', scope: 'player', honor: 'Top goaltender',
        description: 'Presented to the top goaltender in YOFHL. Our counterpart to the Vezina Trophy celebrates an outstanding season between the pipes.',
        image: '/trophies/hasek.webp',
    },
    {
        id: 'danny-briere', name: 'Danny Briere Award', label: 'Danny Briere Award', shortName: 'Briere', decidedBy: 'stored', needsPlayoffs: true, scope: 'player', honor: 'Playoff MVP',
        description: 'Awarded to the most valuable player of YOFHL playoffs. Our counterpart to the Conn Smythe Trophy celebrates the clutch performances that decide a championship run.',
        image: '/trophies/danny-briere.webp',
    },
    {
        id: 'teemu-selanne', name: 'Teemu Trophy', label: 'Teemu Selanne Trophy', shortName: 'Teemu', decidedBy: 'stored', oncePerPlayer: true, scope: 'player', honor: 'Rookie of the Year',
        description: 'Presented to YOFHL’s Rookie of the Year. It recognises the newcomer who makes the strongest first impression with an outstanding debut season.',
        image: '/trophies/teemu-selanne.webp',
    },
    // a voted award still being tried out: its name and art are placeholders until the league owner releases it
    {
        id: GM_OF_THE_YEAR, name: 'GM of the Year', label: 'GM of the Year', shortName: 'GM of the Year', decidedBy: 'teamVote', scope: 'team', honor: 'Best-run franchise',
        description: 'Awarded to the franchise that was best run over the season, judged on its draft, its moves and how the team finished.',
        image: null, released: false,
    },
];

/**
 * the awards lists of awards show (navigation, the award gallery, search, the award API, the franchise trophy case):
 * the released ones in `catalogue`, a team award decided by an award vote only once one of its tallies is published
 * (`published`, by catalogue ID)
 */
export function listedAwards(published: ReadonlySet<string>, catalogue: readonly AwardDefinition[] = AWARD_CATALOGUE): AwardDefinition[] {
    return catalogue.filter(award => award.released !== false && (award.decidedBy !== 'teamVote' || published.has(award.id)));
}

/**
 * the awards a season is expected to have stored winners for (the admin season page and season status): every stored
 * award, less those that need playoffs in a season whose playoffs weren't played
 */
export function expectedAwards(playoffsPlayed: boolean): AwardDefinition[] {
    return AWARD_CATALOGUE.filter(award => award.decidedBy === 'stored' && (playoffsPlayed || !award.needsPlayoffs));
}

/** the released awards with trophy art, in catalogue order: player trophy shelves and share cards; lists of every award use listedAwards */
export const AWARDS: readonly (AwardDefinition & { image: string })[] =
    AWARD_CATALOGUE.filter((award): award is AwardDefinition & { image: string } => award.released !== false && award.image !== null);

const safeDecode = (value: string) => {
    try { return decodeURIComponent(value); } catch { return value; }
};
const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** the catalogue award with this ID, name, label or URL slug, ignoring case and accents */
export function findAward(slugOrName: string): AwardDefinition | undefined {
    const key = normalize(safeDecode(slugOrName));
    return AWARD_CATALOGUE.find((award) => [award.id, award.name, award.label].some((alias) => normalize(alias) === key));
}

// award names are stored with spaces; URLs use underscores (/awards/Wayne_Gretzky_Award)
export const awardSlug = (name: string) => name.replace(/ /g, '_');
export const awardFromSlug = (slug: string) => decodeURIComponent(slug).replace(/_/g, ' ');

export function awardHref(name: string): string {
    return `/awards/${encodeURIComponent(awardSlug(findAward(name)?.name ?? name))}`;
}
