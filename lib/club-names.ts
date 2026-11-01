// Exact names keep multiword places and nicknames together; renamed clubs use their full name.
export const clubNames: Record<string, readonly [string, string]> = {
    'Carolina Reapers': ['Carolina', 'Reapers'],
    'West Texas Torteehaws': ['West Texas', 'Torteehaws'],
    'Hamhung Hall Monitors': ['Hamhung', 'Hall Monitors'],
    'The Lalibirdies': ['The', 'Lalibirdies'],
    'Paddyville Lucifers': ['Paddyville', 'Lucifers'],
    'Varrock Dark Wizards': ['Varrock', 'Dark Wizards'],
    'New Purrsey Devils': ['New Purrsey', 'Devils'],
    'Hooterville Honkers': ['Hooterville', 'Honkers'],
    'Skellige Sirens': ['Skellige', 'Sirens'],
    'Jagrtown Ice Fellas': ['Jagrtown', 'Ice Fellas'],
};

export const clubNickname = (name: string) => clubNames[name]?.[1] ?? name;
