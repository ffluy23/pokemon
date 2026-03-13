import { db } from "./firebase.js";
import { 
    doc, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * HTML에서 호출하는 메인 함수
 * @param {string} roomId - "battleroom1"과 같은 방 아이디
 */
export function loadBattle(roomId) {
    // 1. 해당 방의 참조(Reference) 생성
    const roomRef = doc(db, "rooms", roomId);

    console.log(`${roomId} 데이터를 불러오는 중...`);

    // 2. 실시간 데이터 감시 (onSnapshot)
    // 데이터가 변경될 때마다 이 내부 코드가 자동으로 실행됨
    onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) {
            console.error("방 정보를 찾을 수 없습니다.");
            return;
        }

        const room = snap.data();

        // --- 플레이어 1 정보 업데이트 ---
        const p1NameDisplay = document.getElementById("player1_name");
        const p1HpDisplay = document.getElementById("player1_hp");

        if (p1NameDisplay) {
            // 이름이 없으면 "대기 중..." 표시
            p1NameDisplay.innerText = room.player1_name || "대기 중...";
        }
        if (p1HpDisplay) {
            // HP가 undefined거나 null이면 0으로 표시
            p1HpDisplay.innerText = room.player1_hp ?? 0;
        }

        // --- 플레이어 2 정보 업데이트 ---
        const p2NameDisplay = document.getElementById("player2_name");
        const p2HpDisplay = document.getElementById("player2_hp");

        if (p2NameDisplay) {
            p2NameDisplay.innerText = room.player2_name || "대기 중...";
        }
        if (p2HpDisplay) {
            p2HpDisplay.innerText = room.player2_hp ?? 0;
        }

        console.log("데이터 업데이트 완료:", room);
    }, (error) => {
        console.error("실시간 감시 중 오류 발생:", error);
    });
}
