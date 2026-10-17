export const BROWSE_LINKS = [
    { href: '/stats/all-time/all', label: 'Players', detail: 'Career leaderboards' },
    { href: '/stats/single-season/all', label: 'Single-season leaders', detail: 'The biggest seasons' },
    { href: '/teams/stats', label: 'Teams', detail: 'Every franchise, past and present' },
    { href: '/season', label: 'Seasons', detail: 'Champions, standings, and drafts' },
    { href: '/awards', label: 'Awards', detail: 'The league trophy case' },
    { href: '/records', label: 'Record book', detail: 'League marks and milestones' },
    { href: '/compare/teams', label: 'Compare teams', detail: 'Head-to-head history' },
    { href: '/coachs-corner', label: 'Coach’s Corner', detail: 'Don and Ron on the week' },
] as const;

export const isPrivateRoute = (pathname: string) => /^\/(admin|owner)(\/|$)/.test(pathname);
