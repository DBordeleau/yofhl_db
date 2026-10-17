-- Apply inside a transaction. Keep league/league.yml in sync so imports retain these facts.
-- Season years are end years. Existing franchise/team-season IDs and statistics are preserved.
INSERT INTO league.owners (name)
VALUES ('Jamie Molloy'), ('Raul Gonzalez'), ('James May'), ('Matt Marr')
ON CONFLICT (name) DO NOTHING;

UPDATE league.franchises SET display_name = 'Jagrtown Ice Fellas'
WHERE id = 5 AND display_name = 'Jagrtown Icefellas';

UPDATE league.team_seasons SET name = 'Jagrtown Ice Fellas'
WHERE franchise_id = 5 AND name = 'Jagrtown Icefellas';

UPDATE league.team_seasons SET owner_id = (SELECT id FROM league.owners WHERE name = 'Jamie Molloy')
WHERE franchise_id = 3 AND season_year BETWEEN 2019 AND 2020;

UPDATE league.team_seasons SET owner_id = (SELECT id FROM league.owners WHERE name = 'Raul Gonzalez')
WHERE franchise_id = 10 AND season_year BETWEEN 2019 AND 2024;

UPDATE league.team_seasons SET owner_id = (SELECT id FROM league.owners WHERE name = 'James May')
WHERE franchise_id = 11 AND season_year BETWEEN 2019 AND 2023;

UPDATE league.team_seasons SET owner_id = (SELECT id FROM league.owners WHERE name = 'Matt Marr')
WHERE franchise_id = 12 AND season_year BETWEEN 2019 AND 2021;
