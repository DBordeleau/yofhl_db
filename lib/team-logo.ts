// Source dimensions and alpha bounds of existing artwork: [width, height, left, top, markWidth, markHeight].
// Badges and share cards crop to the visible mark. Update these if a logo is resized
// (the large PNGs were capped at 1200 px on their longest side).
export const artworkBounds: Record<string, readonly [number, number, number, number, number, number]> = {
    '/reaplogo.png': [1200, 800, 392, 42, 410, 727],
    '/teehawlogo.png': [1200, 1200, 150, 225, 869, 914],
    '/lalilogo.png': [1200, 1200, 107, 76, 1023, 1080],
    '/pvlslogo.png': [1422, 1422, 104, 218, 1220, 924],
    '/vwizlogo.png': [150, 134, 0, 0, 150, 134],
    '/jagrlogo.png': [1137, 1200, 18, 18, 1096, 1152],
    '/logos/hooterville_honkers.webp': [255, 170, 66, 13, 123, 144],
};
