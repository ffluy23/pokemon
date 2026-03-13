import { db, auth } from "./firebase.js";
import { 
    doc, onSnapshot, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // [최초 1회] 내 유저 데이터의 entry 배열 전체를 방으로 복사
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userEntry = userDoc.data().entry; // [{name:... , hp:...}, ...]

        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";

        // 방에 내 엔트리가 아직 복사되지 않았다면 복사 실행
        if (!roomData[`${mySlot}_entry` Marc]) {
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userEntry,
                [`${mySlot}_active_idx`]: 0 // 첫 번째 포켓몬부터 시작
            });
        }

        setupControls(mySlot, roomRef);
    });

    // 실시간 화면 업데이트 (onSnapshot)
    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        updateUI("player1", room);
        updateUI("player2", room);
    });
}

// 화면에 이름과 HP를 뿌려주는 보조 함수
function updateUI(slot, roomData) {
    const entry = roomData[`${slot}_entry`];
    const idx = roomData[`${slot}_active_idx`] ?? 0;
    
    if (entry && entry[idx]) {
        const currentPokemon = entry[idx];
        document.getElementById(`${slot}_name`).innerText = currentPokemon.name;
        // 현재 HP 표시 (maxHp는 원본 배열의 hp값을 기준으로 판단)
        document.getElementById(`${slot}_hp`).innerText = currentPokemon.hp;
    }
}

function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "player1" ? "player2" : "player1";

    // 공격 버튼 (상대 엔트리 중 현재 활성화된 포켓몬의 HP를 깎음)
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const enemyEntry = [...data[`${enemySlot}_entry`]]; // 배열 복사
        const enemyIdx = data[`${enemySlot}_active_idx`] ?? 0;

        // 데미지 40 적용
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 40);

        await updateDoc(roomRef, {
            [`${enemySlot}_entry`]: enemyEntry
        });
    };

    // 치유 버튼 (내 엔트리 중 현재 활성화된 포켓몬의 HP를 회복)
    document.getElementById("healBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const myEntry = [...data[`${mySlot}_entry`]]; // 배열 복사
        const myIdx = data[`${mySlot}_active_idx`] ?? 0;

        // 원본 유저 데이터에서 최대 체력을 가져오려면 복잡하니, 
        // 여기서는 간단하게 초기 복사된 시점의 HP를 최대치라고 가정하거나 
        // 기술적으로 100을 최대치로 잡을 수 있어. (일단 100으로 예시)
        const maxHp = 100; 
        myEntry[myIdx].hp = Math.min(maxHp, myEntry[myIdx].hp + 20);

        await updateDoc(roomRef, {
            [`${mySlot}_entry`]: myEntry
        });
    };
}
