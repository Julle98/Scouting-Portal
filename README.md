# 🏕️ Scout Portal

An internal management application for invidual scout group leaders. Built with React + Firebase.

---

## Features

- **Chat** — real-time channels, private messages, reactions, GIF support, message editing & deletion, slow mode, message character limits  
- **Equipment** — add, manage, request reservations, and approval system  
- **Leaders** — profile list with online status, role switching, reporting  
- **Meetings** — schedules for age groups with leader information  
- **Administration** — user management, roles, invitations, moderation, error logs  
- **Profile** — status selection, account & security, Google linking  
- **Settings** — theme (dark/light/auto), chat settings, changelog  

---

## Technologies

| Technology | Purpose |
|---|---|
| React 18 | UI |
| Vite | Build tool |
| Firebase Auth | Authentication (Google + Email) |
| Firestore | Real-time database |
| Firebase Hosting | Deployment |
| React Router v6 | Routing |

---

## Installation

### Requirements

- Node.js (LTS version)  
- Firebase CLI: `npm install -g firebase-tools`  
- A Firebase project created at https://console.firebase.google.com  

### 1. Clone repository

```bash
git clone https://github.com/USERNAME/scout-portal.git
cd scout-portal
npm install
```

### 2. Firebase configuration

Create `src/services/firebase.js` and add your Firebase config:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "project.firebaseapp.com",
  projectId:         "project",
  storageBucket:     "project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
}
```

> ⚠️ **Never commit real Firebase keys to GitHub.**  
> Use a `.env` file or add `firebase.js` to `.gitignore`.

### 3. Enable Firebase services

In Firebase Console:
- Authentication → enable Google and Email/Password  
- Firestore → create database and add rules from `firestore.rules`  
- Hosting → enable  

### 4. Development server

```bash
npm run dev
```

### 5. Deployment

```bash
firebase login
firebase init hosting   # public dir: dist, SPA: yes
npm run build
firebase deploy
```

---

## Security

The application uses a two-layer access control system:

1. Domain check — `@YourDomain.net` emails are allowed automatically  
2. Invite system — other emails require admin invitation  
3. Firestore Rules — all database operations are secured server-side  

No external users can read or write data without authentication.

---

## Project Structure

```
src/
├── components/
│   └── ui/
│       ├── Avatar.jsx
│       ├── ErrorBoundary.jsx
│       └── LinkWarning.jsx
├── contexts/
│   └── AuthContext.jsx
├── pages/
│   ├── ChatPage.jsx
│   ├── EquipmentPage.jsx
│   ├── MembersPage.jsx
│   ├── MeetingsPage.jsx
│   ├── AdminPage.jsx
│   ├── ProfilePage.jsx
│   ├── SettingsPage.jsx
│   ├── LoginPage.jsx
│   ├── MainLayout.jsx
│   └── LoadingScreen.jsx
└── services/
    ├── firebase.js
    ├── chatService.js
    ├── equipmentService.js
    └── userService.js
```

---

## Development

### Firestore rules

```bash
firebase deploy --only firestore:rules
```

### Frontend only

```bash
firebase deploy --only hosting
```

---

## License

This project is intended for internal use by the Invidual scout group. See the [LICENSE](LICENSE) file for full details.

## Credits

Created by **Julle98** using beginner skills and occasional help from GitHub Copilot and Claude AI.  
