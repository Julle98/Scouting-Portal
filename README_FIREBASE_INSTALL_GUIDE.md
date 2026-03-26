# Scout Portal — Installation Guide

## Requirements
- Google account (same as Drive)
- Node.js installed (https://nodejs.org) — choose LTS version
- About 30 minutes of time

---

## Step 1 — Create a Firebase project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it, e.g. `scout-portal`
4. Google Analytics → can be disabled (not required)
5. Click **"Create project"**

---

## Step 2 — Add a web app

1. On the project dashboard, click **`</>`** (Web app)
2. Name: `Scout Portal web`
3. Check **"Also set up Firebase Hosting"**
4. Click **"Register app"**
5. **COPY the `firebaseConfig` block** — you’ll need it in Step 5

---

## Step 3 — Enable services

### Authentication
1. Menu: **Build → Authentication → Get started**
2. Go to **Sign-in method** tab → click **Google**
3. Enable it and add your support email
4. Save

### Firestore (database)
1. Menu: **Build → Firestore Database → Create database**
2. Select **"Start in production mode"** ← IMPORTANT (secures your data)
3. Choose location: **`eur3 (europe-west)`**
4. Click **"Done"**
5. Go to **Rules** tab
6. **Replace all content** with your `firestore.rules` file
7. Click **"Publish"**

### Storage (files/images)
1. Menu: **Build → Storage → Get started**
2. Select **"Start in production mode"**
3. Choose same European location
4. Go to **Rules** tab
5. **Replace all content** with your `storage.rules` file
6. Click **"Publish"**

---

## Step 4 — Install the app

Open terminal and run:

```bash
# 1. Go to project folder
cd scout-app

# 2. Install dependencies
npm install

# 3. Install Firebase CLI
npm install -g firebase-tools

# 4. Login to Firebase
firebase login

# 5. Initialize Firebase
firebase init
# → Select: Firestore, Storage, Hosting
# → Choose your project
# → Public directory: dist
# → Single-page app: Yes
# → Overwrite index.html: No
```

---

## Step 5 — Add Firebase config

Open **`src/services/firebase.js`** and replace placeholder values
with your `firebaseConfig` from Step 2:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "scout-portal.firebaseapp.com",
  projectId:         "scout-portal",
  storageBucket:     "scout-portal.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
};
```

---

## Step 6 — Add first admin user

Since the app requires the user to exist in the database before login,
you must add your user manually:

1. Log into the app once (it will fail, but creates your Google account)
2. Go to Firebase Console → **Firestore**
3. Create collection: `users`
4. Document ID: **copy your UID from Authentication → Users**
5. Add fields:
   ```
   displayName : "Mikko Korhonen"
   email       : "mikko@gmail.com"
   role        : "scout_leader"
   joinedAt    : (timestamp, current time)
   ```
6. Save → log in again → access granted

---

## Step 7 — Deploy

```bash
npm run deploy

# Your app will be available at:
# https://scout-portal.web.app
```

---

## Adding other leaders

**DO NOT** share the app URL directly — access is blocked by default.

Add users in two ways:

### Option A — Manually (simplest)
- Repeat Step 6 using the new user's UID

### Option B — Invite system (when implemented)
- Admin panel → "Invite leader"
- Enter email
- System creates invite
- User logs in → gets access automatically

---

## Security checklist

- [ ] Firestore Rules are set (not "test mode")
- [ ] Storage Rules are set
- [ ] `firebaseConfig` is not publicly in your repo
- [ ] Only you can add new users
- [ ] App is not indexed by search engines (handled by Firebase Hosting)

---

## Support

If something goes wrong, check:

1. Firebase Console → **Usage** tab (errors?)
2. Browser DevTools → **Console** (red errors?)
3. Firestore → **Rules Playground** (do rules work?)  
