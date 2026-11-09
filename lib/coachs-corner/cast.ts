// The Coach's Corner cast: who sits where, what each host can do, and how each delivery sounds and
// moves. Scripts name gestures ("point"), never image files; the engine picks the open- or
// closed-mouth pose as the words land. Cast is the only code that knows host art (ADR 0002): every
// art ID, mouth clip and lapel spot comes from here, and nothing else parses an art ID.

export type CharacterId = 'don' | 'ron';
export const CHARACTERS: CharacterId[] = ['don', 'ron'];

export type Mouth = 'open' | 'closed';
/** an art ID: one drawn image of a host, such as don-remembrance-point-talk */
export type Pose = string;

export interface Wardrobe {
    /** the art manifest's wardrobe ID */
    id: string;
    host: CharacterId;
    /** how a script spells it ahead of an action (remembrance-point); empty for normal */
    prefix: string;
}

// A new wardrobe is one entry here, plus its asset files and manifest record. Its mouth clips and
// lapel spots come from the normal poses.
export const WARDROBES: Wardrobe[] = [
    { id: 'normal', host: 'don', prefix: '' },
    { id: 'halloween-2026', host: 'don', prefix: 'halloween-' },
    { id: 'alternate-suit-1', host: 'don', prefix: 'alternate-1-' },
    { id: 'alternate-suit-2', host: 'don', prefix: 'alternate-2-' },
    { id: 'alternate-suit-3', host: 'don', prefix: 'alternate-3-' },
    { id: 'remembrance-2026', host: 'don', prefix: 'remembrance-' },
    { id: 'normal', host: 'ron', prefix: '' },
];

interface Action {
    /** art suffix with the mouth shut */
    closed?: string;
    /** art suffix with the mouth open; an action with only one image holds it while talking */
    open?: string;
    /** after speaking, go back to the wardrobe's rest instead of holding this pose */
    returnsToRest?: true;
}

// What each host physically does, and how its art is spelled in every wardrobe.
const ACTIONS: Record<CharacterId, Record<string, Action>> = {
    don: {
        rest: { closed: 'default', open: 'talk' },
        point: { closed: 'point', open: 'point-talk' },
        thumbs: { closed: 'thumbs-up', open: 'thumbs-up-talk' },
        angry: { open: 'angry-talk', returnsToRest: true },
        surprised: { open: 'surprised', returnsToRest: true },
        lean: { open: 'lean-camera', returnsToRest: true },
        stare: { closed: 'stare' },
        pause: { closed: 'pause' },
        tie: { closed: 'tie-adjust' },
        mic: { closed: 'mic-remove' },
        pound: { closed: 'desk-pound' },
        'pound-ready': { closed: 'desk-pound-ready' },
    },
    ron: {
        rest: { closed: 'default', open: 'talk' },
        skeptical: { open: 'skeptical-talk', returnsToRest: true },
        warning: { open: 'warning', returnsToRest: true },
        surprised: { open: 'surprised', returnsToRest: true },
        down: { closed: 'look-down' },
    },
};

