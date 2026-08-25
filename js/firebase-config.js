// Firebase Config - No Storage (Free)
const firebaseConfig = {
    apiKey: "AIzaSyDGVCUUd0lV4HuvsLMd51adzkTLDLvV-KY",
    authDomain: "osama-100fc.firebaseapp.com",
    databaseURL: "https://osama-100fc-default-rtdb.firebaseio.com",
    projectId: "osama-100fc",
    storageBucket: "osama-100fc.firebasestorage.app",
    messagingSenderId: "378677850861",
    appId: "1:378677850861:web:31342a9b390a16542b12e4",
    measurementId: "G-K22CXDSD8S"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { firebaseConfig };