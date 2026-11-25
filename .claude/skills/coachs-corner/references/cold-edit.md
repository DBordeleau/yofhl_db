# Cold edit

The same writer does this pass, so make it a real change of role: reread the pilot first, then read the draft top to bottom as a viewer would, not as its author. Write findings to `review.md` with line numbers. Say plainly that the writer and editor were the same model.

## Run the check, then read the flags

`npm run coachs:check -- --slug <slug>`. Fix every error. For each voice flag, go to the lines it names and decide whether the scene earns it. A quiet episode can be right; a Ron paragraph almost never is.

## Questions, with the pilot as the answer key

For each, find the draft's best and worst example and compare it with the pilot line named.

1. **Does Ron correct, or argue?** Pilot: "Five more player games." / "We aren't." / "It's a keeper league." Any Ron line that explains, lists three players, or makes a case: cut it to the one fact Don will react to.
2. **Does Don lose the thread, and does Ron repair it in a few words?** Pilot: "Who took him?" → "Jeremy. Hooterville." / "We'll get to him." → "We're on him now." No lapse at all means the draft is missing Don's signature.
3. **Does Don erupt, and when?** Pilot: "!!I KNOW IT'S A KEEPER LEAGUE, RON.!!" A correction of Don should feel like an attack to him. Check the yells are where he's provoked, not scattered.
4. **Is Don ever reasonable?** If he says "Fair," concedes cleanly, or explains in orderly sentences, rewrite it so he narrows his claim instead. Pilot: "You can be smart and lose. I coached Boston." / "Don't start."
5. **Is there something Don sincerely loves?** Specific and physical: "Seventy-six. Big fella. Goes to the net." Warmth makes the rants believable.
6. **Do the hosts interrupt?** Lines ending `--` where someone cuts in. The pilot has a dozen.
7. **Could this joke have been written without this week's facts?** If yes, replace it with something only this week could produce.
8. **Is anything from the pilot or a recent episode being replayed rather than developed?** Same trigger, same punchline, same ending: change it.
9. **Names.** Every named player in `pronunciations.json` with birthplace evidence. Don uses his wrong form for everyone born outside North America, except players who have represented Canada (sourced `teamCanada` entry); Ron and cards use the real name.
10. **Facts.** Read every number on screen and every factual Ron line against `facts.json` or a dated source in `brief.md`. Points vs fantasy points, games vs player games, final vs in-progress. A deliberate Don exaggeration is fine if the audience can tell; note it.
11. **Owner's notes.** Every "must include" is in, or its gap is explained.
12. **Shape.** The opening starts an argument, the middle develops one obsession, the ending closes something from this episode.

## Then rewrite

Name the weakest exchange in `review.md` and rewrite it in `script.txt`. Rerun the check. One pass; then deliver and let the owner's notes drive the next one.
