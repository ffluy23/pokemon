import { db } from './firebase-config.js';
import { doc, onSnapshot, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

const roomId = "battleroom1";
const myRole = "player1"; // 상황에 맞게 player2로 변경 가능

// 1. 실시간 데이터 불러오기 (핵심)
function initBattleWatcher() {
    const roomRef = doc(db, "rooms", roomId);

    // onSnapshot은 데이터가 바뀔 때마다 실행됨
    onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            console.log("배틀룸 데이터를 찾을 수 없어!");
            return;
        }

        const data = snapshot.data();
        console.log("불러온 데이터:", data); // 여기서 콘솔 확인 필수!

        // player1_entry 배열이 있는지 확인
        const entry = data[`${myRole}_entry`];
        const currentIdx = data[`${myRole}_currentIdx`] ?? 0;

        if (entry && Array.isArray(entry)) {
            renderScreen(data, entry, currentIdx);
        } else {
            console.log("Entry 배열을 아직 불러오지 못했어.");
        }
    });
}

// 2. 화면에 그려주는 함수 (구분해서 표시)
function renderScreen(data, entry, currentIdx) {
    // A. 선두 포켓몬 (중앙)
    const activePoke = entry[currentIdx];
    const mainDiv = document.getElementById("p1-main-pokemon");
    mainDiv.innerHTML = `
        <h3>${activePoke.name}</h3>
        <p>HP: ${activePoke.hp}</p>
        <progress value="${activePoke.hp}" max="100"></progress>
    `;

    // B. 나머지 포켓몬 (구석/버튼)
    const benchDiv = document.getElementById("sub-entries");
    benchDiv.innerHTML = ""; // 기존 내용 삭제

    entry.forEach((poke, index) => {
        // 현재 선두가 아닌 녀석들만 버튼으로 만듦
        if (index !== currentIdx) {
            const btn = document.createElement("button");
            btn.className = "bench-btn";
            btn.innerHTML = `
                <div>${poke.name}</div>
                <div style="font-size: 10px;">HP: ${poke.hp}</div>
            `;
            // 클릭 시 교체 함수 실행
            btn.onclick = () => switchPokemon(index);
            benchDiv.appendChild(btn);
        }
    });

    // C. 플레이어 이름 표시
    document.getElementById("player1_name").innerText = data.player1_name || "준비중";
    document.getElementById("player2_name").innerText = data.player2_name || "준비중";
}

// 3. 포켓몬 교체 함수
async function switchPokemon(newIdx) {
    try {
        const roomRef = doc(db, "rooms", roomId);
        await updateDoc(roomRef, {
            [`${myRole}_currentIdx`]: newIdx
        });
        console.log(`${newIdx}번 포켓몬으로 교체 완료!`);
    } catch (e) {
        console.error("교체 실패:", e);
    }
}

// 실행
initBattleWatcher();
