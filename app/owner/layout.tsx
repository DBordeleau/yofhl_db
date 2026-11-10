import RefreshOwnerNavigation from '@/components/owner/refresh-owner-navigation';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
    return <><RefreshOwnerNavigation />{children}</>;
}
