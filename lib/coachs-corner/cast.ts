// The Coach's Corner cast: who sits where, the gestures each host can perform, and how each delivery
// sounds and moves. Scripts name gestures ("point"), never image files; the engine picks the open- or
// closed-mouth artwork as the words land.

export type CharacterId = 'don' | 'ron';
export const CHARACTERS: CharacterId[] = ['don', 'ron'];

export interface Gesture {
    /** artwork while the mouth is shut (listening, between syllables) */
    closed?: string;
    /** artwork with the mouth open; gestures with only one image hold it while talking */
    open?: string;
    /** gesture to hold after speaking in this one; defaults to this gesture when it has a closed face, otherwise rest */
    after?: string;
}

export interface Character {
    id: CharacterId;
    name: string;
    seat: 'left' | 'right';
    /** suit colour, used for the speaker tag and the scrub-bar barcode */
    colour: string;
    gestures: Record<string, Gesture>;
    /** gesture used automatically for a delivery when the script names none */
    deliveryGestures: Partial<Record<Delivery, string>>;
    voice: { base: number; spread: number; wave: OscillatorType; grit: number };
}

const art = (id: string) => id;

export const CAST: Record<CharacterId, Character> = {
    don: {
        id: 'don',
        name: 'Don',
        seat: 'left',
        colour: '#C8102E',
        gestures: {
            // Normal/default suit: preserve these unprefixed mappings when adding wardrobes.
            rest: { closed: art('don-default'), open: art('don-talk') },
            point: { closed: art('don-point'), open: art('don-point-talk') },
            thumbs: { closed: art('don-thumbs-up'), open: art('don-thumbs-up-talk') },
            angry: { open: art('don-angry-talk') },
            surprised: { open: art('don-surprised') },
            lean: { open: art('don-lean-camera') },
            stare: { closed: art('don-stare') },
            pause: { closed: art('don-pause') },
            tie: { closed: art('don-tie-adjust') },
            mic: { closed: art('don-mic-remove') },
            pound: { closed: art('don-desk-pound') },
            'pound-ready': { closed: art('don-desk-pound-ready') },
            'halloween-rest': { closed: art('don-halloween-default'), open: art('don-halloween-talk') },
            'halloween-point': { closed: art('don-halloween-point'), open: art('don-halloween-point-talk') },
            'halloween-thumbs': { closed: art('don-halloween-thumbs-up'), open: art('don-halloween-thumbs-up-talk') },
            'halloween-angry': { open: art('don-halloween-angry-talk'), after: 'halloween-rest' },
            'halloween-surprised': { open: art('don-halloween-surprised'), after: 'halloween-rest' },
            'halloween-lean': { open: art('don-halloween-lean-camera'), after: 'halloween-rest' },
            'halloween-stare': { closed: art('don-halloween-stare') },
            'halloween-pause': { closed: art('don-halloween-pause') },
            'halloween-tie': { closed: art('don-halloween-tie-adjust') },
            'halloween-mic': { closed: art('don-halloween-mic-remove') },
            'halloween-pound': { closed: art('don-halloween-desk-pound') },
            'halloween-pound-ready': { closed: art('don-halloween-desk-pound-ready') },
        },
        deliveryGestures: { yell: 'angry' },
        voice: { base: 118, spread: 34, wave: 'sawtooth', grit: 0.5 },
    },
    ron: {
        id: 'ron',
        name: 'Ron',
        seat: 'right',
        colour: '#24418F',
        gestures: {
            rest: { closed: art('ron-default'), open: art('ron-talk') },
            skeptical: { open: art('ron-skeptical-talk') },
            warning: { open: art('ron-warning') },
            surprised: { open: art('ron-surprised') },
            down: { closed: art('ron-look-down') },
        },
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

export const resolveGesture = (who: CharacterId, name: string): string | null => {
    const key = name.toLowerCase().replace(/^(don|ron)-/, '');
    const prefix = key.startsWith('halloween-') ? 'halloween-' : '';
    const base = key.slice(prefix.length);
    const id = prefix + (GESTURE_ALIASES[base] ?? base);
    return CAST[who].gestures[id] ? id : null;
};

/** Wardrobe variants share the same physical action, camera direction and Foley. */
export const gestureAction = (gesture: string) => gesture.replace(/^halloween-/, '');

export const gestureAfter = (who: CharacterId, gesture: string) => {
    const g = CAST[who].gestures[gesture];
    if (g?.after) return g.after;
    return g?.closed ? gesture : 'rest';
};

/** the artwork for a gesture with the mouth open or shut */
export const artFor = (who: CharacterId, gesture: string, open: boolean) => {
    const g = CAST[who].gestures[gesture] ?? CAST[who].gestures.rest;
    return (open ? g.open ?? g.closed : g.closed ?? g.open)!;
};

export const ART_BASE = '/coachs-corner/robots-v2/';
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

export const SOUNDS = ['horn', 'whistle', 'buzzer', 'organ', 'sting', 'thud', 'desk-pound'] as const;
export type Sound = typeof SOUNDS[number];