// Mouth pairs are separate drawings. Only this face region should change on a syllable; swapping
// their complete images makes clothing and hands shimmer. Keyed by the normal pose's art suffix.
const MOUTH_CLIPS: Record<CharacterId, Record<string, string>> = {
    don: {
        talk: 'ellipse(11% 10% at 54% 41%)',
        'point-talk': 'ellipse(11% 10% at 49% 41%)',
        'thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    },
    ron: { talk: 'ellipse(14% 8% at 45% 43%)' },
};

/** where a poppy sits over a host's heart (the wearer's left lapel), as [x, y, scale] in the 1254 px frame */
export type LapelSpot = [number, number, number];
// Every wardrobe shares its pose's geometry. Keyed by the normal pose's art suffix; null where
// Don's hand covers that lapel while he grabs the mic.
const LAPEL_SPOTS: Record<CharacterId, { usual: LapelSpot; poses: Record<string, LapelSpot | null> }> = {
    don: { usual: [840, 665, 0.85], poses: { point: [777, 665, 0.85], 'lean-camera': [853, 646, 1], 'mic-remove': null } },
    ron: { usual: [821, 708, 0.85], poses: {} },
};

export interface Gesture {
    /** pose while the mouth is shut (listening, between syllables) */
    closed?: Pose;
    /** pose with the mouth open; gestures with only one pose hold it while talking */
    open?: Pose;
    /** gesture to hold after speaking in this one */
    after: string;
}

export interface Character {
    id: CharacterId;
    name: string;
    seat: 'left' | 'right';
    /** suit colour, used for the speaker tag and the scrub-bar barcode */
    colour: string;
    /** every action in every wardrobe, keyed as a script writes it */
    gestures: Record<string, Gesture>;
    /** gesture used automatically for a delivery when the script names none */
    deliveryGestures: Partial<Record<Delivery, string>>;
    voice: { base: number; spread: number; wave: OscillatorType; grit: number };
}

interface PoseInfo { host: CharacterId; wardrobe: Wardrobe; gesture: string; mouth: Mouth; suffix: string }
const POSES = new Map<Pose, PoseInfo>();

export const wardrobesOf = (host: CharacterId) => WARDROBES.filter(w => w.host === host);
export const actionsOf = (host: CharacterId) => Object.keys(ACTIONS[host]);

/** a host's wardrobes × its actions, at <host>-<prefix><suffix> */
const gesturesOf = (host: CharacterId) => {
    const gestures: Record<string, Gesture> = {};
    for (const wardrobe of wardrobesOf(host)) for (const [action, { closed, open, returnsToRest }] of Object.entries(ACTIONS[host])) {
        const gesture = wardrobe.prefix + action;
        const pose = (suffix: string, mouth: Mouth) => {
            const id = `${host}-${wardrobe.prefix}${suffix}`;
            POSES.set(id, { host, wardrobe, gesture, mouth, suffix });
            return id;
        };
        gestures[gesture] = {
            ...closed && { closed: pose(closed, 'closed') },
            ...open && { open: pose(open, 'open') },
            after: returnsToRest ? `${wardrobe.prefix}rest` : gesture,
        };
    }
    return gestures;
};

export const CAST: Record<CharacterId, Character> = {
    don: {
        id: 'don',
        name: 'Don',
        seat: 'left',
        colour: '#C8102E',
        gestures: gesturesOf('don'),
        deliveryGestures: { yell: 'angry' },
        voice: { base: 118, spread: 34, wave: 'sawtooth', grit: 0.5 },
    },
    ron: {
        id: 'ron',
        name: 'Ron',
        seat: 'right',
        colour: '#24418F',
        gestures: gesturesOf('ron'),
        deliveryGestures: { deadpan: 'skeptical' },
        voice: { base: 196, spread: 26, wave: 'triangle', grit: 0.15 },
    },
};

// friendly spellings writers reach for
export const GESTURE_ALIASES: Record<string, string> = {
    default: 'rest', idle: 'rest', talk: 'rest', normal: 'rest',
    'point-talk': 'point', pointing: 'point',
    'thumbs-up': 'thumbs', 'thumbs-up-talk': 'thumbs', thumb: 'thumbs',
    'angry-talk': 'angry', mad: 'angry',
    'lean-camera': 'lean', camera: 'lean',
    'tie-adjust': 'tie',
    'mic-remove': 'mic',
    'desk-pound': 'pound',
    'desk-pound-ready': 'pound-ready',
    'look-down': 'down', smirk: 'down',
    'skeptical-talk': 'skeptical',
    stop: 'warning',
};

/** the wardrobe a gesture is spelled in; the longest prefix wins, and normal's empty one always matches */
const wardrobeIn = (wardrobes: Wardrobe[], gesture: string) =>
    [...wardrobes].sort((a, b) => b.prefix.length - a.prefix.length).find(w => gesture.startsWith(w.prefix))!;

export const resolveGesture = (who: CharacterId, name: string): string | null => {
    let key = name.toLowerCase();
    const named = CHARACTERS.find(c => key.startsWith(`${c}-`));
    if (named) key = key.slice(named.length + 1);
    const { prefix } = wardrobeIn(wardrobesOf(who), key);
    const base = key.slice(prefix.length);
    const id = prefix + (GESTURE_ALIASES[base] ?? base);
    return CAST[who].gestures[id] ? id : null;
};

/** Wardrobe variants share the same physical action, camera direction and Foley. */
export const gestureAction = (gesture: string) => gesture.slice(wardrobeIn(WARDROBES, gesture).prefix.length);

/** what a script may name for a host, for help and errors: its actions, then the prefixes that pick another wardrobe */
export const gestureHelp = (who: CharacterId) => {
    const prefixes = wardrobesOf(who).map(w => w.prefix).filter(Boolean);
    const last = prefixes.pop();
    const wardrobes = last ? ` For another wardrobe, start it with ${prefixes.length ? `${prefixes.join(', ')} or ${last}` : last}.` : '';
    return `${actionsOf(who).join(', ')}.${wardrobes}`;
};

export const gestureAfter = (who: CharacterId, gesture: string) => CAST[who].gestures[gesture]?.after ?? 'rest';

/** a gesture's pose with the mouth open or shut; an unknown gesture shows the normal rest */
export const artFor = (host: CharacterId, gesture: string, { wardrobe = 'normal', mouth }: { wardrobe?: string; mouth: Mouth }): Pose => {
    const outfit = wardrobesOf(host).find(w => w.id === wardrobe);
    if (!outfit) throw new Error(`${CAST[host].name} has no ${wardrobe} wardrobe`);
    const g = CAST[host].gestures[outfit.prefix + gesture] ?? CAST[host].gestures.rest;
    return (mouth === 'open' ? g.open ?? g.closed : g.closed ?? g.open)!;
};

/** every pose a gesture can show, closed first */
export const posesFor = (host: CharacterId, gesture: string): Pose[] => {
    const g = CAST[host].gestures[gesture];
    return g ? [g.closed, g.open].filter((pose): pose is Pose => !!pose) : [];
};

/** which host, wardrobe and gesture a pose belongs to */
export const poseOf = (pose: Pose): Omit<PoseInfo, 'suffix'> | undefined => {
    const info = POSES.get(pose);
    return info && { host: info.host, wardrobe: info.wardrobe, gesture: info.gesture, mouth: info.mouth };
};

/** the clip-path confining an open-mouth pose to its face, when it overlays a closed body */
export const mouthClipFor = (host: CharacterId, pose: Pose): string | undefined => {
    const info = POSES.get(pose);
    return info?.host === host && info.mouth === 'open' ? MOUTH_CLIPS[host][info.suffix] : undefined;
};

/** where a lapel pin sits on a pose, or null where a hand covers the lapel */
export const lapelFor = (host: CharacterId, pose: Pose): LapelSpot | null => {
    const { usual, poses } = LAPEL_SPOTS[host];
    const info = POSES.get(pose);
    return info && info.suffix in poses ? poses[info.suffix] : usual;
};

export const allArt = (who: CharacterId) =>
    Array.from(new Set(Object.values(CAST[who].gestures).flatMap(g => [g.closed, g.open]).filter((id): id is string => !!id)));

// ---------- deliveries ----------

export type Delivery = 'normal' | 'yell' | 'sneak' | 'deadpan' | 'firm' | 'mock' | 'warm';
export type Motion = 'bob' | 'shake' | 'nod' | 'sway' | 'still';

export interface DeliveryStyle {
    /** speaking-rate multiplier */
    speed: number;
    motion: Motion;
    /** talk-blip loudness and pitch shift */
    volume: number;
    pitch: number;
}

export const DELIVERIES: Record<Delivery, DeliveryStyle> = {
    normal: { speed: 1, motion: 'bob', volume: 1, pitch: 1 },
    yell: { speed: 0.94, motion: 'shake', volume: 1.6, pitch: 1.35 },
    sneak: { speed: 1.55, motion: 'still', volume: 0.45, pitch: 1.12 },
    deadpan: { speed: 0.9, motion: 'still', volume: 0.8, pitch: 0.92 },
    firm: { speed: 0.9, motion: 'nod', volume: 1.2, pitch: 0.96 },
    mock: { speed: 1, motion: 'sway', volume: 1, pitch: 1.25 },
    warm: { speed: 0.92, motion: 'bob', volume: 0.9, pitch: 1.05 },
};

export const DELIVERY_ALIASES: Record<string, Delivery> = {
    shout: 'yell', yelling: 'yell', loud: 'yell',
    whisper: 'sneak', aside: 'sneak', quiet: 'sneak', mutter: 'sneak',
    flat: 'deadpan', dry: 'deadpan',
    mocking: 'mock', sarcastic: 'mock',
    stern: 'firm',
    soft: 'warm',
};

export const resolveDelivery = (name: string): Delivery | null => {
    const key = name.toLowerCase();
    if (key in DELIVERIES) return key as Delivery;
    return DELIVERY_ALIASES[key] ?? null;
};

export const SPEEDS: Record<string, number> = { fast: 1.3, faster: 1.55, slow: 0.78, slower: 0.62 };

// ---------- studio vocabulary ----------

export const SHOTS = ['auto', 'wide', 'don', 'ron', 'monitor', 'close don', 'close ron'] as const;
export type Shot = typeof SHOTS[number];

export const REACTIONS = ['happy', 'shocked'] as const;
export type Reaction = typeof REACTIONS[number];

export const SOUNDS = ['horn', 'whistle', 'buzzer', 'organ', 'sting', 'thud', 'desk-pound', 'happy-twinkle'] as const;
export type Sound = typeof SOUNDS[number];

// Pinned on both hosts for a whole episode, chosen in the front matter.
export const LAPELS = ['poppy'] as const;
export type Lapel = typeof LAPELS[number];
