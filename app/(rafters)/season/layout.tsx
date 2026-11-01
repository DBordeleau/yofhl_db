import ChampionBanners from '@/components/champion-banners';
import { getBannerSeasons } from '@/lib/data/league';

// the banners double as the season switcher, so they stay mounted while moving between seasons
export default async function SeasonLayout({ children }: { children: React.ReactNode }) {
    const seasons = await getBannerSeasons();
    return <>
        <ChampionBanners seasons={seasons} />
        {children}
    </>;
}
