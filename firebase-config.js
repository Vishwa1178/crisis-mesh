// =====================================================
// CRISISMESH — FIREBASE CONFIGURATION
// =====================================================
// HOW TO SET UP:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (e.g., "CrisisMesh")
// 3. Enable Firestore Database (in test mode for development)
// 4. Enable Authentication → Email/Password
// 5. Go to Project Settings → General → "Your apps" → Web app (</>)
// 6. Register the app and copy the firebaseConfig object below
// 7. Replace the placeholder values below with your actual config

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ─── REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG ───
const firebaseConfig = {
  apiKey: "AIzaSyCGc4YJumlx83lZx3jptpBvD7H1vNhHxfA",
  authDomain: "crisismesh-3ee75.firebaseapp.com",
  projectId: "crisismesh-3ee75",
  storageBucket: "crisismesh-3ee75.firebasestorage.app",
  messagingSenderId: "859963634009",
  appId: "1:859963634009:web:e4125e048cf8a2d3241c48",
  
};
// ──────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

export {
  db, auth,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, onSnapshot, query, orderBy,
  serverTimestamp, where,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
};
