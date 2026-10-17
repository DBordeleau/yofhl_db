'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiShare2 } from 'react-icons/fi';
import Dialog from '@/components/dialog';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import { shareFilename, shareUrl, type ShareCard } from '@/lib/share/model';
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/share/dimensions';
import styles from './share.module.css';

// Shown only where a share card exists; the dialog sends the card image with its page link.
// `bare` drops the button styling so a host toolbar (like the Coach's Corner player) can style the icon itself.
export default function ShareButton({ card, title = 'Share this page', dark = false, compact = false, bare = false }: { card: ShareCard; title?: string; dark?: boolean; compact?: boolean; bare?: boolean }) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" aria-haspopup="dialog" aria-label={compact || bare ? title : undefined} onClick={() => setOpen(true)}
            className={bare ? undefined : `${styles.trigger} ${dark ? styles.dark : ''} ${compact ? styles.compact : ''}`}><FiShare2 aria-hidden="true" />{!compact && !bare && ' Share'}</button>
        {/* Portalled so a host toolbar's button styles never reach the dialog's own controls. */}
        {open && createPortal(<ShareDialog card={card} title={title} onClose={() => setOpen(false)} />, document.body)}
    </>;
}

function ShareDialog({ card, title, onClose }: { card: ShareCard; title: string; onClose: () => void }) {
    const key = JSON.stringify(card);
    const [rendered, setRendered] = useState<{ key: string; blob: Blob; preview: string } | null>(null);
    const [failed, setFailed] = useState(false);
    const [message, setMessage] = useState('');
    const [retry, setRetry] = useState(0);
    const [sharing, setSharing] = useState(false);
    const palettes = useTeamBranding();
    const url = shareUrl(card.href, window.location.origin);
    useEffect(() => {
        let cancelled = false;
        let preview: string | undefined;
        setFailed(false);
        setRendered(null);
        import('@/lib/share/render-card').then(module => module.renderShareCard(JSON.parse(key) as ShareCard, palettes)).then(blob => {
            if (cancelled) return;
            preview = URL.createObjectURL(blob);
            setRendered({ key, blob, preview });
        }).catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; if (preview) URL.revokeObjectURL(preview); };
    }, [key, retry, palettes]);
    const ready = rendered?.key === key ? rendered : null;
    const file = ready ? new File([ready.blob], shareFilename(card.title), { type: 'image/png' }) : null;
    const canShare = file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    async function copy() {
        try { await navigator.clipboard.writeText(url); setMessage('Link copied.'); }
        catch { setMessage('Select the link below to copy it.'); }
    }
    async function share() {
        if (!file || sharing) return;
        setSharing(true);
        try { await navigator.share({ files: [file], title: card.title, text: url }); setMessage('Share sheet opened.'); }
        catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Image sharing is unavailable. Download the PNG or copy the link.'); }
        finally { setSharing(false); }
    }
    function download() {
        if (!ready) return;
        const downloadUrl = URL.createObjectURL(ready.blob);
        const link = document.createElement('a');
        link.href = downloadUrl; link.download = shareFilename(card.title); link.click();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    }
    return <Dialog title={title} onClose={onClose}>
        <div className={styles.actions}><button type="button" onClick={copy}>Copy link</button>
            {ready && <button type="button" onClick={download}>Download PNG</button>}
            {canShare && <button type="button" disabled={sharing} onClick={share}>Share image</button>}
        </div>
        <label className={styles.link}>Page link<input readOnly value={url} onFocus={event => event.target.select()} /></label>
        <p role="status" className={styles.message}>{message}</p>
        <>
            {!ready && !failed && <p className={styles.placeholder} role="status">Preparing your card…</p>}
            {failed && <div className={styles.placeholder}><p>The image could not be created. You can still copy the link.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try image again</button></div>}
            {/* Blob previews are generated locally and cannot use the Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ready && <img className={styles.preview} src={ready.preview} width={CARD_WIDTH} height={CARD_HEIGHT} alt={`Share card. ${card.summary}`} />}
            <p className={styles.note}>The card captures the archive data shown now. If your phone opens the image, touch and hold it to save. Send the link too so others can explore.</p>
        </>
    </Dialog>;
}
