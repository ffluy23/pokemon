import { db, auth } from "./firebase.js";
import { doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        if (!roomData) return;

        // 내가 P1인지 P2인지 판별 (대기실 UID 기준)
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";
        const myPrefix = mySlot === "player1" ? "p1" : "p2";

        // [최초 1회] 내 엔트리 전체 복사
        if (!roomData[`${myPrefix}_entry`]) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const myEntry = userDoc.data().entry; // [ {name, hp}, ... ]

            await updateDoc(roomRef, {
                [`${myPrefix}_entry`]: myEntry,
                [`${myPrefix}_active_idx`]: 0 // 0번 선두
            });
        }

        setupControls(mySlot, roomRef);
    });

    // 실시간 화면 업데이트
    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        // Player 1 정보 업데이트
        if (room.p1_entry) {
            updatePlayerUI("player1", room);
        }

        // Player 2 정보 업데이트
        if (room.p2_entry) {
            updatePlayerUI("player2", room);
        }
    });
}

function updatePlayerUI(slot, room) {
    const prefix = slot === "player1" ? "p1" : "p2";
    const entry = room[`${prefix}_entry`];
    const idx = room[`${prefix}_active_idx`] || 0;
    const activePkmn = entry[idx];

    // 기본 이름/HP 표시
    document.getElementById(`${slot}_name`).innerText = room[`${slot}_name`] || "대기...";
    document.getElementById(`${slot}_active_name`).innerText = activePkmn.name;
    document.getElementById(`${slot}_hp`).innerText = activePkmn.hp;
    document.getElementById(`${slot === "player1" ? "p1" : "p2"}-max-hp`).innerText = "100"; // 기본값 100

    // 내가 P1일 때 내 버튼들 업데이트
    const currentUser = auth.currentUser;
    const isMe = (slot === "player1" && room.player1_uid === currentUser?.uid) || 
                 (slot === "player2" && room.player2_uid === currentUser?.uid);

    if (isMe) {
        const btnArea = document.getElementById("p1-bench-btns");
        btnArea.innerHTML = ""; // 초기화
        entry.forEach((pkmn, i) => {
            if (i !== idx) {
                const btn = document.createElement("button");
                btn.innerText = `${pkmn.name} 교체`;
                btn.onclick = () => switchPokemon(prefix, i, doc(db, "rooms", "battleroom1")); // 실제 룸ID로 교체필요
                btnArea.appendChild(btn);
            }
        });
    } else {
        // 상대방 대기 정보는 텍스트로
        const benchArea = document.getElementById(`${prefix}-bench`);
        const bench = entry.filter((_, i) => i !== idx).map(p => p.name).join(", ");
        benchArea.innerText = "대기: " + (bench || "없음");
    }
}

async function switchPokemon(prefix, newIdx, roomRef) {
    await updateDoc(roomRef, { [`${prefix}_active_idx`]: newIdx });
}

function setupControls(mySlot, roomRef) {
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const myPrefix = mySlot === "player1" ? "p1" : "p2";
        const enemyPrefix = mySlot === "player1" ? "p2" : "p1";
        
        if (!data[`${enemyPrefix}_entry`]) return;

        const enemyEntry = [...data[`${enemyPrefix}_entry`]];
        const enemyIdx = data[`${enemyPrefix}_active_idx`];

        // 대미지 20 감소
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 20);

        await updateDoc(roomRef, { [`${enemyPrefix}_entry`]: enemyEntry });
    };
}
