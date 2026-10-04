import Image from 'next/image';
import { FaTrophy } from 'react-icons/fa';
import { getAwardDefinition } from '@/lib/awards';

interface TrophyArtProps {
    award: string;
    title?: string;
    className?: string;
    sizes?: string;
    priority?: boolean;
}

export function TrophyArt({ award, title, className = 'h-20 w-20', sizes = '80px', priority = false }: TrophyArtProps) {
    const definition = getAwardDefinition(award);
    if (!definition) return <FaTrophy className={className} title={title} aria-hidden={title ? undefined : true} />;
    return (
        <Image
            src={definition.image}
            alt={title ?? ''}
            title={title}
            width={1254}
            height={1254}
            sizes={sizes}
            priority={priority}
            draggable={false}
            className={`shrink-0 object-contain ${className}`}
        />
    );
}

export function JagrCupIcon(props: Omit<TrophyArtProps, 'award'>) {
    return <TrophyArt award="Jagr Cup" sizes="32px" {...props} />;
}

// One miniature of the championship trophy for each winning season.
export function CupRow({ count, className = 'h-7 w-7' }: { count: number; className?: string }) {
    if (count <= 0) return null;
    return (
        <span className="inline-flex flex-wrap items-end gap-0.5" title={`${count} Jagr Cup${count === 1 ? '' : 's'}`}>
            {Array.from({ length: count }, (_, i) => <JagrCupIcon key={i} className={className} />)}
            <span className="sr-only">{count} Jagr Cup{count === 1 ? '' : 's'}</span>
        </span>
    );
}
