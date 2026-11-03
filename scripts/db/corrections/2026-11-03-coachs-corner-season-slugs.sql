-- Apply inside a transaction. The 2026–27 episodes were published under Fantrax's start year;
-- Coach's Corner slugs lead with the season year, the year the season ends in (GLOSSARY.md).
-- Old URLs are not redirected. The pilot keeps opening-week.
UPDATE league.coachs_corner_episodes SET slug = '2027-week-' || week || '-recap'
WHERE season = 2027 AND week IN (1, 2, 3) AND slug = '2026-week-' || week || '-recap';
