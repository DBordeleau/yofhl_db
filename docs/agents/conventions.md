# Conventions

How agents work in this repo. Read this before the first write of a session.

## Attribution

Everything an agent writes is written **as the repo owner**. No `Co-Authored-By:` trailers, no "Generated with …" lines, no session links, no tool credit — in commits, pull request bodies, issue bodies, or comments. This holds even when a tool's own defaults ask for them.

## Writing

Anything a human reads goes through the `unslop` skill before it is sent or published: messages to the owner, commit subjects, PR bodies, issue and ticket bodies, review comments. Invoke it once per session, the first time you are about to write one of those.

Two limits. Where a skill or this file specifies an exact format, the format wins; apply the rules to the prose inside it. Where `GLOSSARY.md` names a thing, that name wins over a plainer word.

## Branch names

`<type>/<issue>-<slug>`:

- **type**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`.
- **issue**: the number of the issue this branch delivers. For `/implement` and for an `/implement-spec` integration branch, that's the spec's number. For an `/implement-spec` ticket branch, it's that ticket's own number, not the spec's.
- **slug**: 2–5 lowercase hyphenated words naming what the branch changes, in glossary terms where they apply. Someone should be able to guess the change from the name alone. Never positional or generic words: no `part`, `tier`, `step`, `phase`, `slice`, `wip`, `misc`, `update`, and no tool names.

Examples: `feat/42-electrum-wallet-detection`, `fix/149-candidate-floor-and-rookie-lookups`, `refactor/178-nhl-player-module`.

The `.githooks/pre-push` hook enforces this, through `scripts/git/branch-name.mjs`. It also rejects pushing `master`, which moves through merged pull requests instead. `npm run prepare` points git at `.githooks`, so a fresh clone is covered by `npm install`. The hook has its own tests: `npm run test:hooks`.

## Commit messages

**Not** Conventional Commits. The conventional prefix lives on the branch name, which the hook enforces, and once in the branch it doesn't need repeating on every subject line.

A subject is an imperative sentence in the project's own domain language, naming what the commit does to the system: "Lock the award vote's row before scoring reads the ballots". Use glossary terms. No `feat:`/`fix:` prefix, no ticket number, no trailing period. Body only when the why isn't obvious from the subject.

## Worktrees and branches

Clean up as part of finishing, not "later":

- Remove every worktree a session created, then `git worktree prune`.
- Delete ticket branches once they're merged into their integration branch. They stay local and are never pushed.
- Only integration branches and `/implement` branches reach the remote.

A skill that creates worktrees is not done until they're gone. Say so explicitly in the final report.

## Effort levels

Every ticket body opens with `Effort: medium` or `Effort: high`, and each ticket's effort is shown in the breakdown the user approves.

`high` when the ticket:

- changes data shape or storage (schemas, migrations);
- touches auth or sessions;
- adds or changes a cron, or anything that affects hosting cost;
- is the deepened module itself in a refactor;
- covers code with no existing tests.

`medium` for everything else: UI wiring, styling, copy, new routes, and tickets that copy a pattern another ticket already set up.

The effort sets how much reasoning a sub-agent gets. In Claude Code, map it to the sub-agent types the machine-level policy defines; in other tools, map it to that tool's reasoning-effort setting. Merger sub-agents and the fix-up after `code-review` follow the same mapping: mergers take the `medium` setting, the post-review fix-up takes `high`.
