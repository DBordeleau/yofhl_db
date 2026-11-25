// The one rule that turns a player into an NHL identity, shared by the HTTP and in-memory adapters: names compare
// exactly once accents and punctuation are stripped; same-name candidates are narrowed by position group when the
// positions are known (a player with several groups keeps a candidate that fits any of them), then by current or
// last NHL team when the team is known, even when only one is left. Exactly one candidate is the identity; none, or
// several, is none. Never the closest name: nobody is judged on another player's record.
import type { IdentifyRequest, NhlIdentity } from './model';

/** an NHL player the identity could be */
export interface NhlCandidate {
    nhlId: NhlIdentity;
    name: string;
    /** the NHL's position code */
    position: string | null;
    /** their current and last NHL team abbreviations */
    teams: (string | null)[];
}

const comparableName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** forward, defence or goalie, from a Fantrax position (`LW`) or an NHL one (`L`) */
const positionGroup = (position: string | null) => position === 'G' ? 'G' : position === 'D' ? 'D' : 'F';

export function matchIdentity(player: IdentifyRequest, candidates: NhlCandidate[]): NhlIdentity | null {
    let matches = candidates.filter(candidate => comparableName(candidate.name) === comparableName(player.name));
    const groups = new Set((player.positions ?? []).map(positionGroup));
    if (groups.size) matches = matches.filter(candidate => groups.has(positionGroup(candidate.position)));
    const team = player.nhlTeam;
    if (team) matches = matches.filter(candidate => candidate.teams.includes(team));
    return matches.length === 1 ? matches[0].nhlId : null;
}
