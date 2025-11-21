import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyApl-H2CswjyEF4hkHM25hraxS9LgB3QiI",
  authDomain: "oppy-resume-rewriter.firebaseapp.com",
  projectId: "oppy-resume-rewriter",
  storageBucket: "oppy-resume-rewriter.firebasestorage.app",
  messagingSenderId: "1062758238859",
  appId: "1:1062758238859:web:d28dcda90149223d8e628e",
  measurementId: "G-BE8XNSD2DY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;