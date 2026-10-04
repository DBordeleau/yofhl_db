import type { ReactNode } from 'react';

// A permanent remembrance for Johnny's profile. Career records remain below it.
export default function JohnnyGaudreauMemorial({ actions }: { actions: ReactNode }) {
    return (
        <>
            <header className="navy-spotlight border-b-2 border-[#C7AD76] px-6 py-8 text-white md:px-10 md:py-10">
                <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.22em] text-[#DCC99F]">
                        <span aria-hidden="true" className="hidden h-px w-7 bg-[#C7AD76] sm:block" />
                        In loving memory
                    </p>
                    <span className="font-narrow text-3xl font-bold leading-none text-[#DCC99F] sm:hidden">
                        <span className="sr-only">Number </span>13
                    </span>
                </div>
                <div className="mt-6 flex items-center justify-between gap-4 md:gap-8">
                    <div className="min-w-0">
                        <h1 className="font-wide text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px] md:text-[56px]">
                            Johnny Gaudreau
                        </h1>
                        <p className="mt-3 text-sm font-semibold text-[#DCC99F] sm:hidden">Johnny Hockey</p>
                        <p className="mt-4 text-sm tracking-[.12em] text-[#CDD5E2]">
                            <time dateTime="1993">1993</time>
                            <span className="mx-2" aria-hidden="true">—</span>
                            <span className="sr-only"> to </span>
                            <time dateTime="2024">2024</time>
                        </p>
                    </div>
                    <div className="hidden shrink-0 border-l border-[#DCC99F]/25 pl-4 text-center sm:block md:pl-10" role="img" aria-label="Number 13, Johnny Hockey">
                        <span aria-hidden="true" className="font-narrow block text-[76px] font-extrabold leading-none tracking-tight text-[#DCC99F] md:text-[128px]">13</span>
                        <span aria-hidden="true" className="mt-2 block text-[9px] font-bold uppercase tracking-[.14em] text-[#DCC99F] md:text-[11px]">Johnny Hockey</span>
                    </div>
                </div>
                <div className="mt-6">{actions}</div>
            </header>

            <section aria-labelledby="johnny-remembrance" className="border-b border-[#E7E0D3] bg-[#FCFAF5] px-6 py-7 md:px-10 md:py-8">
                <div className="max-w-3xl">
                    <h2 id="johnny-remembrance" className="text-xl font-bold tracking-tight md:text-2xl">Forever part of our game.</h2>
                    <div className="mt-4 space-y-3 text-[15px] leading-7 text-ink-soft md:text-base">
                        <p>&quot;Johnny Hockey&quot; was a diminutive, offensively dominant winger with an incredibly high level of skill. Possessed the elusiveness to avoid being taken out, and the creativity to start and finish plays. Exhibited incredible puck control, strength on his skates, stickhandling ability, and a very good forehand and backhand shot which was off of his stick in the blink of an eye. All-in-all, the prototypical offensive winger who could put up points, and be relied upon to create scoring chances, whenever he was on the ice.</p>
                        <p>
                            More than that, Johnny was unlike any other player in the league. He reached heights we are unlikely to see another 5&apos;9&quot; winger reach in a very long time. We&apos;re grateful for our memories of Johnny and for the joy he brought to fans of the game. We are going to miss him.
                        </p>
                    </div>
                    <p className="mt-5 font-semibold text-ink">Thank you, Johnny.</p>
                    <div className="mt-6 border-t border-[#E7E0D3] pt-4 text-sm leading-6 text-ink-muted">
                        <a
                            href="https://www.nhl.com/video/remembering-johnny-gaudreau-6361273889112"
                            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-sm text-ink-soft underline decoration-[#B9AA8E] underline-offset-4 hover:text-rink-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rink-blue"
                        >
                            Remembering Johnny &amp; Matthew Gaudreau ↗
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}
