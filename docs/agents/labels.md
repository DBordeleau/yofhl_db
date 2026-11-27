<!-- /setup-workflow wrote this from DBordeleau/skills@126a5a1, fragments/labels.md. Edit it freely: an update merges only what changed upstream. -->

# Labels

The label vocabulary the skills use in this repo. When a skill says "label it a spec that is ready to implement", it means the strings in this table.

| Role | Label | Meaning |
| --- | --- | --- |
| Needs planning | `needs-planning` | Needs a spec, a decision or a plan before work can start |
| Ready to implement | `ready-for-implementation` | Fully specified; anyone, agent or human, can pick it up |
| Spec | `spec` | A full, self-contained spec |
| Ticket | `ticket` | A small piece of work, part of a bigger spec |
| Needs info | `needs-info` | Waiting on the reporter for more information |
| Won't fix | `wontfix` | Will not be actioned |
| Bug | `bug` | Something isn't working |

Colours, when creating them: `needs-planning` `fbca04`, `ready-for-implementation` `0e8a16`, `spec` `5319e7`, `ticket` `c5def5`, `needs-info` `d876e3`, `wontfix` `ffffff`, `bug` `d73a4a`.

## Which label goes on what

- **Anything filed that hasn't been planned and specced** gets `needs-planning`: architecture-review findings, bug reports, follow-ups, ideas. Planning an issue without running `/to-spec` leaves it at `needs-planning`.
- **`/to-spec` on an existing issue** removes `needs-planning` and adds `ready-for-implementation` + `spec` in the same edit that rewrites the body. A spec it files from scratch gets `ready-for-implementation` + `spec` only.
- **`/to-tickets`** gives every ticket it files `ready-for-implementation` + `ticket`.
- **`report-bug`** gives every bug report it files `bug` + `needs-planning`.
- **`/diagnose`** keeps `bug` on every bug report it diagnoses into a fix spec. Both fix exits, "fix now" and "spec and stop", remove `needs-planning` and add `ready-for-implementation` + `spec` in the same edit that rewrites the body as the fix spec. A bug report it cannot reproduce gets `needs-info` beside `needs-planning`, and a rerun of `/diagnose` removes `needs-info`. Behaviour that is intended or not worth fixing gets `wontfix`, loses `needs-planning`, keeps `bug`, and is closed. A missing feature or a design change loses `bug` and keeps `needs-planning`.
- **`/implement` on a fix spec whose root cause proves wrong, or whose fix fails three attempts,** removes `ready-for-implementation` + `spec` and adds `needs-planning`, keeping `bug`, so the issue goes back to `/diagnose`.
- Other issue-type labels the repo already uses (`enhancement`, `refactor`) are orthogonal: keep them, and don't replace one with a label from this table.

Create any of these the tracker is missing before the first label write of a session.

If the tracker already has a label that fills one of these roles under another name, **rename it rather than creating a second one**. A rename carries every issue already carrying it; a create leaves them on the old label, which is how two vocabularies end up competing. On GitHub: `gh label edit "<old>" --name "<new>" --description "..."`. Check first how many issues hold the old name, and say the number.
