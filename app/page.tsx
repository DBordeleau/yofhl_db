import { redirect } from 'next/navigation';

export default function StatsRedirect() {
  redirect('/stats/all-time/all');
}