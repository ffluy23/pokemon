import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9/firebase-firestore.js";

async function initializeBattle(userId, roomId, playerType) {
    // playerType은 'player1' 또는 'player2' 문자열
    try {
        // 1. users 컬렉션에서 해당 유저의 문서를 가져옴
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            const userEntry = userData.entry; // [ {name: "피카츄", hp: 100}, ... ]

            // 2. rooms 컬렉션의 해당 배틀룸 문서 참조
            const roomRef = doc(db, "rooms", roomId);

            // 3. 데이터를 배틀룸에 복사 (ES6 계산된 문법 활용)
            await updateDoc(roomRef, {
                [`${playerType}_name`]: userData.name || userId, // 유저 이름
                [`${playerType}_entry`]: userEntry,              // 엔트리 배열 통째로 복사
                [`${playerType}_currentIdx`]: 0                  // 선두 포켓몬 설정
            });

            console.log(`${roomId}에 ${playerType} 데이터 복사 완료!`);
        } else {
            console.error("유저 데이터를 찾을 수 없어!");
        }
    } catch (error) {
        console.error("데이터 복사 중 오류 발생:", error);
    }
}
