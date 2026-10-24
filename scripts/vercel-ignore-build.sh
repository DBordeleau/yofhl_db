#!/bin/bash
# Vercel's Ignored Build Step (vercel.json ignoreCommand): exit 0 skips the
# deployment, any other code builds. A skipped deployment stores no output.
# Skips pushes that, since the branch's last successful deployment, change only
# docs, agent notes, tests, or Coach's Corner reference files the site never reads.

base="$VERCEL_GIT_PREVIOUS_SHA"
# A branch's first deployment, or a base outside Vercel's 10-commit shallow clone: build.
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then exit 1; fi

if git diff --quiet "$base" HEAD -- . \
    ':(exclude)docs/' \
    ':(exclude).agents/' \
    ':(exclude,glob)**/*.md' \
    ':(exclude,glob)**/*.test.ts' \
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
