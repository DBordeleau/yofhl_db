import type { Metadata } from 'next';

// Every public page's metadata comes from here, so that none of them can go out without Open Graph text, a canonical
// address, X's large-image card or the default preview image. What a page says about itself is its own business; what
// every page must set is this module's.

export const SITE_NAME = 'YOFHL';

/** The site's address. Preview URLs are built from it, so a preview deployment's links still point at the real site. */
export const SITE_URL = 'https://www.yofhl.com';

/** what the site is, for the pages that say nothing more specific */
export const SITE_DESCRIPTION = "Every YOFHL season, team, player, record and award, from the first draft to this week's matchups.";

/**
 * The default preview image, rendered by the root `opengraph-image` route (app/opengraph-image.tsx). Next appends a
 * cache-busting query of its own when it writes the tag for that route; naming the path here loses that, which costs
 * nothing because the image never changes between builds.
 */
export const DEFAULT_PREVIEW_IMAGE = {
    url: '/opengraph-image',
    width: 1200,
    height: 630,
    alt: 'YOFHL: every season, team, player and record.',
} as const;

export interface PageMetadata {
    /** the page's path, which becomes its canonical address */
    path: string;
    /** what the page is called, which becomes the "… · YOFHL" title and the Open Graph title */
    name: string;
    /**
     * One sentence saying what is on the page, from lasting facts only: a preview can sit in a chat app for months.
     * A page with nothing of its own to say falls back to what the site is.
     */
    description?: string;
    /** `article` for a page that is one piece of writing, such as a Coach's Corner episode */
    type?: 'website' | 'article';
    /** a page that asks not to be indexed passes its setting through */
    robots?: Metadata['robots'];
    /** `own` for a page with an `opengraph-image` route of its own, which Next fills in for it */
    image?: 'default' | 'own';
}

/** everything a scraper, a search engine and a browser tab read off one public page */
export function pageMetadata({ path, name, description = SITE_DESCRIPTION, type = 'website', robots, image = 'default' }: PageMetadata): Metadata {
    return {
        title: `${name} · ${SITE_NAME}`,
        description,
        alternates: { canonical: path },
        // Next replaces the layout's openGraph with a page's own instead of merging the two, so the default image is
        // attached here rather than inherited.
        openGraph: {
            type, siteName: SITE_NAME, title: name, description,
            ...(image === 'default' ? { images: [DEFAULT_PREVIEW_IMAGE] } : {}),
        },
        // X reads the Open Graph image, so the card needs no image of its own.
        twitter: { card: 'summary_large_image', title: name, description },
        ...(robots ? { robots } : {}),
    };
}
