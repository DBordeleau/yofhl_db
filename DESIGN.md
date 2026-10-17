---
name: YOFHL DB
description: The league's home, dressed as a hockey broadcast: navy, rink red, ice and gold, set in Archivo on its width axis.
colors:
  rink-red: "#C8102E"
  slab-red-top: "#DF1A3C"
  slab-red-deep: "#B00D28"
  red-bright: "#E8213F"
  broadcast-navy: "#101D32"
  broadcast-black: "#050C18"
  ink: "#12182E"
  ink-soft: "#3A4560"
  ink-muted: "#56627A"
  ink-faint: "#6B778E"
  ice: "#F4F8FB"
  white: "#FFFFFF"
  line: "#DCE5EE"
  line-soft: "#E6EDF4"
  line-strong: "#C9D6E3"
  rink-blue: "#1F6FC2"
  rink-line: "#3D8BDA"
  rink-wash: "#EAF2FA"
  sky-stroke: "#B6DCF5"
  score-ice: "#C3E3F7"
  gold: "#B8860B"
  gold-light: "#F0C75E"
  gold-deep: "#8A6410"
  gold-tint: "#FFF3CC"
  arena-night: "#070B18"
  studio-navy: "#0D1430"
  rail-navy: "#0C1330"
  plate-ice: "#F6F9FC"
  ron-navy: "#24418F"
  ron-signal: "#3F6FD6"
  focus-on-dark: "#7FB2FF"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(100px, 10.5vw, 156px)"
    fontWeight: 950
    lineHeight: 0.82
    letterSpacing: "-0.045em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 92"
  section:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 850
    lineHeight: 1.15
    letterSpacing: "-0.055em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  body-strong:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 750
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.12em"
  rank:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 80"
  slab:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 118"
  broadcast-condensed:
    fontFamily: "Barlow Condensed, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
  cc-title:
    fontFamily: "Archivo Italic, Archivo, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 50px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  cc-plate:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "max(13px, 1.85cqw)"
    fontWeight: 560
    lineHeight: 1.25
    letterSpacing: "-0.005em"
rounded:
  none: "0px"
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "#D41536"
    textColor: "{colors.white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: "15px 21px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "#ED2346"
  button-ice:
    backgroundColor: "{colors.score-ice}"
    textColor: "#173C59"
    rounded: "{rounded.sm}"
    padding: "15px 21px"
    height: "54px"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    size: "40px"
  slab-red:
    backgroundColor: "{colors.rink-red}"
    textColor: "{colors.white}"
    typography: "{typography.slab}"
    rounded: "{rounded.none}"
    padding: "2px 28px 0 26px"
    height: "44px"
  slab-navy:
    backgroundColor: "{colors.broadcast-black}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "8px 22px 6px 20px"
  tab-bar:
    backgroundColor: "{colors.broadcast-navy}"
    textColor: "#A9B8CF"
    rounded: "{rounded.none}"
    height: "58px"
  tab-bar-active:
    backgroundColor: "{colors.rink-red}"
    textColor: "{colors.white}"
  select-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "58px"
    width: "210px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.md}"
  nav-item:
    textColor: "#46566C"
    padding: "0 15px"
  nav-item-active:
    textColor: "{colors.ink}"
  cc-speech-plate:
    backgroundColor: "{colors.plate-ice}"
    textColor: "{colors.ink}"
    typography: "{typography.cc-plate}"
    rounded: "3px"
    padding: ".55em .8em .6em"
  cc-tag-don:
    backgroundColor: "{colors.rink-red}"
    textColor: "{colors.white}"
    padding: ".2em .75em .15em"
  cc-tag-ron:
    backgroundColor: "{colors.ron-navy}"
    textColor: "{colors.white}"
    padding: ".2em .75em .15em"
  cc-control-rail:
    backgroundColor: "{colors.rail-navy}"
    textColor: "#C3CFE4"
    padding: "10px 14px"
  cc-rail-button:
    textColor: "#C3CFE4"
    rounded: "8px"
    size: "40px"
  cc-rail-button-hover:
    backgroundColor: "#1B2754"
    textColor: "{colors.white}"
  cc-play-slab:
    backgroundColor: "{colors.rink-red}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    size: "46px"
  cc-play-slab-hover:
    backgroundColor: "#E01535"
  cc-clock:
    backgroundColor: "{colors.studio-navy}"
    textColor: "{colors.white}"
    padding: ".25em .7em .2em"
  cc-clock-overtime:
    backgroundColor: "{colors.rink-red}"
