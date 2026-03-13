import { db, auth } from "./firebase.js";
import { doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 현재 페이지 URL에서 방 번호 따오기 (예: battleroom1.html)
const ROOM_ID = window.location.pathname.split('/').pop().replace('.html', '');
const roomRef = doc(db, "rooms", ROOM_ID);

let mySlot = null; 

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.error("로그인 정보가 없습니다.");
        return;
    }

    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
        console.error("방이 존재하지 않습니다: ", ROOM_ID);
        return;
    }

    const roomData = roomSnap.data();
    // 내가 P1인지 P2인지 판별
    mySlot = (roomData.player1_uid === user.uid) ? "p1" : "p2";
    console.log("내 슬롯 확인:", mySlot);

    // [중요] 내 엔트리가 없으면 복사해오기
    if (!roomData[`${mySlot}_entry`]) {
        console.log("내 엔트리 복사 중...");
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userDoc.data().entry,
                [`${mySlot}_active_idx`]: 0
            });
        }
    }

    startListening();
    setupAttack();
});

function startListening() {
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data) return;

        // P1 정보 업데이트 (데이터가 있을 때만)
        if (data.p1_entry) renderUnit("p1", data);
        // P2 정보 업데이트 (데이터가 있을 때만)
        if (data.p2_entry) renderUnit("p2", data);
    });
}

function renderUnit(slot, data) {
    const entry = data[`${slot}_entry`];
    const activeIdx = data[`${slot}_active_idx`] || 0;
    const activePkmn = entry[activeIdx];

    // 이름 및 활성 포켓몬 표시
    document.getElementById(`${slot}-name`).innerText = data[`player${slot === 'p1' ? 1 : 2}_name`] || "대기...";
    document.getElementById(`${slot}-active-name`).innerText = activePkmn.name;
    document.getElementById(`${slot}-active-hp`).innerText = `${activePkmn.hp} / 100`;

    // 내 슬롯이면 교체 버튼을, 상대 슬롯이면 텍스트를 갱신
    if (slot === mySlot) {
        const btnContainer = document.getElementById("p1-bench-buttons");
        btnContainer.innerHTML = "교체: "; // 초기화
        entry.forEach((pkmn, idx) => {
            if (idx !== activeIdx) {
                const btn = document.createElement("button");
                btn.innerText = `${pkmn.name} (${pkmn.hp})`;
                btn.style.marginRight = "5px";
                btn.onclick = () => switchPokemon(idx);
                btnContainer.appendChild(btn);
            }
        });
    } else {
        const benchText = entry
            .filter((_, idx) => idx !== activeIdx)
            .map(p => p.name)
            .join(", ");
        document.getElementById(`${slot}-bench`).innerText = "대기 포켓몬: " + (benchText || "없음");
    }
}

async function switchPokemon(idx) {
    await updateDoc(roomRef, { [`${mySlot}_active_idx`]: idx });
}

function setupAttack() {
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const enemySlot = (mySlot === "p1") ? "p2" : "p1";
        
        if (!data[`${enemySlot}_entry`]) {
            alert("상대방이 아직 준비되지 않았습니다!");
            return;
        }

        const enemyEntry = [...data[`${enemySlot}_entry`]];
        const enemyIdx = data[`${enemySlot}_active_idx`];
        
        enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 20);
        
        await updateDoc(roomRef, { [`${enemySlot}_entry`]: enemyEntry });
    };
}
