// src/services/userService.js
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, onSnapshot, orderBy, serverTimestamp, getDocs, where,
} from "firebase/firestore";
import { db } from "./firebase";

export function subscribeToUsers(callback) {
  const q = query(collection(db, "users"), orderBy("displayName"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function registerNewUser(firebaseUser) {
  const inviteSnap = await getDocs(
    query(collection(db, "invites"), where("email", "==", firebaseUser.email), where("used", "==", false))
  );

  if (inviteSnap.empty) {
    throw new Error("Sähköpostiosoitteellasi ei ole voimassa olevaa kutsua.");
  }

  const invite = inviteSnap.docs[0];

  await setDoc(doc(db, "users", firebaseUser.uid), {
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    photoURL: firebaseUser.photoURL,
    role: invite.data().role || "johtaja",   
    roles: [invite.data().role || "johtaja"],
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });

  await updateDoc(doc(db, "invites", invite.id), {
    used: true,
    usedAt: serverTimestamp(),
    usedBy: firebaseUser.uid,
  });
}

export async function sendInvite({ email, role, invitedBy, invitedByName }) {
  const existing = await getDocs(
    query(collection(db, "invites"), where("email", "==", email), where("used", "==", false))
  );
  if (!existing.empty) {
    throw new Error("Tälle sähköpostiosoitteelle on jo voimassa oleva kutsu.");
  }

  return setDoc(doc(collection(db, "invites")), {
    email,
    role,
    invitedBy,
    invitedByName,
    used: false,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

export function subscribeToInvites(callback) {
  const q = query(
    collection(db, "invites"),
    where("used", "==", false),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function revokeInvite(inviteId) {
  await deleteDoc(doc(db, "invites", inviteId));
}


export const ROLES = [
  { value: "lippukunnanjohtaja", label: "Lippukunnanjohtaja" },
  { value: "johtaja",           label: "Johtaja" },
  { value: "apulaisjohtaja",    label: "Apulaisjohtaja" },
  { value: "admin",             label: "Admin (IT)" },
];

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() });
}

export async function removeUser(uid) {
  await deleteDoc(doc(db, "users", uid));
}