'use client';

import { FC } from 'react';

export type SaveStatus = { kind: 'idle' } | { kind: 'saved'; message: string } | { kind: 'error'; message: string };

// save button with an unsaved-changes marker and the result of the last save
const SaveBar: FC<{ dirty: boolean; pending: boolean; status: SaveStatus; onSave: () => void; label?: string; onReset?: () => void }> = ({ dirty, pending, status, onSave, label = 'Save', onReset }) => (
    <div className="flex flex-wrap items-center gap-3">
        <button
            type="button"
            onClick={onSave}
            disabled={!dirty || pending}
            className="min-h-11 rounded-xl bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-[#232C4A] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
        >
            {pending ? 'Saving…' : label}
        </button>
        {onReset && dirty && !pending && (
            <button type="button" onClick={onReset} className="min-h-11 rounded-xl px-3 text-sm font-bold text-ink-muted hover:bg-rink-wash hover:text-ink">
                Undo changes
            </button>
        )}
        <span className="text-sm font-semibold" role="status" aria-live="polite">
            {dirty && !pending && <span className="text-gold-deep">Unsaved changes</span>}
            {!dirty && status.kind === 'saved' && <span className="text-[#1E7A4D]">{status.message}</span>}
            {status.kind === 'error' && <span className="text-rink-red">{status.message}</span>}
        </span>
    </div>
);

export default SaveBar;
