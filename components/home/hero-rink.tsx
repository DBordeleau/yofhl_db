import styles from './home.module.css';

export default function HeroRink() {
    return <svg className={styles.heroRink} viewBox="0 0 1000 460" fill="none" aria-hidden="true">
        <defs>
            <linearGradient id="rink-ice" x1="0" y1="0" x2="1000" y2="460" gradientUnits="userSpaceOnUse">
                <stop stopColor="#b8d4e7" /><stop offset=".5" stopColor="#f0f8ff" /><stop offset="1" stopColor="#a7c5dc" />
            </linearGradient>
            <pattern id="ice-marks" width="80" height="50" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
                <path d="M0 5h55M25 22h42M8 43h60" stroke="#fff" strokeOpacity=".3" strokeWidth=".7" />
            </pattern>
            <clipPath id="rink-boards"><rect x="12" y="12" width="976" height="436" rx="125" /></clipPath>
        </defs>
        <rect x="5" y="5" width="990" height="450" rx="132" fill="#1b3551" stroke="#92b7d2" strokeWidth="3" />
        <rect x="12" y="12" width="976" height="436" rx="125" fill="url(#rink-ice)" stroke="#fff" strokeWidth="5" />
        <g clipPath="url(#rink-boards)">
            <path d="M500 12v436" stroke="#b9213c" strokeWidth="5" strokeDasharray="12 6" />
            <path d="M345 12v436M655 12v436" stroke="#317ba9" strokeWidth="7" />
            <path d="M115 12v436M885 12v436" stroke="#b9213c" strokeWidth="3" />
            <circle cx="500" cy="230" r="65" stroke="#317ba9" strokeWidth="3" />
            <circle cx="500" cy="230" r="6" fill="#317ba9" />
            {[220, 780].flatMap(x => [125, 335].map(y => <g key={`${x}-${y}`} stroke="#b9213c" strokeWidth="2">
                <circle cx={x} cy={y} r="57" /><circle cx={x} cy={y} r="4" fill="#b9213c" />
                <path d={`M${x-9} ${y-12}v24M${x+9} ${y-12}v24M${x-9} ${y-5}h-12M${x+9} ${y-5}h12M${x-9} ${y+5}h-12M${x+9} ${y+5}h12`} />
            </g>))}
            {[395, 605].flatMap(x => [125, 335].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#b9213c" />))}
            <path d="M115 197a33 33 0 0 1 0 66ZM885 197a33 33 0 0 0 0 66Z" fill="#79b8d7" fillOpacity=".5" stroke="#b9213c" strokeWidth="2" />
            <path d="M115 208H94v44h21M885 208h21v44h-21" stroke="#b9213c" strokeWidth="4" />
            <rect width="1000" height="460" fill="url(#ice-marks)" />
        </g>
    </svg>;
}
