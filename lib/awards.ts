import { awardSlug } from '@/lib/league';

export interface AwardDefinition {
    id: string;
    /** Preserve the database name so existing winner records and URLs keep working. */
    name: string;
    label: string;
    scope: 'team' | 'player';
    honor: string;
    description: string;
    image: string;
}

export const AWARDS: readonly AwardDefinition[] = [
    {
        id: 'jagr-cup', name: 'Jagr Cup', label: 'Jagr Cup', scope: 'team', honor: 'League champion',
        description: 'The highest honour in YOFHL. The Jagr Cup belongs to the team that wins the championship playoffs and finishes the season on top.',
        image: '/trophies/jagr-cup.webp',
    },
    {
        id: 'prime-minister', name: "Prime Minister's Trophy", label: 'Prime Minister’s Trophy', scope: 'team', honor: 'Top-scoring team',
        description: 'Awarded to the team with the most fantasy points in the regular season. It honours the roster that sets the scoring standard across the full campaign.',
        image: '/trophies/prime-minister.webp',
    },
    {
        id: 'wayne-gretzky', name: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', scope: 'player', honor: 'Most outstanding player',
        description: 'Presented to the league’s most outstanding player. YOFHL’s counterpart to the Ted Lindsay Award recognises an exceptional individual season.',
        image: '/trophies/wayne-gretzky.webp',
    },
    {
        id: 'le-magnifique', name: 'Le Magnifique', label: 'Le Magnifique', scope: 'player', honor: 'Most valuable player',
        description: 'YOFHL most valuable player award. Our counterpart to the Hart Trophy honours the player whose contribution defines an MVP season.',
        image: '/trophies/le-magnifique.webp',
    },
    {
        id: 'bobby-orr', name: 'Bobby Orr Award', label: 'Bobby Orr Award', scope: 'player', honor: 'Top defenseman',
        description: 'Awarded to the top defenseman in YOFHL. This is our counterpart to the Norris Trophy, recognising the standout season on the blue line.',
        image: '/trophies/bobby-orr.webp',
    },
    {
        id: 'hasek', name: 'Hasek Trophy', label: 'Hasek Award', scope: 'player', honor: 'Top goaltender',
        description: 'Presented to the top goaltender in YOFHL. Our counterpart to the Vezina Trophy celebrates an outstanding season between the pipes.',
        image: '/trophies/hasek.webp',
    },
    {
        id: 'danny-briere', name: 'Danny Briere Award', label: 'Danny Briere Trophy', scope: 'player', honor: 'Playoff MVP',
        description: 'Awarded to the most valuable player of YOFHL playoffs. Our counterpart to the Conn Smythe Trophy celebrates the clutch performances that decide a championship run.',
        image: '/trophies/danny-briere.webp',
    },
    {
        id: 'teemu-selanne', name: 'Teemu Trophy', label: 'Teemu Selanne Trophy', scope: 'player', honor: 'Rookie of the Year',
        description: 'Presented to YOFHL’s Rookie of the Year. It recognises the newcomer who makes the strongest first impression with an outstanding debut season.',
        image: '/trophies/teemu-selanne.webp',
    },
];

const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function getAwardDefinition(name: string): AwardDefinition | undefined {
    const key = normalize(name);
    return AWARDS.find((award) => [award.id, award.name, award.label].some((alias) => normalize(alias) === key));
}

export function awardHref(name: string): string {
    return `/awards/${encodeURIComponent(awardSlug(getAwardDefinition(name)?.name ?? name))}`;
}
