import { averageMissedGames, isInjuryProne, type Player } from '../lib/model';

export default function InjuryFlag({ player }: { player: Player }) {
    if (!isInjuryProne(player)) return null;
    return <span className="flag flag-injury" title={`${averageMissedGames(player)} games missed per season (2024–25, 2025–26 average). Any cause; no scoring penalty.`}>INJ</span>;
}

// Fantrax status icons: show a short label and keep the full text in the tooltip.
export function StatusFlag({ player }: { player: Player }) {
    if (!player.note) return null;
    const label = /day.to.day/i.test(player.note) ? 'DTD' : /suspend/i.test(player.note) ? 'SUSP' : /long-term/i.test(player.note) ? 'LTIR' : /reserve/i.test(player.note) ? 'IR' : 'OUT';
    return <span className="flag flag-status" title={player.note}>{label}</span>;
}
