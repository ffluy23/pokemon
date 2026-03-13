import { db, auth } from "./firebase.js";
import { 
    doc, onSnapshot, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userEntry = userDoc.data().entry; // [{name: "...", hp: 100}, ...]

        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";

        // 최초 1회 복사: rooms에 엔트리 배열이 없으면 복사
        if (!roomData[`${mySlot}_entry` Marc]) {
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userEntry,
                [`${mySlot}_active_idx`]: 0
            });
        }

        setupControls(mySlot, roomRef);
    });

    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        ["player1", "player2"].forEach(slot => {
            const entry = room[`${slot}_entry`];
            const idx = room[`${slot}_active_idx`] ?? 0;
            
            if (entry && entry[idx]) {
                const pokemon = entry[idx];
                // HTML의 ID와 매칭 (player1_name, player1_hp 등)
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

    // 공격: 상대방의 현재 포켓몬 HP 깎기
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const enemyEntry = [...(data[`${enemySlot}_entry`] || [])];
        const enemyIdx = data[`${enemySlot}_active_idx`] ?? 0;

        if (enemyEntry[enemyIdx]) {
            enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 40);
            await updateDoc(roomRef, { [`${enemySlot}_entry`]: enemyEntry });
        }
    };

    // 치유: 내 현재 포켓몬 HP 회복
    document.getElementById("healBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const myEntry = [...(data[`${mySlot}_entry`] || [])];
        const myIdx = data[`${mySlot}_active_idx`] ?? 0;

        if (myEntry[myIdx]) {
            // 현재 maxHp 데이터가 따로 없으므로 임시로 100을 최대치로 설정
            const maxHp = 100; 
            myEntry[myIdx].hp = Math.min(maxHp, myEntry[myIdx].hp + 20);
            await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry });
        }
    };
}
