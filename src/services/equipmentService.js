// src/services/equipmentService.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, getDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export function subscribeToEquipment(callback) {
  const q = query(collection(db, "equipment"), orderBy("name"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addEquipment({
  name, category, quantity, location, description,
  condition, ownerId, ownerName, emoji = "🎒",
}) {
  return addDoc(collection(db, "equipment"), {
    name, category, quantity,
    available: quantity,
    location, description, condition,
    ownerId, ownerName,
    emoji,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEquipment(itemId, updates) {
  await updateDoc(doc(db, "equipment", itemId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEquipment(itemId) {
  await deleteDoc(doc(db, "equipment", itemId));
}

export async function requestReservation({
  itemId, itemName, quantity,
  requesterId, requesterName,
  startDate, endDate, purpose,
}) {
  const snap = await getDoc(doc(db, "equipment", itemId));
  const currentAvail = snap.data()?.available ?? 0;
  if (currentAvail < quantity) throw new Error("Ei riittävästi saatavilla.");

  await addDoc(collection(db, "equipment", itemId, "reservations"), {
    itemId, itemName, quantity,
    requesterId, requesterName,
    startDate, endDate, purpose,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "equipment", itemId), {
    available: currentAvail - quantity,
    updatedAt: serverTimestamp(),
  });
}

export async function approveReservation(itemId, reservationId) {
  await updateDoc(doc(db, "equipment", itemId, "reservations", reservationId), {
    status: "approved", approvedAt: serverTimestamp(),
  });
}

export async function denyReservation(itemId, reservationId, quantity) {
  const reservationRef = doc(db, "equipment", itemId, "reservations", reservationId);
  const reservationSnap = await getDoc(reservationRef);
  const currentStatus = reservationSnap.data()?.status;

  if (currentStatus === "denied" || currentStatus === "returned") return;

  await updateDoc(reservationRef, {
    status: "denied", deniedAt: serverTimestamp(),
  });
  const snap = await getDoc(doc(db, "equipment", itemId));
  await updateDoc(doc(db, "equipment", itemId), {
    available: (snap.data()?.available ?? 0) + quantity,
  });
}

export async function markReturned(itemId, reservationId, quantity) {
  const reservationRef = doc(db, "equipment", itemId, "reservations", reservationId);
  const reservationSnap = await getDoc(reservationRef);
  const currentStatus = reservationSnap.data()?.status;

  if (currentStatus === "returned" || currentStatus === "denied") return;

  await updateDoc(reservationRef, {
    status: "returned", returnedAt: serverTimestamp(),
  });
  const snap = await getDoc(doc(db, "equipment", itemId));
  await updateDoc(doc(db, "equipment", itemId), {
    available: (snap.data()?.available ?? 0) + quantity,
  });
}

export const EQUIPMENT_EMOJIS = [
  "⛺","🏕️","🎒","🍳","🧭","🔦","🩺","🪓","🔪","🧲",
  "🪝","🧰","🪜","🛶","🏔️","🌲","🔥","💧","🧤","🧥",
  "👟","🥾","🕶️","🪢","📻","🔋","🧯","⛑️","🗺️","🏹",
];