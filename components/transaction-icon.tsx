import type { SVGProps } from 'react';

export default function TransactionIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: 'trade' | 'claim' | 'drop' | 'draft' | 'free_agent' }) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {kind === 'trade' ? <><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" /></> : kind === 'draft' ? <>
            <path d="M8 3h8l4 4v14H4V3h4Z" /><path d="M15 3v5h5M8 13h8M8 17h5" />
        </> : <>
            <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
            <path d="M8 11h8" />{kind !== 'drop' && <path d="M12 7v8" />}
        </>}
    </svg>;
}
