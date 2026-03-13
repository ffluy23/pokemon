import { db, auth } from "./firebase.js";
import { 
    doc, 
    onSnapshot, 
    getDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 우리가 만든 조각들 가져오기 ---
import { moves } from "./moves.js";
import { getTypeMultiplier } from "./Typechart.js";
import { checkSuccess } from "./Probability.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    // 1. 로그인 상태 확인 및 기술 버튼 세팅
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        
        // 내 기술 정보를 Firestore에서 가져와서 버튼에 입히기
        await setupMoveButtons(user.uid, roomRef);
    });

    // 2. 실시간 데이터 감시 (기존 기능 유지)
    onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) return;
        const room = snap.data();

        // 플레이어 1 UI 업데이트
        document.getElementById("player1_name").innerText = room.player1_name || "대기 중...";
        document.getElementById("player1_hp").innerText = room.player1_hp ?? 0;

        // 플레이어 2 UI 업데이트
        document.getElementById("player2_name").innerText = room.player2_name || "대기 중...";
        document.getElementById("player2_hp").innerText = room.player2_hp ?? 0;
    });
}

/**
 * 기술 버튼에 데이터를 입히고 클릭 이벤트를 설정하는 함수
 */
async function setupMoveButtons(myUid, roomRef) {
    // 내 유저 데이터 가져오기 (entry[0].moves 추출용)
    const userDoc = await getDoc(doc(db, "users", myUid));
    if (!userDoc.exists()) return;

    const myEntry = userDoc.data().entry[0];
    const myMoves = myEntry.moves; // 예: ["번개펀치", "10만볼트", ...]

    // 방 데이터 가져오기 (내가 P1인지 P2인지 확인용)
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();
    
    const mySlot = roomData.player1_uid === myUid ? "player1" : "player2";
    const enemySlot = mySlot === "player1" ? "player2" : "player1";

    // 기술 버튼 4개에 조각들 조립
    myMoves.forEach((moveName, index) => {
        const btn = document.getElementById(`move-${index}`);
        const moveData = moves[moveName]; // moves.js에서 데이터 조회

        if (btn && moveData) {
            btn.innerText = moveName;
            btn.disabled = false;

            btn.onclick = async () => {
                // [조립 단계 1] 상성 계산을 위한 상대방 타입 가져오기
                // Firestore의 room에 상대 타입을 저장해뒀다고 가정하거나, 기본값 설정
                const enemyTypes = roomData[`${enemySlot}_type`] || ["노말"]; 
                
                // [조립 단계 2] 상성 조각 사용
                const multiplier = getTypeMultiplier(moveData.type, enemyTypes);
                const finalDamage = Math.floor(moveData.power * multiplier);

                // [조립 단계 3] 확률 및 상태이상 조각 사용
                let statusEffect = null;
                if (moveData.effect && checkSuccess(moveData.effect.chance)) {
                    statusEffect = moveData.effect.status;
                }

                // [조립 단계 4] Firestore 업데이트 (상대 HP 깎기)
                const currentEnemyHp = roomData[`${enemySlot}_hp`] ?? 0;
                const updates = {};
                updates[`${enemySlot}_hp`] = Math.max(0, currentEnemyHp - finalDamage);
                
                if (statusEffect) {
                    updates[`${enemySlot}_status`] = statusEffect; // 상태이상 저장
                }

                await updateDoc(roomRef, updates);

                alert(`${moveName}! ${finalDamage} 데미지! ${statusEffect ? statusEffect + " 발생!" : ""}`);
            };
        }
    });
}
