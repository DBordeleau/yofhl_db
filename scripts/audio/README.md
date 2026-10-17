# Coach's Corner audio tools

## Full episode audio scan

With the dev server running, build the local browser diagnostic:

```powershell
node scripts/audio/build-episode-scan.mjs
```

Open `http://localhost:3000/coachs-corner/episode-scan-temp.html`. It uses the
bundled opening-week screenplay, current default bank and real audio engine in
Chromium's offline renderer. It checks the complete stereo mix, dialogue,
ambience and effects separately, including every syllable and the end-card
silence. A missing sample, clipping, invalid values, inaudible cues, dialogue less
than 10 dB above ambience, or a render exceeding 30 seconds fails the scan. The
page offers a full WAV and JSON report; playback is optional and never automatic.

The scanner schedules one second ahead in one continuous context. The original
scan queued the whole episode's oscillator/filter graph before rendering and
stalled. Scheduling incrementally keeps the graph small without resetting room
tone or compressor state at boundaries. A 20-second comparison against the old
scheduler checks for audible changes, and the full run checks the graph stays
bounded. This verifies generated audio; it does not grade the creative performance
or simulate real-time playback on slow devices.

Remove the generated diagnostic page after downloading the results:

```powershell
node scripts/audio/build-episode-scan.mjs --clean
```

## FFmpeg

FFmpeg is installed locally in `.cache/audio-tools/`. It does not change the
system PATH or add application dependencies. Other threads working in this
checkout can call it through the wrapper:

```powershell
node scripts/audio/ffmpeg.mjs -version
node scripts/audio/ffmpeg.mjs -i input.wav -af "afade=t=out:st=0.5:d=0.1" output.wav
```

On a fresh Windows checkout, run `./scripts/audio/install-ffmpeg.ps1`. It installs
Gyan's release essentials build, a provider linked by the
[FFmpeg download page](https://ffmpeg.org/download.html), and checks the publisher's
SHA-256 before extraction. On other systems use an installed `ffmpeg`, or set
`FFMPEG_PATH` to the executable.

## Freesound

No account, API key, subscription, or MCP server is needed for these clips.
The importer reads a single public sound page and downloads the **high-quality
MP3 preview exposed by that page**. These are compressed source previews, not the
original WAV files. Freesound requires login for original-file downloads.

```powershell
node scripts/audio/freesound.mjs https://freesound.org/people/martian/sounds/19291/
node scripts/audio/freesound.mjs https://freesound.org/people/zazz.sound.design/sounds/435292/
node scripts/audio/freesound.mjs https://freesound.org/people/zazz.sound.design/sounds/435296/
node scripts/audio/prepare-tie-rustles.mjs

node scripts/audio/freesound.mjs https://freesound.org/people/TRP/sounds/616850/
node scripts/audio/freesound.mjs https://freesound.org/people/Fission9/sounds/693860/
node scripts/audio/freesound.mjs https://freesound.org/people/mrs4turn/sounds/786065/
node scripts/audio/prepare-tv-switches.mjs
```

The importer only accepts pages explicitly marked CC0. Source files and provenance
are saved under `.cache/freesound/`; final edits and credits live under
`public/coachs-corner/audio/`. It makes a page request and a preview request per
sound, without crawling search results. For broader automated search, use the
[official Freesound API](https://freesound.org/docs/api/overview.html) with your
own credential; its [free API license is noncommercial](https://freesound.org/docs/api/terms_of_use.html).

The preview's **Compare cloth rustles** buttons load a prepared clip, select B,
restore the tie level to 100%, and replay 0.7 seconds before the tie movement.
Choosing a different clip uses the same timeline and level. The selected sound
remains in B for subsequent playback; Reset or reloading restores cloth rustle 7,
which is now the default in episodes too. File paths and credits are in
`lib/coachs-corner/tie-rustles.ts`.

**Compare TV switches** works the same way for the first screen changes. CRT click,
Relay snap, and Channel fuzz are 0.22 to 0.32 seconds long, filtered to remove
rumble and high CRT whine, and matched to -28 dBFS RMS with a -6 dBFS peak ceiling.
File paths and source links are in `lib/coachs-corner/tv-switches.ts`; the generated
`TV-SWITCH-CREDITS.md` and `tv-switches.json` record the source hashes and edits.
The TV choices only change B. A keeps the approved episode mix and original TV cue.
