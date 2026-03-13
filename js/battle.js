import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

// 현재 내가 어떤 방에 있는지, 내가 P1인지 P2인지 설정 (로그인 정보 등에 따라 가변적)
const roomId = "battleroom1"; 
const myRole = "player1"; // "player1" 또는 "player2"
const opponentRole = myRole === "player1" ? "player2" : "player1";

/**
 * 1. 전투 시작: 유저의 entry를 배틀룸으로 복사해오기
 */
async function startBattle(userId) {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // 핵심: users의 entry(array)를 그대로 가져와서 rooms에 복사함
        await updateDoc(doc(db, "rooms", roomId), {
            [`${myRole}_name`]: userData.name,
            [`${myRole}_entry`]: userData.entry, // [ {name, hp}, ... ] 배열 통째로 복사
            [`${myRole}_currentIdx`]: 0          // 0번 포켓몬을 선두로 설정
        });
        console.log("전투 준비 완료: 데이터 복사 성공");
    }
}

/**
 * 2. 실시간 화면 업데이트 (onSnapshot)
 */
function listenBattle() {
    onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
        const data = docSnap.data();
        if (!data) return;

        // 플레이어 이름 표시
        document.getElementById("p1-name").innerText = data.player1_name || "P1";
        document.getElementById("p2-name").innerText = data.player2_name || "P2";

        // 내 정보 업데이트 (UI 반영)
        renderPokeInfo(data, "player1", "p1");
        renderPokeInfo(data, "player2", "p2");
    });
}

// UI를 그리는 공통 함수
function renderPokeInfo(data, role, prefix) {
    const entry = data[`${role}_entry`];
    const currentIdx = data[`${role}_currentIdx`] || 0;
    
    if (entry && entry[currentIdx]) {
        const mainPoke = entry[currentIdx];
        const container = document.getElementById(`${prefix}-main-poke`);
        container.querySelector(".poke-name").innerText = mainPoke.name;
        container.querySelector(".hp-val").innerText = mainPoke.hp;

        // 내 포켓몬일 경우에만 대기석 버튼 업데이트
        if (role === myRole) {
            entry.forEach((poke, idx) => {
                if (idx !== currentIdx) {
                    // 메인이 아닌 포켓몬을 버튼에 표시
                    const btnIdx = idx === 0 ? 0 : idx; // 단순화를 위해 버튼 ID 매칭
                    const btn = document.getElementById(`btn-poke-${idx}`);
                    if (btn) btn.innerText = `${poke.name} (HP: ${poke.hp})`;
                }
            });
        }
    }
}

/**
 * 3. 포켓몬 교체 기능 (버튼 클릭 시)
 */
window.switchPokemon = async function(newIdx) {
    await updateDoc(doc(db, "rooms", roomId), {
        [`${myRole}_currentIdx`]: newIdx
    });
    console.log(`${newIdx}번 포켓몬으로 교체되었습니다!`);
};

/**
 * 4. 공격 기능 (예시: 상대 HP 15 감소)
 */
window.attack = async function() {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    const data = snap.data();

    let oppEntry = [...data[`${opponentRole}_entry`]];
    let oppIdx = data[`${opponentRole}_currentIdx`] || 0;

    // 현재 나와있는 상대 포켓몬 HP 깎기
    oppEntry[oppIdx].hp = Math.max(0, oppEntry[oppIdx].hp - 15);

    // rooms 데이터만 업데이트 (원본 users는 건드리지 않음)
    await updateDoc(roomRef, {
        [`${opponentRole}_entry`]: oppEntry
    });
};

// 페이지 로드 시 리스너 실행
listenBattle();
// 실제로는 로그인한 유저 ID를 넣어야 함 (테스트용)
// startBattle("user_123"); 