---

# Design System: YOFHL DB

## Overview

**Creative North Star: "Intermission Broadcast"**

YOFHL DB is dressed as a hockey broadcast for one friend group. Reading surfaces are cold and clear: ice background, white panels, navy ink. The broadcast moments sit on deep navy stages: heroes, the ticker, matchup cards, the record holder, the trophy case, Coach's Corner. Those moments use the TV graphics package: red and navy parallelogram slabs, arena banner stripes, italic wide Archivo, gold for things that were won.

Density is broadcast-dense, not dashboard-dense. Big italic display type and heavy condensed numerals carry the hierarchy, so labels can stay small and few. Copy is lean: no counters, no subtitles that repeat the title. Team logos and team colours are the imagery. The league's own clubs tint panels, matchup sides and roster sheets through `color-mix` against navy, so a surface takes on a club's colour without leaving the house palette.

Motion is sparse and has a reason. Entrances rise or slide in once. Hover gets small physical nudges: arrows slide, banners tilt, cups lift. The few loops that exist (ticker scroll, trophy sparkles, chase-bulb letters, the scoreboard dot sweep, the hosts' idle breathing) are slow, single, or staggered so that nothing beats in unison. Every animated surface has a `prefers-reduced-motion` branch.

**The Off-Beat Rule.** No two elements loop on the same beat. Repeating motion gets a different period per element, a per-item delay (`calc(var(--i) * 70ms)`), or randomised timing. The test: if two things pulse together on screen, one of them is wrong.

**The No Live Dot Rule.** Never use a pulsing dot to mean "live" or "now". Show state with type, colour and position: a red phase bar, a red overtime clock, letters lit in sequence like scoreboard chase bulbs, then a rest.

**Key Characteristics:**
- Ice and white for reading, deep navy for broadcast moments.
- Red and navy parallelogram slabs as the signature form.
- Archivo on its width axis: expanded italic for display, condensed for numbers, tabular figures for every stat.
- Gold only for honours: champions, first place, playoff weeks, record chases.
- Light builds the depth (beams, spotlights, glows on navy). Shadows stay soft and few.
- Motion runs once, off-beat, and always has a reduced-motion branch.

## Colors

Cold rink neutrals with one hot red, a broadcast navy for stages, and gold kept for honours.

### Primary
- **Rink Red** (rink-red): the league's voice. Fills slabs, the primary action, the active tab, the nav's active underline (3px), first-place rank numerals, the playoff line, Don's tag and Don's yell. The slab gradient runs **Slab Red Top** to **Slab Red Deep** (180deg) with a `#5A0010` 1px text shadow. **Red Bright** (red-bright) is the same red lifted for use on navy: the rank-1 numeral, the active menu index, the archive band stripe.

### Secondary
- **Broadcast Navy** (broadcast-navy): stage colour for heroes, the archive band, the tab bar and the record hero. **Broadcast Black** (broadcast-black) is the darker plate that sits flush beside a red slab (ticker round, live score badge, record unit).
- **Arena Night** (arena-night), **Studio Navy** (studio-navy), **Rail Navy** (rail-navy): Coach's Corner's darker stage family, from the page background through monitor graphics to the control rail.

### Tertiary
- **Gold** (gold), **Gold Light** (gold-light), **Gold Deep** (gold-deep), **Gold Tint** (gold-tint): Jagr Cup honours. Metallic gradients (`#F7D774 → #B8860B`), champion counts, record-chase lanes, playoff-week vs badges, award highlight rows (gold-tint). On navy use gold-light. On white use gold-deep for text.
- **Rink Blue** (rink-blue): inline links and hover colour on light surfaces. **Rink Line** (rink-line): the blue band of the banner stripes and the focus ring on light surfaces (3px solid). **Rink Wash** (rink-wash): faint blue fills.
- **Sky Stroke** (sky-stroke) and **Score Ice** (score-ice): pale ice blues for use on navy. They stroke outlined type, light the lead meter and fill the secondary hero button.

### Neutral
- **Ice** (ice): page background everywhere except Coach's Corner.
- **White** (white): panels, tables, header, dialogs.
- **Ink** (ink), **Ink Soft**, **Ink Muted**, **Ink Faint**: text from headings down to captions. Ink Faint is the lowest text tone; don't go lighter for text on white.
- **Line**, **Line Soft**, **Line Strong**: borders, row dividers, input strokes (Line Strong, 1.5px).
- **Plate Ice** (plate-ice): Coach's Corner speech plates.

### Named Rules
**The Red Is The Voice Rule.** Rink red marks the one thing that speaks on a surface: the primary action, the active state, the leader, the yell. Never use it for body text or for decorative borders on reading surfaces.

**The Gold Is Earned Rule.** Gold means something was won or is being chased: a championship, first place, a playoff week, a record. It never decorates ordinary data.

**The Club Colour Rule.** Team colours enter through `color-mix` with navy (typically 20 to 88% club colour). They tint the stage but never replace it, so any club's palette stays legible under white type.

## Typography

**Display Font:** Archivo variable with the `wdth` axis (system-ui, sans-serif fallback). Coach's Corner also loads the true Archivo italic (`--font-cc-italic`) for its display lettering and mocking asides.
**Label Font (scoped):** Barlow Condensed 600/700/800, italic and upright, used only for the home matchup cards and roster sheet (`--font-matchup-display`).

**Character:** One family stretched to play every role. Wide italic is the arena voice. Condensed heavy numerals read as the scoreboard. Plain upright Archivo carries the reading.

### Hierarchy
- **Display** (950 italic, clamp(100px, 10.5vw, 156px), 0.82, wdth 112 to 125%): page heroes. The records title is the same voice at 116px, uppercase. A second line may be set as outlined type: transparent fill, 2px Sky Stroke, wdth 100%.
- **Headline** (900 italic, 40 to 54px, about 0.95, wdth 88 to 92%, uppercase): record names, featured chase names, dialog titles.
- **Section** (850, 27px, 1.15, -0.055em): section headings on light pages.
- **Title** (800, 20px): panel and sub-section headings.
- **Body** (400 to 750, 13 to 16px): tables, rows, prose. Names in rows use 750 to 800.
- **Label** (750 to 800, 10 to 12px, 0.12 to 0.16em tracking, uppercase): table heads, field labels inside selects, stat units. Labels name the data under them; they are not decoration.
- **Rank / Numerals** (900, 20 to 32px, wdth 75 to 85%, often italic, tabular): ranks, scores, points.
- **Slab** (900 italic, wdth 115 to 125%, uppercase, -0.01 to -0.035em): text set on red or navy slabs.

### Named Rules
**The Width Axis Rule.** Use the width axis for meaning. Expanded (112 to 125%) is broadcast display and slabs. Condensed (75 to 85%) is ranks and scores. Every stat uses tabular figures (`.tabular`).

**The Outlined Second Line Rule.** When a display title has two parts, the second may drop to outlined Sky Stroke type, as on the home hero, the records title and the archive years. It is only ever the secondary line.

## Layout

The page width is `clamp(1200px, 92vw, 2240px)` (`--page-width`). Side gutters step down 32px → 24px (≤800px) → 18px (≤600px) → 16px (≤650px on records). Sections are separated by about 34 to 48px. Grids use `minmax(0, 1fr)` columns. Cards and tiles use container queries (`container-type: inline-size`) so their type scales with the tile, not the viewport.

Breakpoints: 600/650px phone, 800px, 1024px (desktop nav and docked ticker), 1100px (two-column grids collapse), 1280px, plus `3xl` 1800px and `4xl` 2400px for big displays.

**The Scale-Up Rule.** At 1800px and 2400px, everything scales up: type, rows, badges, banners. Nothing just spreads apart. A wide screen should look like the same broadcast at a larger size.

Coach's Corner uses its own stage geometry, described under Components.

## Elevation & Depth

Depth comes from light on navy, not stacked shadows. Navy stages get radial spotlights (`radial-gradient(90% 140% at 10% 0%, #26365F, #12182E 65%)`), soft beams falling on the leading side, gold pools under trophies, and glows around lit meters. Light reading surfaces stay flat: white panels with a 1px Line border. Shadows are long, soft and negative-spread, and they sit only under things that float above the page.

### Shadow Vocabulary
- **Card drop** (`box-shadow: 0 24px 48px -36px rgba(31, 39, 69, 0.35)`): Tailwind `shadow-card`, under raised light panels.
- **Mega menu** (`box-shadow: 0 40px 60px -30px #0b142673`): the header's dropdown.
- **Ticker** (`box-shadow: 0 12px 26px #0b142630, inset 0 -1px 0 #ffffff0d`): broadcast bars that float over the page.
- **Feature panel** (`box-shadow: 0 30px 60px #050c1866`): navy feature panels inside navy heroes.
- **Red glow** (`box-shadow: 0 4px 20px #c8102e25`): the primary hero button.
- **Drawer** (`box-shadow: -25px 0 90px #10203a30`): side dialogs.

### Named Rules
**The Lit Set Rule.** On navy, add depth with light: spotlights, beams, glows, drop-shadow filters on cutouts. On ice, stay flat with a hairline border. Never put a hard offset shadow anywhere.

## Shapes

Corners are tight. Controls use 4px, panels 6px, record panels and the Coach's Corner archive 10px, and the Coach's Corner player frame 12px. Round shapes are reserved for pager and close buttons (44px circles), portraits and the puck.

The signature form is the parallelogram slab, cut with `clip-path: polygon(Npx 0, 100% 0, calc(100% - Npx) 100%, 0 100%)`. Small badges (vs, position code, pips) use a 5 to 6px cut and large slabs (brand plate, tab bar) a 14px cut. Percentage cuts (5 to 10%) are used where a slab scales with its container. When two slabs sit side by side they share the slant and butt together, red then navy.

Banner cloth uses a pennant clip: `polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%)`.

**The Parallelogram Rule.** A slab is a skewed clip-path, never a rounded pill. Adjacent slabs share one slant so they sit flush. Leader bars and the active tab inherit the slant of the bar they sit in.

**The Banner Stripe Rule.** The arena stripe is red, white, blue in the ratio 5 : 4 : 5 (`linear-gradient(#C8102E 0 5px, #FFFFFF 5px 9px, #3D8BDA 9px 14px)`, `.banner-stripes`). It may scale proportionally (36/28/36%), but the order and colours never change.

## Components

### Buttons
Square-shouldered and confident.
- **Shape:** gently squared (4px). Slab buttons have no radius; they are cut.
- **Primary:** rink red fill, white 800 text, 54px tall in heroes (47px elsewhere), with a soft red glow. Hover lifts to a brighter red.
- **Ice:** Score Ice fill with deep blue text, for the secondary hero action.
- **Outline / stepper:** white, 1px `#D4DEE9` border, 36 to 40px square. Hover fills `#E6EEF7`. Disabled drops to 0.35 opacity.
- **Focus:** 3px solid Rink Line outline, 2 to 4px offset, on every interactive element on light surfaces.
- **Arrows:** link arrows nudge 3 to 4px in their direction on hover and focus (`.nudge-*`, `cubic-bezier(.33, 1, .68, 1)`, .3s).

### Tabs (slab bar)
A navy parallelogram bar split into equal segments. The active segment is a red slab with the same slant, slid underneath the label. Labels are 900 italic uppercase, wdth 108%, `#A9B8CF` at rest and white when active.

### Inputs / Fields
- **Style:** white field, 1.5px Line Strong border, 6px radius, 58px tall. A tiny uppercase label (10px, 0.14em) sits inside the top-left corner and the value sits below it at 15px/750. A custom chevron is drawn with borders.
- **Hover / Focus:** border turns navy on hover. `:focus-within` gets the 3px Rink Line outline.
- **Disabled:** 0.55 opacity with a wait cursor.

### Cards / Containers
- **Light panels:** white, 1px Line border, 6px radius, no shadow. Table heads use `#EAF0F6` with label type.
- **Navy panels:** gradients from `#172A4C` to `#0B1628`, a `#FFFFFF1C` hairline, 6 to 10px radius. A 2 to 3px red-to-blue top rule (`linear-gradient(90deg, #C8102E 0 32%, #4A8BCC)`) marks broadcast bands.

### Navigation
White header with a 1px Line bottom border. Items are 15px/650 `#46566C`. The active or open item turns Ink and gets a 3px Rink Red underline flush to the border. A mega menu drops a white sheet with group lists, leader rows (condensed rank numerals, gold for first), team tiles and miniature Jagr Cup banners. On mobile it becomes an accordion with 56px rows and a red chevron. Above 1800px everything scales up.

### Jagr Cup Banners
Navy pennants hung from a rafter bar on a cord. Each shows the year, the team in wide uppercase and the owner, with the banner stripes across the lower cloth. On fine pointers, hover tilts the banner −2deg with a spring (`cubic-bezier(.3, 1.4, .5, 1)`) and shifts the cloth to Rink Blue. Void seasons are pale and don't move.

### Coach's Corner (signature surface)
An intermission studio above a dim arena. The interface recedes and the show leads. The page sits on Arena Night with a `#17224A` radial glow at the top. A one-line title row (cc-title, 900 italic wdth 125%, uppercase) sits beside a red episode slab. The archive below is a navy list (`#0D1430` rows, 1px `#1A2448` gaps, 10px outer radius) with condensed week numerals that turn `#FF5A6E` on the current episode.

- **Studio set:** a 16:9 frame (4:5 under a 640px container width) with 12px top corners. Every position is a percentage of the frame and in-frame type uses container units, so the whole set scales as one picture. Layers, back to front: arena SVG with a slow ice sweep, sparse random flashbulbs (never two at once), studio glass with mullions, a soffit with warm lamps, the monitor spill, the hosts, the desk. The desk is navy lacquer with a 7% top rail, a front panel carrying the banner stripes at 85% opacity, and a red COACH'S CORNER slab in italic wdth 125%. A soft-light key layer warms from the left and cools from the ice.
- **Camera:** a virtual camera with shots `wide`, `don`, `ron`, `close don/ron` and `monitor`. It moves by clamped translate and scale over .7s `cubic-bezier(.2, .75, .15, 1)`. A yell adds a .9s punch-in toward the speaker and a .42s frame jolt. Close-ups flip the plates below the face.
- **Hosts:** square transparent cutouts anchored to the bottom. Poses crossfade in ≤180ms (default 120ms): the outgoing pose holds until the incoming one is opaque, so outlines never double. Idle breathing runs on different periods per host (3.9s and 4.7s, with an offset). Speaking gestures (bob, shake, nod, sway) belong to the host who is speaking. The listener flinches once on a yell.
- **Speech plates:** Plate Ice slabs (3px radius, soft drop) with a pointer toward the speaker and a skewed speaker tag above (Don in Rink Red, Ron in Ron Navy, 0.62em 850 uppercase, wdth 115%). The inactive plate recedes to 0.58 opacity, 0.93 scale and lower saturation. On phones only one plate shows at a time, in the band between the monitor and the hosts. A yell knocks the other plate sideways once.
- **Delivery typography:** words reveal at speaking cadence, and each delivery has its own type. **Normal** rises .3em over .17s. **Yell** is 1.3em, 900, wdth 112% and Rink Red: it slams in from 1.75× and shakes six times, then stops. **Sneak** is .78em, 520, wdth 82%, Ink Muted, with a 90ms fade. **Deadpan** is 500, wdth 94%, `#2B3550`, with no entrance. **Firm** is 820, wdth 104%, stamped in. **Mock** is true italic 600 Ink Soft and waves four times with per-word offsets. **Warm** is 640 Gold Deep.
- **Monitor graphics package:** a bezelled 16:9 screen hung top-centre. Cuts get a .2s scanline wipe and a .32s brightness-in. Graphic types: off, static, bars, logo, title, team, matchup, pick, stat, list. Each uses navy radial panels, red slabs, banner stripes, team logos and club colours mixed with navy. The matchup splits into two club-coloured parallelograms with a red VS slab that scales in. The pick slides a red number slab in from the left. List rows enter with a 40ms stagger. The screen's glow takes the current graphic's club colour.
- **Broadcast overlays:** a red show bug bottom-left and a navy segment clock bottom-right, both small skewed slabs with tabular figures. The clock turns Rink Red in overtime. A chyron (navy with a red inset edge) wipes on and off, in fullscreen only.
- **Bumper:** red and navy skewed slabs slide in from opposite sides, two words of wide italic follow from opposite directions, banner stripes draw across, then the card wipes out on a slant. It lasts about 2.6s.
- **Poster / end card:** before play, a centred red Play slab carries the episode title and runtime over a dim vignette. Hover brightens it to `#E01535` and scales it 1.05.
- **Control rail:** Rail Navy, flush under the frame (12px bottom corners). Transport buttons are 40px, 8px radius, `#C3CFE4`, filling `#1B2754` on hover. Play is a 46px red slab. The scrub track is a barcode of who speaks when (Don red, Ron Signal blue) with gold scene ticks, a light played wash and a white 3px head. Time and speed are set 800 tabular. A small legend sits under the rail. Under a 640px container width the rail wraps to scrub on top and transport, time and options below.
- **Focus:** `#7FB2FF` 3px outline inside the player, since Rink Line is too dim on navy.

## Do's and Don'ts

### Do:
- **Do** put broadcast moments on navy stages and keep reading surfaces on Ice with white panels and 1px Line borders.
- **Do** cut slabs with a parallelogram clip-path and keep one slant across slabs that touch, red then navy.
- **Do** use the width axis for meaning: wdth 112 to 125% italic for display and slabs, 75 to 85% for ranks and scores, tabular figures for every number.
- **Do** keep the banner stripe red / white / blue at 5 : 4 : 5.
- **Do** keep gold for honours: champions, first place, playoff weeks, records.
- **Do** tint with club colours through `color-mix` with navy.
- **Do** stagger or randomise any repeating motion, and give every animation a `prefers-reduced-motion` branch.
- **Do** scale everything up at 1800px and 2400px instead of letting it spread apart.
- **Do** give every interactive element a 3px focus outline: Rink Line on light surfaces, `#7FB2FF` on navy.

### Don't:
- **Don't** use pulsing "live" dots, or any repeating animation that runs in unison across elements.
- **Don't** round a slab into a pill or a soft card. Slabs are cut, not curved.
- **Don't** use hard offset shadows. Depth on navy comes from light, and depth on ice from a hairline.
- **Don't** add a decorative tracked-caps kicker above a heading. Labels name the data below them; they never introduce a title.
- **Don't** dim a team that is only trailing. Desaturate only a finished loser, and only slightly (`saturate(.75) brightness(.88)`).
- **Don't** change the site footer.
- **Don't** let Coach's Corner pose crossfades run longer than 180ms, or let two poses show at once.
