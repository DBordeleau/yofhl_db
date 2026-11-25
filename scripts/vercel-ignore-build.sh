#!/bin/bash
# Vercel's Ignored Build Step (vercel.json ignoreCommand): exit 0 skips the
# deployment, any other code builds. A skipped deployment stores no output.
# Skips pushes that, since the branch's last successful deployment, change only
# docs, agent notes, tests and their golden fixtures, or Coach's Corner reference
# files the site never reads.
#
# .claude/ is in .vercelignore, so the build never receives it. .gitignore cannot
# change which tracked files the build sees. Every other path here is read by a
# person or a test, never by next build. scripts/vercel-ignore-build.test.mjs
# fails if a path the site reads is added to the list.

base="$VERCEL_GIT_PREVIOUS_SHA"
# A branch's first deployment, or a base outside Vercel's 10-commit shallow clone: build.
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then exit 1; fi

if git diff --quiet "$base" HEAD -- . \
    ':(exclude)docs/' \
    ':(exclude).agents/' \
    ':(exclude).claude/' \
    ':(exclude).gitignore' \
    ':(exclude,glob)**/*.md' \
    ':(exclude,glob)**/*.test.ts' \
    ':(exclude)lib/coachs-corner/goldens/' \
    ':(exclude)assets/coachs-corner/archive/' \
    ':(exclude)assets/coachs-corner/editorial/' \
    ':(exclude)assets/coachs-corner/scripts/' \
    ':(exclude,glob)assets/coachs-corner/robots-v2/*.html' \
    ':(exclude,glob)assets/coachs-corner/robots-v2/*.css' \
    ':(exclude,glob)assets/coachs-corner/robots-v2/*.js' \
    ':(exclude,glob)assets/coachs-corner/robots-v2/*.json'; then
    echo "Only docs, tests or reference files changed since ${base:0:7}; skipping the build."
    exit 0
fi
exit 1
