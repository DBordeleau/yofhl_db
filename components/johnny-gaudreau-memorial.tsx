import type { ReactNode } from 'react';
import Image from 'next/image';
import familyPhoto from '@/public/memorial/johnny-gaudreau-family.webp';
import styles from './johnny-gaudreau-memorial.module.css';

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
                        <p className="mt-4 font-serif text-lg tracking-[.04em] text-[#CDD5E2]">
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

            <section aria-labelledby="johnny-remembrance" className="grid items-center gap-8 border-b border-[#E7E0D3] bg-[#FCFAF5] px-6 py-8 md:gap-10 md:px-10 md:py-10 lg:grid-cols-[1.15fr_1fr] xl:gap-12 3xl:gap-16">
                <div className={`${styles.remembrance} min-w-0 max-w-3xl`}>
                    <span aria-hidden="true" className="mb-5 block h-px w-10 bg-[#B9AA8E]" />
                    <h2 id="johnny-remembrance" className="font-serif text-[28px] leading-tight tracking-tight text-ink md:text-[32px]">Forever part of our game.</h2>
                    <div className="mt-5 space-y-4 text-[15px] leading-7 text-ink-soft md:text-base md:leading-7">
                        <p>&quot;Johnny Hockey&quot; was a diminutive, offensively dominant winger with an incredibly high level of skill. Possessed the elusiveness to avoid being taken out, and the creativity to start and finish plays. Exhibited incredible puck control, strength on his skates, stickhandling ability, and a very good forehand and backhand shot which was off of his stick in the blink of an eye. All-in-all, the prototypical offensive winger who could put up points, and be relied upon to create scoring chances, whenever he was on the ice.</p>
                        <p>
                            More than that, Johnny was unlike any other player in the league. He reached heights we are unlikely to see another 5&apos;9&quot; winger reach in a very long time. We&apos;re grateful for our memories of Johnny and for the joy he brought to fans of the game. We are going to miss him.
                        </p>
                    </div>
                    <p className="mt-6 font-serif text-xl italic text-ink">Thank you, Johnny.</p>
                    <div className="mt-5 border-t border-[#E7E0D3] pt-3 text-sm leading-6 text-ink-muted">
                        <a
                            href="https://www.nhl.com/video/remembering-johnny-gaudreau-6361273889112"
                            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-sm text-ink-soft underline decoration-[#B9AA8E] underline-offset-4 hover:text-rink-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rink-blue"
                        >
                            Remembering Johnny &amp; Matthew Gaudreau ↗
                        </a>
                    </div>
                </div>
                <figure className={`${styles.remembrance} w-full max-w-2xl justify-self-center rounded-sm border border-[#DED5C5] bg-white p-2 shadow-[0_12px_36px_-20px_rgba(31,39,69,0.3)] md:p-3`}>
                    <Image
                        src={familyPhoto}
                        alt="Johnny Gaudreau with his family at the rink."
                        sizes="(min-width: 2400px) 672px, (min-width: 1800px) 620px, (min-width: 1200px) 460px, (min-width: 1024px) 40vw, (min-width: 768px) 640px, 85vw"
                        placeholder="blur"
                        className="h-auto w-full rounded-[1px]"
                    />
                    <figcaption className="px-2 pb-2 pt-3">
                        <a
                            href="https://www.theplayerstribune.com/meredith-gaudreau-johnny-hockey-nhl"
                            className="inline-flex min-h-11 items-center rounded-sm font-serif text-lg leading-6 text-ink-soft underline decoration-[#B9AA8E] underline-offset-4 hover:text-rink-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rink-blue"
                        >
                            Thank You For Being Perfect, John ↗
                        </a>
                        <p className="mt-1 text-xs leading-5 text-ink-muted">By Meredith Gaudreau · The Players’ Tribune</p>
                    </figcaption>
                </figure>
            </section>
        </>
    );
}
