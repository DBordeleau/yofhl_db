import { notFound, redirect } from 'next/navigation';
import { getBannerSeasons } from '@/lib/data/league';

// the banners are the championship history, so /champions opens on the reigning champion's roster
export default async function ChampionsRedirect() {
    const latest = (await getBannerSeasons()).filter((s) => s.team).at(-1);
    if (!latest) notFound();
    redirect(`/champions/${latest.year}`);
}
