// Source dimensions and alpha bounds of existing artwork: [width, height, left, top, markWidth, markHeight].
// Originals stay unchanged; badges and share cards crop to the visible mark.
export const artworkBounds: Record<string, readonly [number, number, number, number, number, number]> = {
    '/reaplogo.png': [3000, 2000, 980, 105, 1026, 1817],
    '/teehawlogo.png': [4000, 4000, 500, 751, 2898, 3045],
    '/lalilogo.png': [2048, 2048, 182, 130, 1746, 1843],
    '/pvlslogo.png': [1422, 1422, 104, 218, 1220, 924],
    '/vwizlogo.png': [150, 134, 0, 0, 150, 134],
    '/jagrlogo.png': [1981, 2091, 32, 32, 1909, 2008],
    '/logos/hooterville_honkers.webp': [255, 170, 66, 13, 123, 144],
};
