import { Barlow_Condensed } from 'next/font/google';

// the condensed broadcast face shared by the matchup cards and the roster sheet
export const broadcastType = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], style: ['normal', 'italic'], display: 'swap', adjustFontFallback: false, variable: '--font-matchup-display' });
