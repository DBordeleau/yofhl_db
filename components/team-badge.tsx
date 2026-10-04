import { FC } from 'react';
import Image from 'next/image';

interface TeamBadgeProps {
    logo: string | null;
    abbreviation: string | null;
    teamName: string | null;
    size: number; // px, also sets image resolution
    sizeClass?: string; // responsive width/height classes that override size
    ring?: 'gold' | 'glow' | 'none';
    priority?: boolean;
}

// shrink long abbreviations (e.g. TEEHAW) so they fit inside the circle
const monogramSize = (size: number, abbreviation: string | null) => {
    const length = Math.max(abbreviation?.length ?? 1, 3);
    return Math.max(6.5, Math.round(Math.min(size * 0.22, (size * 0.76) / (length * 0.8)) * 2) / 2);
};

// white circular badge with the team logo, or the abbreviation when a team has no logo yet
const TeamBadge: FC<TeamBadgeProps> = ({ logo, abbreviation, teamName, size, sizeClass, ring = 'gold', priority = false }) => {
    const ringClass =
        ring === 'glow'
            ? 'shadow-[0_0_0_4px_#F0C75E,0_0_40px_rgba(240,199,94,.35),0_16px_32px_rgba(0,0,0,.35)]'
            : ring === 'gold'
                ? 'shadow-[0_0_0_3px_rgba(240,199,94,.85),0_8px_18px_rgba(0,0,0,.3)]'
                : 'shadow-[inset_0_0_0_1px_#DCE5EE]';

    return (
        <span
            className={`relative flex flex-none items-center justify-center overflow-hidden rounded-full bg-white ${ringClass} ${sizeClass ?? ''}`}
            style={sizeClass ? undefined : { width: size, height: size }}
        >
            {logo ? (
                <Image
                    src={logo}
                    alt={teamName ? `${teamName} logo` : ''}
                    width={Math.round(size * 0.78)}
                    height={Math.round(size * 0.78)}
                    className="object-contain"
                    style={{ width: '78%', height: '78%' }}
                    priority={priority}
                />
            ) : (
                <span
                    className="font-wide font-black uppercase tracking-tight text-ink"
                    style={{ fontSize: monogramSize(size, abbreviation) }}
                    aria-label={teamName ?? undefined}
                >
                    {abbreviation}
                </span>
            )}
        </span>
    );
};

export default TeamBadge;
