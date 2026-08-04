import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwAD7LBL8p2K7d0kLNeCqfk_JSPOzcS60",
  authDomain: "camisa10-92bd2.firebaseapp.com",
  projectId: "camisa10-92bd2",
  storageBucket: "camisa10-92bd2.firebasestorage.app",
  messagingSenderId: "318261305405",
  appId: "1:318261305405:web:6635449e5f280463188a54",
  measurementId: "G-N391Z306R9"
};

const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

const auth = getAuth(app);

const db = getFirestore(app);

export { auth, db };