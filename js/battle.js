import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

// 현재 어떤 방에 들어와 있는지와 내 역할(p1 or p2)을 설정
// 실제로는 URL 파라미터나 로그인 세션에서 가져와야 함
const currentRoomId = "battleroom1"; 
const myRole = "player1"; // "player1" 또는 "player2"
const opponentRole = myRole === "player1" ? "player2" : "player1";

/**
 * 1. 유저 데이터를 배틀룸으로 통째로 복사해오는 함수
 * @param {string} uid - users 컬렉션에 있는 유저의 uid
 */
async function prepareBattle(uid) {
    try {
        // A. users 컬렉션에서 내 데이터 가져오기
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.error("유저 데이터를 찾을 수 없습니다.");
            return;
        }

        const userData = userSnap.data();
        
        // B. 배틀룸(rooms)의 내 역할 위치에 통째로 복사
        // entry 배열을 그대로 복사해 넣음
        const roomRef = doc(db, "rooms", currentRoomId);
        await updateDoc(roomRef, {
            [`${myRole}_name`]: userData.name || "Unknown",
            [`${myRole}_entry`]: userData.entry, // [ {name, hp}, ... ] 배열 복사
            [`${myRole}_currentIdx`]: 0           // 0번을 선두로 시작
        });

        console.log("복사 완료! 전투를 시작합니다.");
    } catch (err) {
        console.error("데이터 복사 에러:", err);
    }
}

/**
 * 2. 배틀룸 실시간 감시 및 UI 업데이트
 */
function watchBattle() {
    onSnapshot(doc(db, "rooms", currentRoomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // 양쪽 플레이어 이름 업데이트
        document.getElementById("p1-name-display").innerText = data.player1_name || "대기중";
        document.getElementById("p2-name-display").innerText = data.player2_name || "대기중";

        // 각 플레이어별 포켓몬 UI 업데이트
        updatePlayerUI(data, "player1", "p1");
        updatePlayerUI(data, "player2", "p2");
    });
}

function updatePlayerUI(data, role, prefix) {
    const entry = data[`${role}_entry`];
    const currentIdx = data[`${role}_currentIdx`] ?? 0;

    if (!entry || entry.length === 0) return;

    // 선두 포켓몬 정보 (0번 또는 지정된 인덱스)
    const activePoke = entry[currentIdx];
    const mainArea = document.getElementById(`${prefix}-main-poke`);
    mainArea.querySelector(".poke-name").innerText = activePoke.name;
    mainArea.querySelector(".poke-hp").innerText = `HP: ${activePoke.hp}`;

    // 내 진영일 경우에만 교체용 버튼 생성
    if (role === myRole) {
        const benchArea = document.getElementById(`${prefix}-bench`);
        benchArea.innerHTML = ""; // 초기화

        entry.forEach((poke, index) => {
            // 현재 싸우는 놈이 아니면 구석에 버튼으로 배치
            if (index !== currentIdx) {
                const btn = document.createElement("button");
                btn.innerText = `${poke.name} (${poke.hp})`;
                btn.onclick = () => switchPokemon(index);
                benchArea.appendChild(btn);
            }
        });
    }
}

/**
 * 3. 포켓몬 교체 기능
 */
async function switchPokemon(newIndex) {
    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, {
        [`${myRole}_currentIdx`]: newIndex
    });
}

// --- 실행 부분 ---
// 1. 유저의 uid를 넣어 복사를 실행 (실제 게임 진입 시점)
// prepareBattle("실제_유저_UID"); 

// 2. 실시간 감시 시작
watchBattle();
