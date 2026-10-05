'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TeamColours } from '@/lib/team-branding';

const BrandingContext = createContext<Record<number, TeamColours>>({});
export const useTeamBranding = () => useContext(BrandingContext);

// Server-loaded palettes render on the first HTML response, before hydration.
export default function TeamBrandingProvider({ children, palettes }: { children: ReactNode; palettes: Record<number, TeamColours> }) {
    return <BrandingContext.Provider value={palettes}>{children}</BrandingContext.Provider>;
}
