import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SeasonLinks from '../../components/season-links';

test('season links preserve surrounding details and use the ending year for each URL', () => {
    const html = renderToStaticMarkup(React.createElement(SeasonLinks, { text: '2023–24 P1 → 2024–25 P2, 2023–24' }));
    assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/season/2024', '/season/2025', '/season/2024']);
    assert.equal(html.replace(/<[^>]*>/g, ''), '2023–24 P1 → 2024–25 P2, 2023–24');
});

test('counts, scores, and win-loss records do not become season links', () => {
    const html = renderToStaticMarkup(React.createElement(SeasonLinks, { text: '8 seasons · 24–5–1 · 1000–90' }));
    assert(!html.includes('<a'));
    assert.equal(html, '8 seasons · 24–5–1 · 1000–90');
});
