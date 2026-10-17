import type { Metadata } from 'next';
import Link from 'next/link';
import AudioPreview from '@/components/coachs-corner/audio-preview';
import { archivoItalic } from '@/components/coachs-corner/fonts';
import styles from '@/components/coachs-corner/page.module.css';
import { getStudioBanners, getStudioTeams } from '@/lib/data/coachs-corner';

export const metadata: Metadata = {
    title: "Coach's Corner sound check · YOFHL DB",
    robots: { index: false, follow: false },
};

export default async function AudioPreviewPage() {
    const [teams, banners] = await Promise.all([getStudioTeams(), getStudioBanners()]);
    return (
        <main className={`${styles.page} ${archivoItalic.variable}`}>
            <div className={styles.inner}>
                <header className={styles.head}>
                    <h1 className={styles.title}>Studio sound check</h1>
                    <p className={styles.episode}><Link href="/coachs-corner">Back to Coach&apos;s Corner</Link></p>
                </header>
                <AudioPreview teams={teams} banners={banners} />
            </div>
        </main>
    );
}
