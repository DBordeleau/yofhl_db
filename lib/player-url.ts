// Fantrax wraps archive IDs in asterisks, which Windows cannot use in cached page filenames.
export const playerSlug = (id: string) => id.replace(/^\*([a-zA-Z0-9_-]+)\*$/, '$1');
export const playerHref = (id: string) => `/player/${encodeURIComponent(playerSlug(id))}`;
