'use client';

import { useEffect } from 'react';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';

// Ask about the session once, whether or not the session hint is present. An owner signed in before the
// hint existed gets it back from this answer.
export default function RefreshOwnerNavigation() {
    useEffect(() => { refreshOwnerNavigation(); }, []);
    return null;
}
