import { redirect } from 'next/navigation';

export default async function RecordGameRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/records/game/${encodeURIComponent(id)}`);
}