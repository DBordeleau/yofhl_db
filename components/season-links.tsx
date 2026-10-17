import React from 'react';
import Link from 'next/link';
import { seasonLabel } from '@/lib/league';

// Season labels use the starting year, while season URLs use the ending year.
export default function SeasonLinks({ text, className, tabIndex }: { text: string; className?: string; tabIndex?: number }) {
    return text.split(/(\b\d{4}–\d{2}\b)/).map((part, index) => {
        const year = Number(part.slice(0, 4)) + 1;
        return /^\d{4}–\d{2}$/.test(part) && seasonLabel(year) === part
            ? <Link key={index} href={`/season/${year}`} className={className} tabIndex={tabIndex}>{part}</Link>
            : part;
    });
}
