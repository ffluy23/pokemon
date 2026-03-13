import { db, auth } from "./firebase.js";
import { 
    doc, onSnapshot, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // 1. 현재 로그인한 유저의 정보(엔트리 3마리) 가져오기
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) return;
        
        const userEntry = userDoc.data().entry; // [{name:.., hp:..}, {name:.., hp:..}, {name:.., hp:..}]

        // 2. 현재 방 데이터 확인
        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        if (!roomData) return;

        // 3. 내가 Player1인지 Player2인지 확인
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";

        // 4. [최초 복사] 해당 슬롯의 엔트리가 비어있다면 전체 복사
        if (!roomData[`${mySlot}_entry` Marc]) { // <--- 만약 'Marc'가 보이면 지워줘! `${mySlot}_entry` 가 맞음
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userEntry,
                [`${mySlot}_active_idx`]: 0 // 첫 번째 포켓몬으로 시작
            });
        }

        // 버튼 클릭 시 작동할 공격/치유 로직 연결
        setupControls(mySlot, roomRef);
    });

    // 5. 실시간 데이터 감시 및 화면 업데이트
    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        // 두 플레이어 모두의 정보를 업데이트
        ["player1", "player2"].forEach(slot => {
            const entry = room[`${slot}_entry`];
            const idx = room[`${slot}_active_idx`] ?? 0;
            
            // 엔트리 정보가 있고 해당 순서의 포켓몬이 존재하면 화면에 출력
            if (entry && entry[idx]) {
                const pokemon = entry[idx];
                const nameTag = document.getElementById(`${slot}_name`);
                const hpTag = document.getElementById(`${slot}_hp`);
                
                if (nameTag) nameTag.innerText = pokemon.name;
                if (hpTag) hpTag.innerText = pokemon.hp;
            }
        });
    });
}

function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "player1" ? "player2" : "player1";

    // 공격 버튼: 상대방 현재 포켓몬 HP 깎기
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const enemyEntry = [...(data[`${enemySlot}_entry`] || [])];
        const enemyIdx = data[`${enemySlot}_active_idx`] ?? 0;

        if (enemyEntry[enemyIdx]) {
            enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 40);
            await updateDoc(roomRef, {
                [`${enemySlot}_entry`]: enemyEntry
            });
        }
    };

    // 치유 버튼: 내 현재 포켓몬 HP 회복
    document.getElementById("healBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const myEntry = [...(data[`${mySlot}_entry`] || [])];
        const myIdx = data[`${mySlot}_active_idx`] ?? 0;

        if (myEntry[myIdx]) {
            // 현재 엔트리 구조상 최대체력을 따로 안뒀으니 임시로 100 설정
            const maxHp = 100;
            myEntry[myIdx].hp = Math.min(maxHp, myEntry[myIdx].hp + 20);
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: myEntry
            });
        }
    };
}
