---
status: accepted
---

# A readable session hint decides whether the header asks who the visitor is

Public pages are cached, so the header learns who the visitor is from `/api/owner` after the page loads. Asking on every page load and focus cost every anonymous visitor a function invocation, in a bundle that loads Firebase Admin, just to learn "not signed in".

The owner session module (`lib/owner/create-owner-session.ts`) now sets a second cookie, `yofhl_owner_hint=1`, beside the HttpOnly `yofhl_owner` session cookie. It is set and cleared with the session cookie, with the same path, lifetime, `SameSite=Lax` and `secure` setting. It is **not** HttpOnly: the header's watcher (`lib/owner/navigation.ts`) reads it from `document.cookie`, and without it reports signed out and makes no request. Sign-in, claim, save and sign-out force a refresh that asks regardless of the hint.

The hint carries no secret. It only says a session may exist; the session cookie is still verified, with the revocation check, on every header answer and owner action. A forged hint costs its owner one request and gets them nothing.

The header answer reconciles the hint on every request: it sets it when the session is valid and clears it when it isn't. That clears a hint left by a revoked or expired session after one request, and the owner pages force one refresh on mount, which restores the hint for owners who signed in before it existed.

## Considered Options

- **Ask the server on every page load**: what this replaces. Correct, but every anonymous visit pays for a session check.
- **Make the session cookie itself readable**: exposes the session to page scripts.
- **Render the header's owner state on the server**: makes every public page dynamic and uncacheable.

## Consequences

- Don't make the hint HttpOnly. The header could no longer see it, and every visitor would be treated as signed out until a forced refresh. Bringing the request back for everyone would follow.
- Don't put anything secret or identifying in the hint. Its value is always `1`.
- A stale hint (a session that expired in the browser or was revoked) costs one request, which clears it.
