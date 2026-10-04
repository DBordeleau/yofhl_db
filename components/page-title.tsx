import { FC, ReactNode } from 'react';

interface PageTitleProps {
    eyebrow?: string;
    title: string;
    sub?: ReactNode;
    children?: ReactNode; // controls rendered under the title, e.g. a mode toggle
    wideAlign?: boolean; // left-align on wide screens where the title sits in a side rail
}

// centred page heading: red eyebrow between gold rules, expanded title, optional subtitle
const PageTitle: FC<PageTitleProps> = ({ eyebrow, title, sub, children, wideAlign = false }) => (
    <div className={`flex flex-col items-center gap-2.5 text-center ${wideAlign ? '3xl:items-start 3xl:text-left' : ''}`}>
        {eyebrow && (
            <div className="flex items-center gap-2.5 text-[11px] font-extrabold uppercase tracking-[.32em] text-rink-red md:gap-3.5 md:text-[13px]">
                <i className={`block h-0.5 w-8 bg-gradient-to-r from-transparent to-[#C99A2E] md:w-14 ${wideAlign ? '3xl:hidden' : ''}`} />
                {eyebrow}
                <i className="block h-0.5 w-8 bg-gradient-to-r from-[#C99A2E] to-transparent md:w-14" />
            </div>
        )}
        <h1 className="font-wide m-0 text-[30px] font-extrabold uppercase leading-none tracking-tight md:text-[50px] 4xl:text-[58px]">{title}</h1>
        {sub && <div className="text-xs font-bold uppercase tracking-[.2em] text-ink-muted">{sub}</div>}
        {children}
    </div>
);

export default PageTitle;
