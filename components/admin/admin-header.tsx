import { FC } from 'react';
import Link from 'next/link';
import { logout } from '@/app/admin/actions';

// title row for signed-in admin pages, with sign-out
const AdminHeader: FC<{ title: string; back?: boolean }> = ({ title, back }) => (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
            {back && (
                <Link href="/admin" className="mb-2 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-rink-blue hover:text-ink">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                    Admin home
                </Link>
            )}
            <div className="text-xs font-extrabold uppercase tracking-[.2em] text-rink-red">Admin</div>
            <h1 className="font-wide mt-1 text-[28px] font-extrabold uppercase leading-none md:text-4xl">{title}</h1>
        </div>
        <form action={logout}>
            <button type="submit" className="min-h-11 rounded-xl border border-line-strong bg-white px-4 text-sm font-bold text-ink-soft hover:border-rink-blue hover:text-ink">
                Sign out
            </button>
        </form>
    </div>
);

export default AdminHeader;
