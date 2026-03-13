import { db } from "./firebase-config.js"; 
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

// 실제 게임에서는 유저 ID와 룸 ID를 동적으로 받아와야 해
const roomId = "battleroom1"; 
const myId = "USER_01_ID"; 
let isPlayer1 = true; // 내가 P1인지 P2인지 구분 (로직상 필요)

/**
 * 1. 전투 시작: 유저의 entry(array)를 배틀룸으로 복사
 */
async function startBattle(p1Id, p2Id) {
    const p1Snap = await getDoc(doc(db, "users", p1Id));
    const p2Snap = await getDoc(doc(db, "users", p2Id));

    const roomRef = doc(db, "rooms", roomId);
    
    // 유저의 entry [ {name, hp}, {name, hp}, {name, hp} ] 를 그대로 복사
    await updateDoc(roomRef, {
        p1_name: p1Snap.data().nickname || "Player 1",
        p2_name: p2Snap.data().nickname || "Player 2",
        p1_entry: p1Snap.data().entry, // Map이 담긴 Array 복사
        p2_entry: p2Snap.data().entry,
        p1_active_idx: 0, // 선두 0번
        p2_active_idx: 0,
        turn: "p1" // 누구 차례인지 관리용
    });
    
    console.log("배틀 세팅 완료!");
}

/**
 * 2. 실시간 리스너: Firestore의 변화를 감지해서 화면 업데이트
 */
function listenBattle() {
    onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // 1) 이름 표시
        document.getElementById("p1-name").innerText = data.p1_name;
        document.getElementById("p2-name").innerText = data.p2_name;

        // 2) 내(P1) 현재 활성화된 포켓몬 정보 (배열에서 idx로 접근)
        const p1Active = data.p1_entry[data.p1_active_idx];
        document.getElementById("p1-active-name").innerText = p1Active.name;
        document.getElementById("p1-hp-bar").value = p1Active.hp;
        document.getElementById("p1-hp-text").innerText = `${p1Active.hp} / 100`;

        // 3) 내(P1) 대기 포켓몬 버튼 (나머지 두 마리)
        // 0, 1, 2번 중 현재 active_idx가 아닌 것들을 버튼에 매핑
        let benchCount = 1;
        data.p1_entry.forEach((pkmn, idx) => {
            if (idx !== data.p1_active_idx) {
                const btn = document.getElementById(`btn-pkmn-${benchCount}`);
                btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
                btn.onclick = () => switchPokemon(idx); // 클릭 시 해당 번호로 교체
                benchCount++;
            }
        });

        // 4) 상대방(P2) 활성화된 포켓몬 정보
        const p2Active = data.p2_entry[data.p2_active_idx];
        document.getElementById("p2-active-name").innerText = p2Active.name;
        document.getElementById("p2-hp-bar").value = p2Active.hp;
        document.getElementById("p2-hp-text").innerText = `${p2Active.hp} / 100`;
    });
}

/**
 * 3. 포켓몬 교체 기능
 */
async function switchPokemon(newIdx) {
    const roomRef = doc(db, "rooms", roomId);
    // 내 active_idx만 업데이트하면 onSnapshot이 알아서 화면을 새로 그려줘
    await updateDoc(roomRef, {
        p1_active_idx: newIdx
    });
    console.log("교체 완료!");
}

/**
 * 4. 공격 예시 (상대방 HP 깎기)
 */
async function attack() {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();

    let newEnemyEntry = [...data.p2_entry]; // 배열 복사
    let enemyIdx = data.p2_active_idx;

    // 상대방의 현재 나와있는 포켓몬 HP 감소
    newEnemyEntry[enemyIdx].hp -= 10;
    if (newEnemyEntry[enemyIdx].hp < 0) newEnemyEntry[enemyIdx].hp = 0;

    await updateDoc(roomRef, {
        p2_entry: newEnemyEntry
    });
}

// 실행
listenBattle();
