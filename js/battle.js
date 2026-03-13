import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 현재 파일명이 battleroom1.html 이라면 ROOM_ID는 "battleroom1"이 됨
const ROOM_ID = window.location.pathname.split('/').pop().replace('.html', '');
const roomRef = doc(db, "rooms", ROOM_ID);

let mySlot = null; // "p1" 또는 "p2"

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        location.href = "../main.html"; // 로그인 없으면 팅기게
        return;
    }

    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();

    // 내가 P1인지 P2인지 슬롯 결정 (대기실에서 저장된 UID 기준)
    if (roomData.player1_uid === user.uid) mySlot = "p1";
    else if (roomData.player2_uid === user.uid) mySlot = "p2";

    if (!mySlot) {
        alert("이 방의 멤버가 아닙니다.");
        return;
    }

    listenBattle();
});

// 1. 실시간 전투 데이터 감시
function listenBattle() {
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data || !data.p1_entry || !data.p2_entry) return;

        // 화면 업데이트 실행
        updateUI("p1", data);
        updateUI("p2", data);
    });
}

// 2. UI 업데이트 함수
function updateUI(slot, data) {
    const entry = data[`${slot}_entry`];
    const activeIdx = data[`${slot}_active_idx`];
    const activePkmn = entry[activeIdx];

    // 제목 이름 표시 (P1: 지우 이런 식)
    const displayName = data[`player${slot === "p1" ? 1 : 2}_name`];
    document.getElementById(`${slot}-name-title`).innerText = displayName;

    // 현재 나와있는 포켓몬 정보
    document.getElementById(`${slot}-active-name`).innerText = activePkmn.name;
    document.getElementById(`${slot}-hp-bar`).value = activePkmn.hp;
    document.getElementById(`${slot}-hp-text`).innerText = `${activePkmn.hp} / 100`;

    // 대기 포켓몬 처리
    if (slot === mySlot) {
        // 내 슬롯이면: 버튼 생성 (클릭 시 교체)
        const btnContainer = document.getElementById("p1-bench-btns");
        btnContainer.innerHTML = ""; // 초기화
        entry.forEach((pkmn, idx) => {
            if (idx !== activeIdx) {
                const btn = document.createElement("button");
                btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
                btn.style.marginRight = "5px";
                btn.onclick = () => switchPokemon(idx);
                btnContainer.appendChild(btn);
            }
        });
    } else {
        // 상대방 슬롯이면: 구석에 텍스트만 표시
        const benchArea = document.getElementById(`${slot}-bench`);
        const benchText = entry
            .filter((_, idx) => idx !== activeIdx)
            .map(p => `${p.name}(HP:${p.hp})`)
            .join(" | ");
        benchArea.innerText = "대기 포켓몬: " + (benchText || "없음");
    }
}

// 3. 포켓몬 교체 기능
async function switchPokemon(newIdx) {
    await updateDoc(roomRef, {
        [`${mySlot}_active_idx`]: newIdx
    });
    console.log(`${newIdx}번 포켓몬으로 교체 시도`);
}

// 4. 공격 기능 (상대방 HP 깎기)
window.attack = async () => {
    const snap = await getDoc(roomRef);
    const data = snap.data();
    
    const enemySlot = mySlot === "p1" ? "p2" : "p1";
    const enemyEntry = [...data[`${enemySlot}_entry`]]; // 배열 복사 (불변성 유지)
    const enemyIdx = data[`${enemySlot}_active_idx`];

    // HP 감소 로직
    if (enemyEntry[enemyIdx].hp > 0) {
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 20);
        
        await updateDoc(roomRef, {
            [`${enemySlot}_entry`]: enemyEntry
        });
        console.log("공격 성공!");
    } else {
        alert("이미 쓰러진 포켓몬입니다!");
    }
};
