import { db, auth } from "./firebase.js";
import {
  doc,
  onSnapshot,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let mySlot = null;
let myUid = null;
let roomRef = null;
let unsubscribe = null;

export function loadBattle(roomId) {
  roomRef = doc(db, "rooms", roomId);

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    myUid = user.uid;

    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();

    mySlot = roomData.player1_uid === myUid ? "p1" : "p2";

    // ── player1만 entry 복사 담당 (race condition 방지) ──
    if (mySlot === "p1" && !roomData.p1_entry) {
      await copyEntriesToRoom(roomData);
    }

    setupControls();
    listenRoom();
  });
}

// ── p1, p2 entry 둘 다 users에서 읽어서 룸 문서에 복사 ──
async function copyEntriesToRoom(roomData) {
  const [p1Snap, p2Snap] = await Promise.all([
    getDoc(doc(db, "users", roomData.player1_uid)),
    getDoc(doc(db, "users", roomData.player2_uid)),
  ]);

  const p1Entry = p1Snap.data()?.entry ?? [];
  const p2Entry = p2Snap.data()?.entry ?? [];

  await updateDoc(roomRef, {
    p1_entry: p1Entry,
    p1_active_idx: 0,
    p2_entry: p2Entry,
    p2_active_idx: 0,
  });
}

function listenRoom() {
  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(roomRef, (snap) => {
    const data = snap.data();
    if (!data) return;

    // entry 둘 다 복사될 때까지 대기
    if (!data.p1_entry || !data.p2_entry) return;

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기...";
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기...";

    updatePokemonUI("p1", data);
    updatePokemonUI("p2", data);
    updateBenchButtons(mySlot, data);
  });
}

function updatePokemonUI(slot, data) {
  const activeIdx = data[`${slot}_active_idx`];
  const activePokemon = data[`${slot}_entry`][activeIdx];
  if (!activePokemon) return;

  document.getElementById(`${slot}-active-name`).innerText = activePokemon.name;
  document.getElementById(`${slot}-active-hp`).innerText = `${activePokemon.hp} / 100`;
}

function updateBenchButtons(mySlot, data) {
  const myEntry = data[`${mySlot}_entry`];
  const activeIdx = data[`${mySlot}_active_idx`];

  let btnCount = 0;
  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return;

    const btn = document.getElementById(`bench-btn-${btnCount}`);
    if (btn) {
      btn.style.display = "inline-block";
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
      btn.onclick = () => switchPokemon(idx);
    }
    btnCount++;
  });
}

async function switchPokemon(newIdx) {
  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
  });
}

function setupControls() {
  const enemySlot = mySlot === "p1" ? "p2" : "p1";

  document.getElementById("attackBtn").onclick = async () => {
    const snap = await getDoc(roomRef);
    const data = snap.data();

    const enemyEntry = [...data[`${enemySlot}_entry`]];
    const enemyActiveIdx = data[`${enemySlot}_active_idx`];

    enemyEntry[enemyActiveIdx] = {
      ...enemyEntry[enemyActiveIdx],
      hp: Math.max(0, enemyEntry[enemyActiveIdx].hp - 20),
    };

    await updateDoc(roomRef, {
      [`${enemySlot}_entry`]: enemyEntry,
    });
  };
}
