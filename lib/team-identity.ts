// Team identity (GLOSSARY.md, ADR 0001). SQL callers read the league.current_teams and
// league.season_teams views; these types are the rows they return.

// The name, abbreviation and logo a franchise shows today.
export interface CurrentIdentity {
    id: number;
    name: string;
    abbreviation: string;
    logo: string | null;
    defunct: boolean;
}

// The name, abbreviation and logo a franchise showed in one season (the season is the caller's).
export interface SeasonIdentity {
    franchiseId: number;
    name: string;
    abbreviation: string;
    logo: string | null;
}

export interface ClubName {
    place: string | null;
    nickname: string;
}

// Each franchise's full name with its place/nickname split, keyed by franchise ID. Exact splits keep
// multiword places and nicknames together.
const CLUB_NAMES: Record<number, { name: string; place: string; nickname: string }> = {
    1: { name: 'Paddyville Lucifers', place: 'Paddyville', nickname: 'Lucifers' },
    2: { name: 'New Purrsey Devils', place: 'New Purrsey', nickname: 'Devils' },
    3: { name: 'Hooterville Honkers', place: 'Hooterville', nickname: 'Honkers' },
    4: { name: 'Varrock Dark Wizards', place: 'Varrock', nickname: 'Dark Wizards' },
    5: { name: 'Jagrtown Ice Fellas', place: 'Jagrtown', nickname: 'Ice Fellas' },
    6: { name: 'West Texas Torteehaws', place: 'West Texas', nickname: 'Torteehaws' },
    7: { name: 'The Lalibirdies', place: 'The', nickname: 'Lalibirdies' },
    8: { name: 'Skellige Sirens', place: 'Skellige', nickname: 'Sirens' },
    9: { name: 'Carolina Reapers', place: 'Carolina', nickname: 'Reapers' },
    13: { name: 'Hamhung Hall Monitors', place: 'Hamhung', nickname: 'Hall Monitors' },
};

// A current identity name as place and nickname. Once an owner renames the club the stored split
// no longer applies, so the full name is the nickname.
export function clubName(franchiseId: number | null | undefined, currentName: string): ClubName {
    const club = franchiseId ? CLUB_NAMES[franchiseId] : undefined;
    return club?.name === currentName ? { place: club.place, nickname: club.nickname } : { place: null, nickname: currentName };
}
