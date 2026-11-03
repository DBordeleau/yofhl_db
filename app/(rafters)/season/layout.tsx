import ChampionBanners from '@/components/champion-banners';
import { getSeasonArchive } from '@/lib/data/league';

// the banners double as the season switcher, so they stay mounted while moving between seasons
export default async function SeasonLayout({ children }: { children: React.ReactNode }) {
    const archive = await getSeasonArchive();
    return <>
        <ChampionBanners published={archive.published} />
        {children}
    </>;
}
