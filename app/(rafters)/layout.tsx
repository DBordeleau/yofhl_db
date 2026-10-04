import ChampionBanners from '@/components/champion-banners';
import RinkDivider from '@/components/rink-divider';
import { getBannerSeasons } from '@/lib/data/league';

// leaderboards and championship rosters share the banner rafters, so the banners stay mounted between those pages
export default async function RaftersLayout({ children }: { children: React.ReactNode }) {
    const seasons = await getBannerSeasons();
    return (
        <>
            <ChampionBanners seasons={seasons} />
            <main className="mx-auto max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl px-4 pb-16 md:px-8">
                <RinkDivider />
                {children}
            </main>
        </>
    );
}
