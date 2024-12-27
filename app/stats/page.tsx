import { redirect } from 'next/navigation';

// redirects to all-time leaderboard
export default function StatsRedirect() {
    redirect('/stats/all-time/all');
}
