import { mediaUrl } from './media';
/** Prepared CC0 recordings. Change a file here to replace one audition slot. */
export const TV_SWITCHES = [
    { id: 'crt-click', label: 'CRT click', detail: 'A rounded click with a short electrical tail',
        file: mediaUrl('/coachs-corner/audio/tv-crt-click.wav'), author: 'TRP', source: 'https://freesound.org/people/TRP/sounds/616850/' },
    { id: 'relay-snap', label: 'Relay snap', detail: 'A brief mechanical snap from a CRT relay',
        file: mediaUrl('/coachs-corner/audio/tv-relay-snap.wav'), author: 'Fission9', source: 'https://freesound.org/people/Fission9/sounds/693860/' },
    { id: 'channel-fuzz', label: 'Channel fuzz', detail: 'A soft, brief burst of analog static',
        file: mediaUrl('/coachs-corner/audio/tv-channel-fuzz.wav'), author: 'mrs4turn', source: 'https://freesound.org/people/mrs4turn/sounds/786065/' },
] as const;
