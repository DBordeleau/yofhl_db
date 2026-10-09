import { notFound, redirect } from 'next/navigation';
import { getBannerSeasons } from '@/lib/data/league';

// Open the latest completed historical season.
export default async function SeasonRedirect() {
    const latest = (await getBannerSeasons()).filter((s) => s.team || s.playoffStatus === 'cancelled').at(-1);
    if (!latest) notFound();
    redirect(`/season/${latest.year}`);
}
