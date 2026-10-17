import { mediaUrl } from './media';
/** Prepared CC0 recordings. Change a file here to replace one audition slot. */
export const TIE_RUSTLES = [
    { id: 'sleeve', label: 'Sleeve rustle', file: mediaUrl('/coachs-corner/audio/tie-sleeve.wav'),
        author: 'martian', source: 'https://freesound.org/people/martian/sounds/19291/' },
    { id: 'cloth-7', label: 'Cloth rustle 7', file: mediaUrl('/coachs-corner/audio/tie-cloth-7.wav'),
        author: 'zazz.sound.design', source: 'https://freesound.org/people/zazz.sound.design/sounds/435292/' },
    { id: 'cloth-8', label: 'Cloth rustle 8', file: mediaUrl('/coachs-corner/audio/tie-cloth-8.wav'),
        author: 'zazz.sound.design', source: 'https://freesound.org/people/zazz.sound.design/sounds/435296/' },
] as const;
