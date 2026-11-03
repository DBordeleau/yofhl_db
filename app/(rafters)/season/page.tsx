import { notFound, redirect } from 'next/navigation';
import { getSeasonArchive } from '@/lib/data/league';

// Open the latest season.
export default async function SeasonRedirect() {
    const { latest } = await getSeasonArchive();
    if (!latest) notFound();
    redirect(`/season/${latest.year}`);
}
