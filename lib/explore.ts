export interface ExploreLink { href: string; title: string; reason: string }
export function exploreLinks(links: (ExploreLink | null | undefined | false)[], currentHref: string) {
    const seen = new Set([currentHref]);
    return links.filter((link): link is ExploreLink => {
        if (!link || !link.href.startsWith('/') || link.href.startsWith('//') || seen.has(link.href)) return false;
        seen.add(link.href);
        return true;
    }).slice(0, 4);
}
