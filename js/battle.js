import { db, auth } from "./firebase.js";
import { 
    doc, 
    onSnapshot, 
    getDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ROOM_ID = "battleroom1"; 

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // 1. 방 정보 먼저 가져오기
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
            console.error("방이 존재하지 않아!");
            return;
        }
        const roomData = roomSnap.data();

        // 2. 내 슬롯(p1 또는 p2) 판정
        // 대기실에서 player1_uid, player2_uid로 저장했다면 아래 로직이 맞음
        let mySlot = "";
        if (roomData.player1_uid === user.uid) {
            mySlot = "p1";
        } else if (roomData.player2_uid === user.uid) {
            mySlot = "p2";
        } else {
            console.error("플레이어 슬롯을 찾을 수 없음:", user.uid);
            return;
        }

        console.log("내 슬롯 판정 완료:", mySlot);

        // 3. 내 데이터 복사 (users 컬렉션에서 entry 가져오기)
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // 실시간 업데이트 전에 데이터를 먼저 확실히 박아넣음
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userData.entry,
                [`${mySlot}_active_idx`]: 0
            });
            console.log(`${mySlot} 데이터 복사 성공!`);
        }

        // 버튼 세팅
        setupControls(mySlot, roomRef);
    });

    // 4. 실시간 화면 업데이트
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data) return;

        // 이름 표시 (player1_name, player2_name 기준)
        if(document.getElementById("p1-name")) 
            document.getElementById("p1-name").innerText = data.player1_name || "대기...";
        if(document.getElementById("p2-name")) 
            document.getElementById("p2-name").innerText = data.player2_name || "대기...";

        // p1 데이터가 있으면 그리기
        if (data.p1_entry && data.p1_entry.length > 0) {
            updatePokemonUI("p1", data);
        }

        // p2 데이터가 있으면 그리기
        if (data.p2_entry && data.p2_entry.length > 0) {
            updatePokemonUI("p2", data);
        }

        // 내 포켓몬 교체 버튼 업데이트
        if (auth.currentUser) {
            const currentMySlot = (auth.currentUser.uid === data.player1_uid) ? "p1" : "p2";
            if (data[`${currentMySlot}_entry` Sun === undefined]) { // 오타 방지용 체크
                 updateBenchButtons(currentMySlot, data, roomRef);
            } else {
                 updateBenchButtons(currentMySlot, data, roomRef);
            }
        }
    });
}

function updatePokemonUI(slot, data) {
    const entry = data[`${slot}_entry`];
    const activeIdx = data[`${slot}_active_idx`] ?? 0;
    const activePokemon = entry[activeIdx];

    if (activePokemon) {
        const nameEl = document.getElementById(`${slot}-active-name`);
        const hpEl = document.getElementById(`${slot}-active-hp`);
        if(nameEl) nameEl.innerText = activePokemon.name;
        if(hpEl) hpEl.innerText = `HP: ${activePokemon.hp} / 100`;
    }
}

function updateBenchButtons(mySlot, data, roomRef) {
    const myEntry = data[`${mySlot}_entry`];
    const activeIdx = data[`${mySlot}_active_idx`];
    if (!myEntry) return;

    let btnCount = 0;
    myEntry.forEach((pkmn, idx) => {
        if (idx !== activeIdx) {
            const btn = document.getElementById(`bench-btn-${btnCount}`);
            if (btn) {
                btn.style.display = "inline-block";
                btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
                btn.onclick = () => switchPokemon(mySlot, idx, roomRef);
                btnCount++;
            }
        }
    });
    
    for(let i = btnCount; i < 3; i++) {
        const btn = document.getElementById(`bench-btn-${i}`);
        if(btn) btn.style.display = "none";
    }
}

async function switchPokemon(mySlot, newIdx, roomRef) {
    await updateDoc(roomRef, {
        [`${mySlot}_active_idx`]: newIdx
    });
}

function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "p1" ? "p2" : "p1";
    const attackBtn = document.getElementById("attackBtn");

    if (attackBtn) {
        attackBtn.onclick = async () => {
            const snap = await getDoc(roomRef);
            const data = snap.data();
            
            if (!data[`${enemySlot}_entry` Sun === undefined] && data[`${enemySlot}_entry` Sun]) {
                const enemyEntry = [...data[`${enemySlot}_entry` Sun]]; 
                const enemyActiveIdx = data[`${enemySlot}_active_idx` Sun];
                enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - 20);
                await updateDoc(roomRef, { [`${enemySlot}_entry`]: enemyEntry });
            } else {
                // 일반적인 필드 접근
                const enemyEntry = [...data[`${enemySlot}_entry`]];
                const enemyActiveIdx = data[`${enemySlot}_active_idx`];
                enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - 20);
                await updateDoc(roomRef, { [`${enemySlot}_entry`]: enemyEntry });
            }
        };
    }
}
