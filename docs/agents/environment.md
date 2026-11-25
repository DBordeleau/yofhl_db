# Environment

Things about this machine and repo that cost an agent a wasted turn each time it rediscovers them. Add to this file whenever a session loses a turn to the environment rather than to the problem.

## Shell

The shell is PowerShell on Windows, with a POSIX `bash` tool also available. They take different syntax and the mistakes are expensive:

- Don't mix them in one command. Pick the shell, then write that shell's syntax throughout.
- In PowerShell, `&&` and `||` don't exist: use `A; if ($?) { B }`. No ternary, no `??`, no `?.`.
- For a multi-line string passed to a native command, such as a commit message or an issue body, use a single-quoted here-string with the closing `'@` at column 0, or a `bash` heredoc. An unbalanced quote in a long `-m` string is the most common failed call in this repo's history.
- Backticks inside a double-quoted `bash` string run as command substitution. Single-quote any string holding Markdown backticks, or write the file with a file-writing tool instead.
- Prefer the file-reading and search tools over `Get-Content`, `Select-String` and `cat` pipelines.

## Running the app

`npm run dev` serves the site on port 3000. `.claude/launch.json` holds that as the `next-dev` configuration, so a preview can start it by name.

`predev` and `prebuild` run `npm run coachs:assets` first, so the first start after pulling new Coach's Corner art takes longer.

Expect the first navigation to a new localhost port to need permission. Don't retry a denied navigation; ask once.

## Worktrees

Sessions run in worktrees under `.claude/worktrees/`. A file outside the session's own worktree may be refused, so read and write through the session's own path and don't reach into another worktree's copy of the repo.

`.cache/` holds checkouts made by the Coach's Corner verification scripts. Never search or edit inside `.cache/` or `.claude/worktrees/`: a recursive grep over either one hits ten copies of the repo and times out. Scope every search to `app/`, `lib/`, `components/`, `scripts/`, `db/` or `docs/`.

## Checks

- Typecheck: `npx tsc --noEmit`. There is no `typecheck` script.
- Full test suite: `npm test`.
- One area: `npm run test:<area>`, where the areas are in `package.json`. `test:data`, `test:pickem`, `test:award-vote`, `test:coachs`, `test:season-sync`, `test:keepers` and others.
- Lint: `npm run lint`.
- The branch-name hook's own tests: `npm run test:hooks`.

Run the typechecker and the one relevant area inside the sub-agent doing the work. Run the full suite once, at the end, in a sub-agent of its own.
