'use client';
import { useState } from 'react';
export default function CopyDropList({ names }: { names: string[] }) {
    const [message, setMessage] = useState('');
    return <div className="mt-4"><button type="button" disabled={!names.length} className="min-h-11 rounded-lg border border-line-strong bg-white px-4 text-xs font-bold text-ink disabled:opacity-50" onClick={async () => {
        try { await navigator.clipboard.writeText(names.join('\n')); setMessage('Drop list copied.'); }
        catch { setMessage('Copy unavailable. Select and copy the names above.'); }
    }}>Copy drop list</button><span role="status" className="ml-3 text-xs text-ink-soft">{message}</span></div>;
}
