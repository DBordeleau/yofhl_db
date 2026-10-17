'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import styles from './dialog.module.css';

export default function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const id = useId();
    useEffect(() => {
        const element = dialog.current!;
        const previousFocus = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflowY;
        element.showModal();
        document.body.style.overflowY = 'hidden';
        return () => {
            element.close();
            document.body.style.overflowY = overflow;
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, []);
    return <dialog ref={dialog} className={styles.dialog} aria-labelledby={id}
        onCancel={event => { event.preventDefault(); onClose(); }}
        onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }}>
        <div className={styles.heading}><h2 id={id}>{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><FiX aria-hidden="true" /></button></div>
        {children}
    </dialog>;
}
