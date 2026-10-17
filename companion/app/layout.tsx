import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Varrock · Draft companion', description: 'Local YOFHL draft companion for the Varrock Dark Wizards.', robots: { index: false, follow: false } };
// Apply the saved theme before paint so a light-theme choice does not flash dark.
const themeScript = "try{if(localStorage.getItem('yofhl-varrock-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}";
export default function Layout({ children }: { children: React.ReactNode }) {
    return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
