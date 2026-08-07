import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  // QcJob (and everything after it — answers, sign-offs, verdict fields)
  // carries many optional properties typed `foo?: string`. Building those
  // as `foo: x || undefined` is the natural way to express "omit if empty"
  // in TS, but the Firestore SDK rejects a literal `undefined` field value
  // outright (`WriteBatch.set() called with invalid data`) unless told to
  // treat it as "omit this key" instead — which is what this does.
  ignoreUndefinedProperties: true,
});

// ── Local emulator support ──────────────────────────────────────────────
// Only activates when VITE_USE_EMULATORS=true is present in .env.local.
// This flag will never be set in the production folder's .env.local,
// so this block can never execute against real production data.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.log('[Firebase] Connected to LOCAL EMULATORS (Auth :9099, Firestore :8080)');
}
