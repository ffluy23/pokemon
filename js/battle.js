import { db } from "./firebase-config.js"; // 설정파일 필요
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

let currentRoomId = "battleroom1"; // 예시 룸 ID
let myId = "user_abc"; // 현재 로그인한 유저 ID
let isPlayer1 = true; // 유저가 p1인지 p2인지 판별

// 1. 배틀 시작 시 users의 entry를 room으로 복사
async function initializeBattle(roomId, p1Id, p2Id) {
  const p1Doc = await getDoc(doc(db, "users", p1Id));
  const p2Doc = await getDoc(doc(db, "users", p2Id));

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, {
    player1_name: p1Doc.data().nickname,
    player2_name: p2Doc.data().nickname,
    p1_entry: p1Doc.data().entry, // array 그대로 복사
    p2_entry: p2Doc.data().entry,
    p1_active_idx: 0, // 현재 나와있는 포켓몬 인덱스
    p2_active_idx: 0
  });
}

// 2. 실시간 화면 업데이트
function listenToBattle(roomId) {
  onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    // 이름 표시
    document.getElementById("p1-name").innerText = data.player1_name;
    document.getElementById("p2-name").innerText = data.player2_name;

    // 내(P1) 포켓몬 정보 업데이트 (P2도 같은 방식으로 작성)
    const p1Active = data.p1_entry[data.p1_active_idx];
    document.getElementById("p1-active-name").innerText = p1Active.name;
    document.getElementById("p1-active-hp-bar").value = p1Active.hp;
    document.getElementById("p1-active-hp-text").innerText = `${p1Active.hp} / 100`;

    // 대기 포켓몬 버튼 업데이트
    data.p1_entry.forEach((pkmn, idx) => {
      if (idx !== data.p1_active_idx) {
        const btn = document.getElementById(`bench-${idx === 0 ? 0 : idx}`); 
        // 0, 1, 2 중 활성화되지 않은 인덱스만 버튼에 매핑
        if(btn) btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
      }
    });
  });
}

// 3. 포켓몬 교체 로직
async function switchPokemon(newIdx) {
  const roomRef = doc(db, "rooms", currentRoomId);
  // Firestore의 p1_active_idx 값만 바꿔주면 onSnapshot이 감지해서 화면을 바꿈
  await updateDoc(roomRef, {
    p1_active_idx: newIdx
  });
  console.log(`${newIdx}번 포켓몬으로 교체!`);
}

// 4. 공격 시 체력 감소 (예시)
async function attack() {
  const roomRef = doc(db, "rooms", currentRoomId);
  const snap = await getDoc(roomRef);
  const data = snap.data();
  
  // 상대방의 현재 포켓몬 체력 깎기
  let enemyEntry = [...data.p2_entry];
  let activeIdx = data.p2_active_idx;
  
  enemyEntry[activeIdx].hp = Math.max(0, enemyEntry[activeIdx].hp - 10);

  await updateDoc(roomRef, {
    p2_entry: enemyEntry
  });
}
