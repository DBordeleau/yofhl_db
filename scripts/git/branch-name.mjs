import { pathToFileURL } from 'node:url';

// Branch names reaching GitHub are <type>/<issue>-<slug>: feat/42-electrum-wallet-detection.
// The pre-push hook (.githooks/pre-push) runs this with git's push lines on stdin.

export const BRANCH_NAME = /^(feat|fix|refactor|perf|test|docs|chore)\/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;

const DELETE = /^0+$/;

/** Branch names a push would create or update on the remote and that break the convention. Tags and deletions pass. */
export function rejectedBranches(pushLines) {
    return pushLines.split(/\r?\n/).filter(Boolean).flatMap(line => {
        const [, localSha, remoteRef] = line.trim().split(/\s+/);
        if (!remoteRef?.startsWith('refs/heads/') || DELETE.test(localSha ?? '')) return [];
        const branch = remoteRef.slice('refs/heads/'.length);
        return BRANCH_NAME.test(branch) ? [] : [branch];
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const rejected = rejectedBranches(input);
    if (rejected.length) {
        console.error(`Push rejected: ${rejected.join(', ')} must be named <type>/<issue>-<slug>, like feat/42-electrum-wallet-detection.`);
        console.error('Types: feat, fix, refactor, perf, test, docs, chore. Rename with: git branch -m <new-name>');
        process.exit(1);
    }
}
