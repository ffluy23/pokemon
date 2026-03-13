import { db, auth } from "./firebase.js";
import { doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 룸 ID 설정 (예: battleroom1)
const ROOM_ID = "battleroom1"; 
const roomRef = doc(db, "rooms", ROOM_ID);

let mySlot = null; // 'p1' 또는 'p2'

export function initBattle() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();

        // 1. 내가 P1인지 P2인지 결정
        if (roomData.player1_uid === user.uid) mySlot = "p1";
        else if (roomData.player2_uid === user.uid) mySlot = "p2";

        if (!mySlot) return; // 방 참여자가 아니면 중단

        // 2. [최초 1회] 내 포켓몬 엔트리 복사
        // 방에 내 엔트리가 아직 없으면 유저 정보에서 긁어옴
        if (!roomData[`${mySlot}_entry`]) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userDoc.data().entry, // [ {name, hp}, ... ]
                [`${mySlot}_active_idx`]: 0
            });
        }

        startListening();
        setupInputEvents();
    });
}

// 실시간 데이터 감시 및 화면 그리기
function startListening() {
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data) return;

        // 양쪽 데이터가 다 차야 배틀 화면을 제대로 그림
        if (data.p1_entry && data.p2_entry) {
            renderPlayer(data, "p1");
            renderPlayer(data, "p2");
        }
    });
}

// 플레이어 정보 렌더링 (p1, p2 공용)
function renderPlayer(data, slot) {
    const entry = data[`${slot}_entry`];
    const activeIdx = data[`${slot}_active_idx`];
    const activePkmn = entry[activeIdx];

    // 1. 선두 포켓몬 UI 업데이트
    document.getElementById(`${slot}-name`).innerText = data[`player${slot === "p1" ? 1 : 2}_name`];
    document.getElementById(`${slot}-active-name`).innerText = activePkmn.name;
    document.getElementById(`${slot}-hp-bar`).value = activePkmn.hp;
    document.getElementById(`${slot}-hp-text`).innerText = `${activePkmn.hp} / 100`;

    // 2. 대기 포켓몬 표시 (교체 버튼 포함)
    if (slot === mySlot) {
        // 내 슬롯일 경우: 교체 버튼 활성화
        let btnIdx = 0;
        entry.forEach((pkmn, idx) => {
            if (idx !== activeIdx) {
                const btn = document.getElementById(`btn-sub-${btnIdx}`);
                if (btn) {
                    btn.style.display = "inline-block";
                    btn.innerText = `${pkmn.name} (HP:${pkmn.hp})`;
                    btn.onclick = () => switchPokemon(idx);
                }
                btnIdx++;
            }
        });
    } else {
        // 상대방 슬롯일 경우: 구석에 이름만 표시
        const enemyBench = document.getElementById(`${slot}-bench`);
        const benchNames = entry
            .filter((_, idx) => idx !== activeIdx)
            .map(p => `${p.name}(HP:${p.hp})`)
            .join(" | ");
        enemyBench.innerText = "대기: " + benchNames;
    }
}

// 교체 로직
async function switchPokemon(newIdx) {
    await updateDoc(roomRef, {
        [`${mySlot}_active_idx`]: newIdx
    });
}

// 조작 버튼 세팅
function setupInputEvents() {
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const enemySlot = mySlot === "p1" ? "p2" : "p1";
        const enemyEntry = [...data[`${enemySlot}_entry`]];
        const enemyActiveIdx = data[`${enemySlot}_active_idx`];

        // 대미지 계산 (예: 20)
        enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - 20);

        await updateDoc(roomRef, {
            [`${enemySlot}_entry`]: enemyEntry
        });
    };
}

// 실행
initBattle();
