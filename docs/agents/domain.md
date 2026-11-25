# Domain Docs

How the skills should consume this repo's domain documentation when exploring the codebase.

This is a single-context repo.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read the ADRs that touch the area you are about to work in.

`PRODUCT.md` and `DESIGN.md` at the root describe what the site is for and how it looks. Read them when the work is user-facing.

If a file doesn't exist, **proceed silently**. Don't flag its absence and don't suggest creating it upfront. The `domain-modeling` skill, reached through `/plan-with-me`, creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md
├── PRODUCT.md
├── DESIGN.md
├── docs/adr/
│   ├── 0001-team-identity-in-database-views.md
│   └── ...
└── app/
```

## Use the glossary's vocabulary

When your output names a domain concept, in an issue title, a refactor proposal, a hypothesis, a commit subject, a branch slug or a test name, use the term as `GLOSSARY.md` defines it. Don't drift to synonyms the glossary avoids.

If the concept you need isn't in the glossary yet, that's a signal. Either you are inventing language the project doesn't use, which means reconsider, or there's a real gap, which means note it for `domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it rather than silently overriding it:

> _Contradicts ADR 0006 (player IDs are stored bare), but worth reopening because…_
