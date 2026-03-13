import { db } from './firebase-config.js'; // 설정 파일
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

let currentRoomId = "battleroom1"; // 예시 룸 ID
let myPlayerNum = "player1"; // 내가 player1인지 player2인지 구분
let myEntry = []; // 유저의 원본 entry 복사본

// 1. 초기 설정: 유저 entry를 battleroom으로 복사
async function initializeBattle(userId, roomId) {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
        myEntry = userDoc.data().entry; // [{name, hp}, {name, hp}, {name, hp}]
        
        // battleroom의 해당 플레이어 자리에 entry 데이터 복사
        await updateDoc(doc(db, "rooms", roomId), {
            [`${myPlayerNum}_entry`]: myEntry,
            [`${myPlayerNum}_name`]: userId,
            [`${myPlayerNum}_currentIdx`]: 0 // 현재 나와있는 포켓몬 인덱스
        });
    }
}

// 2. 실시간 리스너: Firestore의 battleroom 데이터 감시 및 화면 업데이트
function listenBattle(roomId) {
    onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // 플레이어 이름 표시
        document.getElementById("player1-name").innerText = data.player1_name;
        document.getElementById("player2-name").innerText = data.player2_name;

        // 내 포켓몬 데이터 업데이트 (player1 기준 예시)
        updateUI(data.player1_entry, data.player1_currentIdx, "p1");
        // 상대방 데이터 업데이트
        updateUI(data.player2_entry, data.player2_currentIdx, "p2");
    });
}

function updateUI(entry, currentIdx, prefix) {
    const main = entry[currentIdx];
    
    // 메인 포켓몬 정보 업데이트
    document.querySelector(`#${prefix}-main-pokemon .name`).innerText = main.name;
    const hpBar = document.getElementById(`${prefix}-hp-bar`);
    hpBar.value = main.hp;
    // max hp는 원본 entry값을 참조하거나 따로 저장하는 것이 좋음
    document.getElementById(`${prefix}-hp-text`).innerText = `${main.hp} / 100`;

    // 내 포켓몬일 경우에만 교체 버튼 업데이트
    if (prefix === "p1") {
        entry.forEach((poke, index) => {
            if (index !== currentIdx) {
                const btn = document.getElementById(`entry-${index === 0 ? 1 : index}`); 
                // 위 로직은 인덱스에 따라 버튼 매칭 (단순화함)
                if(btn) btn.innerText = `${poke.name} (HP: ${poke.hp})`;
            }
        });
    }
}

// 3. 포켓몬 교체 함수
async function switchPokemon(newIdx) {
    await updateDoc(doc(db, "rooms", currentRoomId), {
        [`${myPlayerNum}_currentIdx`]: newIdx
    });
    console.log(`${newIdx}번 포켓몬으로 교체!`);
}

// 4. 공격 함수 (예시: 상대 HP 10 감소)
async function attack() {
    const roomRef = doc(db, "rooms", currentRoomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();
    
    const opponentNum = myPlayerNum === "player1" ? "player2" : "player1";
    let oppEntry = [...data[`${opponentNum}_entry`]];
    let oppIdx = data[`${opponentNum}_currentIdx`];
    
    // 현재 나와있는 상대 포켓몬 HP 감소
    oppEntry[oppIdx].hp = Math.max(0, oppEntry[oppIdx].hp - 10);

    await updateDoc(roomRef, {
        [`${opponentNum}_entry`]: oppEntry
    });
}
