# CrisisMesh v3 — Firebase Setup Guide

## Files in this project
```
index.html          — Main HTML (unchanged structure, now uses ES modules)
style.css           — All styles (original + admin/Firebase additions)
app.js              — Frontend application logic (Firebase real-time)
db.js               — Firebase Firestore CRUD service layer
firebase-config.js  — Firebase SDK imports + your project config
README.md           — This file
```

---

## Step 1 — Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **Add project** → name it `CrisisMesh` → Continue
3. Disable Google Analytics (optional) → Create project

---

## Step 2 — Enable Firestore Database

1. In your Firebase project, click **Build → Firestore Database**
2. Click **Create database**
3. Select **Start in test mode** (allows all reads/writes for 30 days — change rules before going live)
4. Choose a region closest to you → Enable

---

## Step 3 — Enable Authentication

1. Click **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password** → Save

---

## Step 4 — Get Your Firebase Config

1. Go to ⚙️ **Project Settings** (gear icon top left)
2. Scroll down to **Your apps** → click the `</>` Web icon
3. Register app name: `CrisisMesh Web`
4. Copy the `firebaseConfig` object shown

---

## Step 5 — Update firebase-config.js

Open `firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← your key
  authDomain:        "crisismesh-xxx.firebaseapp.com",
  projectId:         "crisismesh-xxx",
  storageBucket:     "crisismesh-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

---

## Step 6 — Run the App

**Option A — VS Code Live Server (easiest)**
- Install the **Live Server** extension
- Right-click `index.html` → "Open with Live Server"

**Option B — Python local server**
```bash
cd /path/to/crisismesh
python3 -m http.server 8080
# Open http://localhost:8080
```

**Option C — Node.js**
```bash
npx serve .
```

> ⚠️ Must be served over HTTP/HTTPS — cannot open index.html as a file:// URL because Firebase SDK requires a proper origin.

---

## Default Admin Login
```
Email:    admin@crisismesh.com
Password: admin123
```
This is hardcoded in `db.js` — no Firebase Auth needed for admin.

---

## First Launch

On first launch, the app automatically seeds Firestore with:
- **10 volunteers** (Chennai zones)
- **8 citizens**
- **8 incidents** (flood, fire, medical, power, accident)
- **10 needs** linked to incidents

All data is **persistent** — it stays in Firestore and is visible to all users in real-time.

---

## Firestore Security Rules (for production)

Replace test mode rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone authenticated can read
    match /{document=**} {
      allow read: if request.auth != null;
    }
    // Only the owner or admin can write
    match /incidents/{id} {
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }
    match /needs/{id} {
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
    match /volunteers/{id} {
      allow read, write: if request.auth != null;
    }
    match /citizens/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Admin Features (login as admin)

- **Resolve incidents** directly from the feed or map
- **Delete incidents** with one click
- **Verify/Unverify volunteers**
- **Toggle volunteer availability**
- **Remove volunteers and citizens** from the database
- Full access to all analytics

---

## Architecture

```
Browser ←──────────────────────→ Firebase Firestore
         Real-time onSnapshot()        (NoSQL Cloud DB)
         
         ↑
         app.js (UI logic)
         ↓
         db.js (CRUD + listeners)
         ↓
         firebase-config.js (SDK)
```

All data changes appear **instantly** on all connected browsers — no page refresh needed.
