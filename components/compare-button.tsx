import Link from 'next/link';
import { FiBarChart2 } from 'react-icons/fi';

// sits beside the Share button, in the same light or dark pill
export default function CompareButton({ href, title, dark = false }: { href: string; title: string; dark?: boolean }) {
    const tone = dark
        ? 'border-white/30 bg-white/10 text-white hover:bg-white hover:text-ink focus-visible:outline-[#7FB2FF]'
        : 'border-[#BAC9D8] bg-white text-ink hover:bg-[#EEF4FA] focus-visible:outline-rink-blue';
    return <Link href={href} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-[18px] text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] ${tone}`} title={title}><FiBarChart2 aria-hidden="true" /> Compare</Link>;
}
