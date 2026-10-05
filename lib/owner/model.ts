import { createHash, randomBytes } from 'node:crypto';
import type { TeamColours } from '../team-branding';

export const invitation = () => randomBytes(24).toString('base64url');
export const hashCode = (code: string) => createHash('sha256').update(code.trim()).digest('hex');

export function teamName(value: unknown) {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
        throw new Error('Use a team name between 2 and 60 characters.');
    }
    return name;
}

export interface ManagedTeam {
    id: number;
    name: string;
    logo: string | null;
    abbreviation: string;
    defunct: boolean;
    ownerUid: string | null;
    ownerEmail: string | null;
    inviteExpiresAt: string | null;
    version: number;
    branding: TeamColours | null;
}
