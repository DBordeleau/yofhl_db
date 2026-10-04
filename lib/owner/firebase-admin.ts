import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function ownerAuth() {
    let app = getApps().find((app) => app.name === 'owners');
    if (!app) {
        const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!json) throw new Error('Owner accounts are not configured yet.');
        app = initializeApp({ credential: cert(JSON.parse(json)) }, 'owners');
    }
    return getAuth(app);
}
