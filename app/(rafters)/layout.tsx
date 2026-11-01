// season pages and leaderboards share one page frame; season pages hang the banner rafters in their own layout
export default function RaftersLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="mx-auto max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl px-4 pb-16 md:px-8">
            {children}
        </main>
    );
}
