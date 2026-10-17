import { Archivo } from 'next/font/google';

// the root layout loads Archivo upright; the show's display lettering and mocking asides need the true italic
export const archivoItalic = Archivo({ subsets: ['latin'], axes: ['wdth'], style: 'italic', variable: '--font-cc-italic', display: 'swap' });
