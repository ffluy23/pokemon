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

    // 내 슬롯 확인
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();
    mySlot = roomData.player1_uid === myUid ? "p1" : "p2";

    // 버튼 세팅
    setupControls();

    // 실시간 리스닝 시작
    listenRoom();
  });
}

function listenRoom() {
  if (unsubscribe) unsubscribe(); // 중복 방지

  unsubscribe = onSnapshot(roomRef, async (snap) => {
    const data = snap.data();
    if (!data) return;

    // ── 핵심 트리거: 둘 다 ready이고 아직 entry가 복사 안 된 경우 ──
    const bothReady = data.player1_ready && data.player2_ready;
    const entriesNotCopied = !data.p1_entry || !data.p2_entry;

    if (bothReady && entriesNotCopied) {
      await copyEntriesToRoom(data);
      return; // 복사 후 onSnapshot이 다시 트리거되므로 여기서 종료
    }

    // ── entry가 둘 다 존재할 때만 UI 업데이트 ──
    if (!data.p1_entry || !data.p2_entry) return;

    // 플레이어 이름 표시
    document.getElementById("p1-name").innerText = data.player1_name ?? "대기...";
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기...";

    // 포켓몬 UI 업데이트
    updatePokemonUI("p1", data);
    updatePokemonUI("p2", data);

    // 내 대기 포켓몬 버튼 업데이트
    updateBenchButtons(mySlot, data);
  });
}

// ── 두 유저의 entry를 users 컬렉션에서 읽어 룸에 복사 ──
async function copyEntriesToRoom(roomData) {
  const [p1UserSnap, p2UserSnap] = await Promise.all([
    getDoc(doc(db, "users", roomData.player1_uid)),
    getDoc(doc(db, "users", roomData.player2_uid)),
  ]);

  const p1Entry = p1UserSnap.data()?.entry ?? [];
  const p2Entry = p2UserSnap.data()?.entry ?? [];

  await updateDoc(roomRef, {
    p1_entry: p1Entry,
    p1_active_idx: 0,
    p2_entry: p2Entry,
    p2_active_idx: 0,
  });
}

// ── 포켓몬 이름/HP 표시 ──
function updatePokemonUI(slot, data) {
  const activeIdx = data[`${slot}_active_idx`];
  const activePokemon = data[`${slot}_entry`][activeIdx];
  if (!activePokemon) return;

  document.getElementById(`${slot}-active-name`).innerText = activePokemon.name;
  document.getElementById(`${slot}-active-hp`).innerText =
    `${activePokemon.hp} / 100`;
}

// ── 대기 포켓몬 버튼 렌더링 ──
function updateBenchButtons(mySlot, data) {
  const myEntry = data[`${mySlot}_entry`];
  const activeIdx = data[`${mySlot}_active_idx`];

  let btnCount = 0;
  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return; // 현재 싸우는 포켓몬 제외

    const btn = document.getElementById(`bench-btn-${btnCount}`);
    if (btn) {
      btn.style.display = "inline-block";
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
      btn.onclick = () => switchPokemon(idx);
    }
    btnCount++;
  });
}

// ── 포켓몬 교체 ──
async function switchPokemon(newIdx) {
  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
  });
}

// ── 공격 버튼 ──
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
