'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';

export async function clientOwnerAuth() {
    const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    if (!config.apiKey) throw new Error('Owner accounts are not configured yet.');
    const app = getApps().find((app) => app.name === 'owners') ?? initializeApp(config, 'owners');
    const auth = getAuth(app);
    await setPersistence(auth, inMemoryPersistence);
    return auth;
}
