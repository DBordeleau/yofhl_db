// Small vector emblems stay sharp at every header size and follow the live palette.
// Use the chosen colours directly; text protection belongs to the surface, not the artwork.
export function teamMotif(treatment: string, secondary: string, tertiary: string, base: string, primary: string): { emblem: string; watermark: string; accents?: string } | null {
    let artwork: string;
    let watermarkArtwork: string | undefined;
    let accentArtwork: string | undefined;
    switch (treatment) {
        case 'fleur':
            artwork = `<defs><g id="fleur"><path fill="${secondary}" d="M50 4C61 17 66 29 59 45L54 58C63 35 88 30 94 47C100 67 80 75 70 64C81 66 85 53 77 51C67 48 60 61 59 69H69V78H56C57 84 63 88 69 91C59 93 54 89 50 83C46 89 41 93 31 91C37 88 43 84 44 78H31V69H41C40 61 33 48 23 51C15 53 19 66 30 64C20 75 0 67 6 47C12 30 37 35 46 58L41 45C34 29 39 17 50 4Z"/></g></defs>
                <g opacity=".38"><use href="#fleur" transform="translate(224 18) scale(.38)"/><use href="#fleur" transform="translate(312 18) scale(.38)"/><use href="#fleur" transform="translate(268 88) scale(.38)"/><use href="#fleur" transform="translate(224 158) scale(.38)"/><use href="#fleur" transform="translate(312 158) scale(.38)"/></g>
                <use href="#fleur" transform="translate(390 11) scale(2)" stroke="${tertiary}" stroke-width="1.75" stroke-linejoin="round"/>
                <g transform="translate(440 73)">
                    <path fill="${primary}" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round" d="M0 0L25 12Q50 4 75 12L100 0L94 38C92 63 72 83 50 96C28 83 8 63 6 38Z"/>
                    <path fill="${tertiary}" d="M14 28Q30 28 44 40C44 53 36 59 26 54C17 50 13 40 14 28ZM86 28Q70 28 56 40C56 53 64 59 74 54C83 50 87 40 86 28Z"/>
                    <g fill="${primary}"><circle cx="29" cy="42" r="6"/><circle cx="71" cy="42" r="6"/></g>
                    <path fill="${secondary}" d="M43 59H57L50 74Z"/>
                </g>`;
            break;
        case 'horns':
            artwork = `<path fill="${primary}" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round" d="M466 68L434 78C405 76 384 55 389 10C357 36 355 77 382 103L377 126L398 137C403 162 424 183 447 192L466 212L485 192C508 183 529 162 534 137L555 126L550 103C577 77 575 36 543 10C548 55 527 76 498 78Z"/>
                <path fill="${base}" d="M399 106L447 119L456 137L431 133L412 124ZM533 106L485 119L476 137L501 133L520 124ZM405 141L434 153L443 177C425 169 413 155 405 141ZM527 141L498 153L489 177C507 169 519 155 527 141ZM466 133L459 151L466 155L473 151Z"/>
                <path fill="${secondary}" d="M409 114L448 128L418 124ZM523 114L484 128L514 124Z"/>
                <path fill="${base}" d="M425 163C441 169 455 167 466 163C477 167 491 169 507 163L493 180Q466 193 439 180Z"/>
                <path fill="${tertiary}" d="M442 168L455 170L450 181ZM490 168L477 170L482 181Z"/>`;
            break;
        case 'fangs':
            artwork = `<path fill="${secondary}" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round" d="M438 57C415 39 400 22 395 8C379 33 376 59 386 86C382 112 374 133 366 148L380 159L371 169C400 193 439 208 477 216C515 208 554 193 583 169L574 159L588 148C580 133 572 112 568 86C578 59 575 33 559 8C554 22 539 39 516 57Q477 44 438 57Z"/>
                <path fill="${primary}" d="M408 111C427 112 445 123 453 137C426 150 403 139 408 111ZM546 111C527 112 509 123 501 137C528 150 551 139 546 111Z"/>
                <path fill="#FFFFFF" d="M448 173H462C460 183 458 193 458 201C450 193 447 182 448 173ZM506 173H492C494 183 496 193 496 201C504 193 507 182 506 173Z"/>`;
            break;
        case 'scythe':
            artwork = `<path fill="${secondary}" stroke="${tertiary}" stroke-width="2.5" stroke-linejoin="round" d="M314 82C353 15 451 -2 520 29L559 57L553 75C490 32 407 32 314 82Z"/>
                <path fill="${tertiary}" d="M314 82C398 32 483 26 553 65L553 75C490 32 407 32 314 82Z"/>
                <path fill="${base}" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round" d="M474 48C448 57 433 78 431 99L438 112C416 121 408 143 402 167L384 230H573C570 196 565 171 554 146C546 128 531 117 509 111L515 98C513 76 497 57 474 48Z"/>
                <path fill="${primary}" d="M473 58C449 76 445 96 448 109L431 125L453 118L474 143L499 117L516 123L504 107C505 88 492 68 473 58Z"/>
                <path fill="${base}" d="M472 71C455 81 450 95 453 111L474 132L495 109C497 93 487 78 472 71Z"/>
                <path fill="${tertiary}" d="M462 89C469 83 481 84 487 91L487 103L482 109L481 119L467 119L465 110L459 104V96Z"/>
                <path fill="${base}" d="M462 96L471 99L468 104L463 102ZM484 96L475 99L478 104L483 102ZM473 104L470 109H476ZM470 114H472V120H470ZM476 114H478V120H476Z"/>
                <path fill="${primary}" stroke="${tertiary}" stroke-width="1.5" stroke-linejoin="round" d="M550 69L558 70L544 230H536Z"/>
                <path fill="${primary}" stroke="${tertiary}" stroke-width="2" stroke-linejoin="round" d="M543 56C550 60 557 60 563 54C563 64 559 70 557 77L546 74C548 67 546 61 543 56Z"/>
                <path fill="${tertiary}" stroke="${base}" stroke-width="1.2" stroke-linejoin="round" d="M534 135L539 127L541 121Q542 118 545 119L551 120Q555 121 555 124L554 139Q552 144 547 143L539 141Z"/>
                <path fill="none" stroke="${base}" stroke-width="1.7" stroke-linecap="round" d="M548 127L554 128M547 132L554 133M546 137L553 138M539 127L545 129L541 135"/>`;
            break;
        case 'arcane':
            accentArtwork = `<g fill="none" stroke="${secondary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M293 39H327C341 39 341 24 332 24C325 24 324 29 326 32M289 49H316C328 49 328 62 320 62M297 58H306"/></g>
                <path fill="${secondary}" fill-rule="evenodd" d="M337 83C337 98 316 110 316 126C316 139 326 146 337 146C350 146 358 136 358 125C358 111 345 100 337 83ZM337 103C332 113 326 120 326 127C326 135 332 138 337 138C345 138 349 133 349 127C349 119 342 110 337 103Z"/>
                <path fill="${secondary}" d="M291 154C294 170 280 173 287 184C287 175 297 170 301 162C301 178 318 183 316 197C315 210 303 216 292 214C276 212 267 198 273 186C276 180 280 175 279 168C287 172 288 167 291 154Z"/>
                <g fill="none" stroke="${tertiary}" stroke-width="1.5"><path d="M321 38H328M338 111C332 120 329 127 335 133M291 191C287 197 290 204 297 205"/></g>`;
            artwork = `<path fill="${primary}" stroke="${secondary}" stroke-width="3" stroke-linejoin="round" d="M446 142C416 151 407 171 390 234H568C565 196 550 162 517 143L491 135Z"/>
                <path fill="none" stroke="${secondary}" stroke-width="2" stroke-linecap="round" opacity=".45" d="M534 176C541 190 543 206 542 220M421 184L410 220"/>
                <path fill="${tertiary}" d="M444 106C439 123 443 134 437 149C430 168 446 190 460 201C456 194 453 187 451 181C460 200 474 214 484 218C503 202 520 179 521 157C521 139 510 125 510 109Z"/>
                <path fill="${base}" d="M448 108H502C505 121 500 132 491 139L479 142L467 139C455 139 448 130 448 119Z"/>
                <path fill="${tertiary}" d="M477 136C465 131 455 140 450 147C460 146 469 144 477 140C485 145 496 147 505 145C498 137 489 132 481 136L479 139Z"/>
                <path fill="${primary}" opacity=".5" d="M451 153C448 174 466 197 477 207C459 194 445 172 451 153ZM505 151C511 173 496 196 487 205C497 188 504 169 505 151Z"/>
                <path fill="${primary}" stroke="${secondary}" stroke-width="3" stroke-linejoin="round" d="M416 88C434 64 442 33 468 16C486 4 503 7 516 19C529 31 534 51 546 68C533 69 521 63 513 51C506 40 496 34 489 42C485 54 492 72 502 90Z"/>
                <path fill="${tertiary}" d="M421 79C444 71 478 77 492 84L497 91C466 83 446 80 416 85Z"/>
                <path fill="${primary}" stroke="${secondary}" stroke-width="3" stroke-linejoin="round" d="M367 95C409 97 438 78 474 84C512 88 546 109 587 99C562 119 522 124 477 115C433 108 397 123 367 95Z"/>`;
            break;
        case 'tides': {
            const crest = 'M0 215C122 203 203 226 287 195C337 176 359 139 391 97C423 55 457 31 493 34C534 37 559 65 558 98C558 113 551 126 540 136C545 118 540 101 526 94C511 86 493 91 485 106C472 129 487 157 513 172C539 187 570 192 600 190';
            artwork = `<path fill="${secondary}" d="${crest}V224H0Z"/>
                <path fill="none" stroke="${tertiary}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="${crest}"/>
                <path fill="${tertiary}" d="M390 100C422 55 457 31 493 34C534 37 559 65 558 98C558 113 551 126 540 136C545 118 540 101 526 94L533 94C526 80 515 76 505 76L512 70C498 61 482 64 472 70L475 61C447 63 420 78 390 100Z"/>
                <path fill="${primary}" opacity=".52" d="M300 198C354 175 373 138 411 104C435 83 455 75 475 75C445 89 430 109 414 134C382 180 351 195 300 198Z"/>
                <path fill="${tertiary}" d="M458 184C497 184 528 199 556 198C574 198 585 193 600 193V199C583 199 574 204 555 204C524 204 496 190 458 184Z"/>`;
            watermarkArtwork = `<path fill="${secondary}" d="M0 165C103 127 189 195 284 164C389 130 444 189 517 167C552 156 579 151 600 158V224H0Z"/>
                <path fill="none" stroke="${tertiary}" stroke-width="3" d="M0 165C103 127 189 195 284 164C389 130 444 189 517 167C552 156 579 151 600 158"/>`;
            break;
        }
        case 'mullet':
            artwork = `<defs><clipPath id="sun"><circle cx="440" cy="114" r="99"/></clipPath><linearGradient id="sunrise" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${tertiary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs>
                <g clip-path="url(#sun)" fill="url(#sunrise)"><path d="M340 15H540V94H340ZM340 101H540V120H340ZM340 129H540V145H340ZM340 155H540V168H340ZM340 179H540V189H340ZM340 200H540V207H340Z"/></g>
                <path fill="${primary}" stroke="#FFFFFF" stroke-width="3.5" stroke-linejoin="round" d="M423 90C419 76 422 59 433 49L421 45C439 40 451 34 466 26L462 38C478 29 492 28 504 31L497 41C528 45 538 62 537 82C536 96 542 109 553 111C565 114 576 107 583 97C584 119 571 132 551 132C563 140 577 137 587 128C586 150 570 164 548 161C559 173 574 178 585 174C574 196 548 205 526 195L532 210C507 207 483 196 463 183C458 180 455 175 455 168L440 171C430 173 423 167 421 161L423 153L418 150L420 146L408 140L419 125C421 118 422 110 423 103Z"/>
                <path fill="#FFFFFF" d="M437 63C454 47 485 44 506 61C516 71 519 83 518 96C515 77 501 59 480 58C465 56 450 60 437 63ZM504 112C511 139 534 155 560 149C544 160 526 151 517 140C510 131 506 122 504 112Z"/>`;
            break;
        case 'western': {
            const star = 'M0 -88L21 -29L84 -27L34 11L52 72L0 36L-52 72L-34 11L-84 -27L-21 -29Z';
            artwork = `<defs><path id="star" d="${star}"/></defs>
                <g transform="translate(487 116)" stroke-linejoin="round">
                    <use href="#star" transform="scale(1.12)" fill="${primary}" stroke="${tertiary}" stroke-width="3.5"/>
                    <use href="#star" fill="${secondary}"/>
                    <path fill="${base}" opacity=".28" d="M0 0L0 -88L21 -29ZM0 0L84 -27L34 11ZM0 0L52 72L0 36ZM0 0L-52 72L-34 11ZM0 0L-84 -27L-21 -29Z"/>
                    <path fill="${tertiary}" opacity=".2" d="M0 0L-21 -29L0 -88ZM0 0L-34 11L-84 -27Z"/>
                </g>`;
            // Keep the wide-banner echo open so the flag bands show through it.
            watermarkArtwork = `<path d="${star}" transform="translate(487 116) scale(1.12)" fill="none" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round"/>`;
            break;
        }
        case 'flight': {
            const goose = 'M462 116C489 123 517 109 538 88C550 75 564 75 573 83L588 89Q593 92 591 96Q590 99 587 99L571 101C563 96 558 98 553 105C531 135 505 151 477 151C452 169 420 172 391 162C379 158 370 152 365 148L334 153Q329 153 333 149L348 140L330 129Q326 125 332 127L365 130C390 108 429 103 462 116Z';
            const nearWingEdge = 'M414 146C398 130 385 111 374 92L361 76Q358 72 362 70L366 71L346 49Q343 45 347 43L351 44L329 24Q326 20 331 20C373 26 412 41 443 66C458 85 465 106 461 127';
            artwork = `<defs><path id="goose" d="${goose}"/></defs>
                <path fill="${secondary}" stroke="${tertiary}" stroke-width="3" stroke-linejoin="round" opacity=".7" d="M453 126C466 104 471 83 470 64C469 44 457 27 443 15C446 40 438 65 429 84C422 102 433 118 453 126Z"/>
                <use href="#goose" fill="${secondary}"/>
                <path fill="${primary}" opacity=".25" d="M365 148C398 169 443 177 477 151C451 161 419 164 393 153Z"/>
                <path fill="${base}" d="M462 116C489 123 517 109 538 88C550 75 564 75 573 83L588 89Q593 92 591 96Q590 99 587 99L571 101C563 96 558 98 553 105C531 135 505 151 477 151C469 143 465 130 462 116Z"/>
                <path fill="${tertiary}" d="M548 91C554 86 562 88 570 92L567 100C560 97 554 99 550 108L543 114C543 104 545 97 548 91Z"/>
                <circle cx="562" cy="85" r="2.3" fill="${tertiary}"/>
                <use href="#goose" fill="none" stroke="${tertiary}" stroke-width="3.5" stroke-linejoin="round"/>
                <path fill="${secondary}" d="${nearWingEdge}C449 141 431 148 414 146Z"/>
                <path fill="none" stroke="${tertiary}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" d="${nearWingEdge}"/>`;
            break;
        }
        default:
            return null;
    }
    const svg = (viewBox: string, contents: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${contents}</svg>`)}")`;
    const fadedWave = (bothEdges: boolean, contents = artwork) => `<defs><linearGradient id="wave-fade"><stop stop-color="white" stop-opacity="0"/><stop offset=".3" stop-color="white"/>${bothEdges ? '<stop offset=".7" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/>' : '<stop offset="1" stop-color="white"/>'}</linearGradient><mask id="wave-mask"><rect width="600" height="220" fill="url(#wave-fade)"/></mask></defs><g mask="url(#wave-mask)">${contents}</g>`;
    return {
        emblem: svg('0 0 600 220', treatment === 'tides' ? fadedWave(false) : artwork),
        // Main runes sit above the text scrim so their selected colours stay exact.
        ...(accentArtwork ? { accents: svg('0 0 600 220', accentArtwork) } : {}),
        // A cropped, quiet echo fills wide banners without stretching the emblem.
        watermark: treatment === 'tides'
            ? svg('0 0 600 220', `<g opacity=".18">${fadedWave(true, watermarkArtwork)}</g>`)
            : svg('260 0 340 220', `<g opacity=".18">${accentArtwork ?? ''}${watermarkArtwork ?? artwork}</g>`),
    };
}
