import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 현재 페이지 URL에서 ROOM_ID 추출 (예: battleroom1.html -> battleroom1)
const ROOM_ID = window.location.pathname.split('/').pop().replace('.html', '');
const roomRef = doc(db, "rooms", ROOM_ID);

let myUid = null;
let mySlot = null; // "p1" 또는 "p2"

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    myUid = user.uid;

    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();

    // 1. 대기실 로직에서 정해진 UID로 내 슬롯(p1/p2) 결정
    if (roomData.player1_uid === myUid) mySlot = "p1";
    else if (roomData.player2_uid === myUid) mySlot = "p2";

    if (!mySlot) return;

    // 2. [최초 1회] 내 entry 복사 (필드가 없을 때만)
    if (!roomData[`${mySlot}_entry`]) {
        const userDoc = await getDoc(doc(db, "users", myUid));
        await updateDoc(roomRef, {
            [`${mySlot}_entry`]: userDoc.data().entry, // [ {name, hp}, ... ] 배열 복사
            [`${mySlot}_active_idx`]: 0
        });
    }

    startBattleListener();
    setupControls();
});

// 3. 실시간 화면 업데이트
function startBattleListener() {
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data) return;

        // P1, P2 데이터가 있을 때 각각 화면 갱신
        if (data.p1_entry) updateUI("p1", data);
        if (data.p2_entry) updateUI("p2", data);
    });
}

function updateUI(slot, data) {
    const entry = data[`${slot}_entry`];
    const activeIdx = data[`${slot}_active_idx`] || 0;
    const activePkmn = entry[activeIdx];

    // 이름 및 활성 포켓몬 정보
    document.getElementById(`${slot}-name-display`).innerText = data[`player${slot === "p1" ? 1 : 2}_name`];
    document.getElementById(`${slot}-active-name`).innerText = activePkmn.name;
    document.getElementById(`${slot}-active-hp`).innerText = activePkmn.hp;

    // 대기 포켓몬 표시
    if (slot === mySlot) {
        // 내꺼면 교체 버튼 생성
        const btnContainer = document.getElementById(`${slot}-bench-btns`);
        btnContainer.innerHTML = ""; 
        entry.forEach((pkmn, idx) => {
            if (idx !== activeIdx) {
                const btn = document.createElement("button");
                btn.innerText = `${pkmn.name}(${pkmn.hp})`;
                btn.onclick = () => switchPokemon(idx);
                btnContainer.appendChild(btn);
            }
        });
    } else {
        // 상대꺼면 구석에 이름만 표시
        const benchText = entry.filter((_, i) => i !== activeIdx).map(p => p.name).join(", ");
        document.getElementById(`${slot}-bench`).innerText = "대기: " + (benchText || "없음");
    }
}

// 4. 교체 및 공격 기능
async function switchPokemon(newIdx) {
    await updateDoc(roomRef, { [`${mySlot}_active_idx`]: newIdx });
}

function setupControls() {
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const enemySlot = mySlot === "p1" ? "p2" : "p1";
        
        if (!data[`${enemySlot}_entry`]) return;

        const enemyEntry = [...data[`${enemySlot}_entry`]];
        const enemyIdx = data[`${enemySlot}_active_idx`];
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 20);

        await updateDoc(roomRef, { [`${enemySlot}_entry`]: enemyEntry });
    };
}
