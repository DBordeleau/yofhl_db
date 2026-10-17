# TV switch recordings

All three source recordings are CC0 1.0. These edits use Freesound's public high-quality MP3 previews, not original WAV downloads.

Excerpts are filtered, faded, and matched to -28 dBFS RMS with a -6 dBFS peak ceiling. Outputs are mono 48 kHz, 16-bit WAV. The original recordings are longer; these short edits are for screen changes during dialogue.

- **tv-crt-click.wav**: [CRT click](https://freesound.org/people/TRP/sounds/616850/) by TRP. Excerpt 0.890 to 1.210 seconds. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **tv-relay-snap.wav**: [Relay snap](https://freesound.org/people/Fission9/sounds/693860/) by Fission9. Excerpt 0.205 to 0.445 seconds. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **tv-channel-fuzz.wav**: [Channel fuzz](https://freesound.org/people/mrs4turn/sounds/786065/) by mrs4turn. Excerpt 0.520 to 0.740 seconds. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Source hashes and exact processing settings are in `tv-switches.json`. Rebuild with `node scripts/audio/prepare-tv-switches.mjs`; see `scripts/audio/README.md` for source retrieval and FFmpeg setup.
