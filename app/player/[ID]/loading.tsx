// shown while a player page renders for the first time
export default function PlayerLoading() {
    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-[76px] md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl" aria-busy="true">
            <div className="skeleton h-[300px] rounded-3xl" />
            <div className="skeleton mt-5 h-[460px] rounded-3xl" />
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="skeleton h-[360px] rounded-3xl" />
                <div className="skeleton hidden h-[360px] rounded-3xl lg:block" />
            </div>
        </main>
    );
}
