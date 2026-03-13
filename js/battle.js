import { db, auth } from "./firebase.js";
import { doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.error("로그인이 필요해!");
            return;
        }

        // 1. 방 정보 가져오기
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) return;
        const roomData = roomSnap.data();

        // 2. 내가 P1인지 P2인지 결정
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";
        const myPrefix = mySlot === "player1" ? "p1" : "p2";

        // 3. [최초 1회] 내 엔트리 전체 복사 (이미 있으면 건너뜀)
        if (!roomData[`${myPrefix}_entry`]) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                // users/entry 데이터를 그대로 rooms로 복사
                await updateDoc(roomRef, {
                    [`${myPrefix}_entry`]: userData.entry, // [ {name, hp, maxHp}, ... ]
                    [`${myPrefix}_active_idx`]: 0,
                    [`${mySlot}_name`]: userData.nickname || user.email.split('@')[0]
                });
            }
        }

        // 4. 조작 버튼 세팅
        setupControls(mySlot, roomRef);
    });

    // 5. 실시간 화면 동기화
    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        ["player1", "player2"].forEach(slot => {
            const prefix = slot === "player1" ? "p1" : "p2";
            if (room[`${prefix}_entry`照]) {
                updateUI(slot, room);
            }
        });
    });
}

function updateUI(slot, room) {
    const prefix = slot === "player1" ? "p1" : "p2";
    const entry = room[`${prefix}_entry`];
    const idx = room[`${prefix}_active_idx`] || 0;
    const activePkmn = entry[idx];

    // 이름 및 HP 숫자 업데이트
    document.getElementById(`${slot}_name`).innerText = room[`${slot}_name`] || "대기 중...";
    document.getElementById(`${slot}_active_name`).innerText = activePkmn.name;
    document.getElementById(`${slot}_hp`).innerText = activePkmn.hp;
    
    // HP 바 애니메이션 (maxHp가 데이터에 있다고 가정, 없으면 100)
    const maxHp = activePkmn.maxHp || 100;
    const hpPercent = (activePkmn.hp / maxHp) * 100;
    document.getElementById(`${prefix}-hp-fill`).style.width = `${hpPercent}%`;
    document.getElementById(`${prefix}-hp-fill`).style.backgroundColor = hpPercent < 30 ? "red" : "green";

    // 내가 나일 때: 교체 버튼 생성
    const isMe = room[`${slot === "player1" ? "player1_uid" : "player2_uid"}`] === auth.currentUser?.uid;
    if (isMe) {
        const btnArea = document.getElementById(`${prefix}-bench-btns`);
        btnArea.innerHTML = ""; 
        entry.forEach((pkmn, i) => {
            if (i !== idx) {
                const btn = document.createElement("button");
                btn.innerText = `${pkmn.name} (HP:${pkmn.hp})`;
                // 체력이 0 이상일 때만 교체 가능하게 설정 가능
                btn.disabled = pkmn.hp <= 0;
                btn.onclick = () => switchPokemon(prefix, i, room.id || "battleroom1"); // 방ID 유동적으로 수정 필요
                btnArea.appendChild(btn);
            }
        });
    } else {
        // 상대방일 때: 벤치 정보 텍스트 표시
        const benchArea = document.getElementById(`${prefix}-bench`);
        const benchNames = entry.filter((_, i) => i !== idx).map(p => p.name).join(", ");
        benchArea.innerText = "벤치: " + (benchNames || "없음");
    }
}

async function switchPokemon(prefix, newIdx, roomId) {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, { [`${prefix}_active_idx`]: newIdx });
}

function setupControls(mySlot, roomRef) {
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const enemyPrefix = mySlot === "player1" ? "p2" : "p1";
        if (!data[`${enemyPrefix}_entry`]) return;

        const enemyEntry = [...data[`${enemyPrefix}_entry`]];
        const enemyIdx = data[`${enemyPrefix}_active_idx`];

        // 대미지 계산 (최소 0)
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 20);

        await updateDoc(roomRef, { [`${enemyPrefix}_entry`]: enemyEntry });
    };
}

// 실행 (예시로 battleroom1 호출)
loadBattle("battleroom1");
