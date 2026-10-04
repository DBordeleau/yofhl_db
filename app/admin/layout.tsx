import type { Metadata } from 'next';

// /admin is reachable only by its URL: nothing links here and search engines are asked to skip it
export const metadata: Metadata = {
    title: 'Admin · YOFHL DB',
    robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <main className="mx-auto max-w-page px-4 pb-16 pt-6 md:px-8 md:pt-10">{children}</main>;
}
