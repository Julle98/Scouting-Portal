// src/services/chatService.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove,
  getDoc, setDoc, where, getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

export function subscribeToChannels(userId, callback) {
  const q = query(
    collection(db, "channels"),
    orderBy("name")
  );
  return onSnapshot(q, snap => {
    const channels = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(ch => ch.type === "public" || ch.members?.includes(userId));
    callback(channels);
  });
}

export async function createChannel({ name, type = "public", description = "", createdBy }) {
  return addDoc(collection(db, "channels"), {
    name: name.toLowerCase().replace(/\s+/g, "-"),
    type,          // "public" | "private"
    description,
    createdBy,
    members: [createdBy],
    createdAt: serverTimestamp(),
  });
}

export async function inviteToChannel(channelId, userId) {
  await updateDoc(doc(db, "channels", channelId), {
    members: arrayUnion(userId),
  });
}

export function subscribeToMessages(channelId, callback, msgLimit = 50) {
  const q = query(
    collection(db, "channels", channelId, "messages"),
    orderBy("createdAt", "asc"),
    limit(msgLimit)
  );
  return onSnapshot(q, snap => {
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(messages);
  });
}

export async function sendMessage({ channelId, text, senderId, senderName, senderPhoto, gifUrl = null }) {
  return addDoc(collection(db, "channels", channelId, "messages"), {
    text,
    gifUrl,
    senderId,
    senderName,
    senderPhoto,
    createdAt: serverTimestamp(),
    edited: false,
    reactions: {},   // { "👍": ["uid1", "uid2"], "❤️": ["uid3"] }
    deleted: false,
  });
}

export async function editMessage(channelId, messageId, newText) {
  await updateDoc(doc(db, "channels", channelId, "messages", messageId), {
    text: newText,
    edited: true,
    editedAt: serverTimestamp(),
  });
}

export async function deleteMessage(channelId, messageId) {
  await updateDoc(doc(db, "channels", channelId, "messages", messageId), {
    deleted: true,
    text: "",
  });
}

export async function toggleReaction(channelId, messageId, emoji, userId) {
  const msgRef = doc(db, "channels", channelId, "messages", messageId);
  const msgSnap = await getDoc(msgRef);
  const reactions = msgSnap.data()?.reactions || {};
  const current = reactions[emoji] || [];

  if (current.includes(userId)) {
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: arrayRemove(userId),
    });
  } else {
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: arrayUnion(userId),
    });
  }
}

function getDmId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

export async function getOrCreateDM(uid1, uid2) {
  const dmId = getDmId(uid1, uid2);
  const dmRef = doc(db, "directMessages", dmId);
  const snap = await getDoc(dmRef);

  if (!snap.exists()) {
    await setDoc(dmRef, {
      participants: [uid1, uid2],
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageAt: serverTimestamp(),
    });
  }
  return dmId;
}

export function subscribeToDMMessages(dmId, callback) {
  const q = query(
    collection(db, "directMessages", dmId, "messages"),
    orderBy("createdAt", "asc"),
    limit(100)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function sendDM({ dmId, text, senderId, senderName, senderPhoto }) {
  await addDoc(collection(db, "directMessages", dmId, "messages"), {
    text, senderId, senderName, senderPhoto,
    createdAt: serverTimestamp(),
    read: false,
  });
  await updateDoc(doc(db, "directMessages", dmId), {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
  });
}

export async function reportMessage({ channelId, messageId, messageText, reporterId, reporterName, reason }) {
  return addDoc(collection(db, "moderation"), {
    channelId, messageId, messageText,
    reporterId, reporterName, reason,
    status: "pending",   // "pending" | "resolved" | "dismissed"
    createdAt: serverTimestamp(),
  });
}

export function subscribeToModerationQueue(callback) {
  const q = query(
    collection(db, "moderation"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function resolveReport(reportId, action) {
  await updateDoc(doc(db, "moderation", reportId), {
    status: action,
    resolvedAt: serverTimestamp(),
  });
}
