import { db, auth } from "./firebase.js";
import { doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 룸 ID는 URL에서 가져오거나 대기실 코드에서 넘겨받은 값을 써야 함
const ROOM_ID = "battleroom1"; 

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // 1. 내 정보와 방 정보 가져오기
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();

        const mySlot = roomData.player1_uid === user.uid ? "p1" : "p2";

        // 2. [최초 1회] 내 엔트리 전체를 룸에 복사 (중요!)
        // 이미 복사되어 있는지 확인 (p1_entry나 p2_entry가 없을 때만 실행)
        if (!roomData[`${mySlot}_entry`]) {
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userData.entry, // Array(Map) 통째로 복사
                [`${mySlot}_active_idx`]: 0          // 처음엔 0번 포켓몬이 선두
            });
        }

        // 버튼 세팅 (이때 mySlot 정보를 넘겨줌)
        setupControls(mySlot, roomRef);
    });

    // 3. 실시간 화면 업데이트 (onSnapshot)
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data || !data.p1_entry || !data.p2_entry) return; // 두 명 다 복사될 때까지 대기

        // 플레이어 이름 표시
        document.getElementById("p1-name").innerText = data.player1_name;
        document.getElementById("p2-name").innerText = data.player2_name;

        // --- 포켓몬 정보 표시 로직 ---
        updatePokemonUI("p1", data);
        updatePokemonUI("p2", data);
        
        // 내 대기 포켓몬 버튼 업데이트 (내가 p1인지 p2인지에 따라)
        const mySlot = auth.currentUser.uid === data.player1_uid ? "p1" : "p2";
        updateBenchButtons(mySlot, data, roomRef);
    });
}

// 화면에 포켓몬 이름과 HP를 그려주는 함수
function updatePokemonUI(slot, data) {
    const activeIdx = data[`${slot}_active_idx`];
    const activePokemon = data[`${slot}_entry`][activeIdx];

    document.getElementById(`${slot}-active-name`).innerText = activePokemon.name;
    document.getElementById(`${slot}-active-hp`).innerText = `${activePokemon.hp} / 100`;
}

// 대기 중인 포켓몬들을 버튼으로 만드는 함수
function updateBenchButtons(mySlot, data, roomRef) {
    const myEntry = data[`${mySlot}_entry`];
    const activeIdx = data[`${mySlot}_active_idx`];

    let btnCount = 0;
    myEntry.forEach((pkmn, idx) => {
        // 현재 싸우고 있는 포켓몬은 제외하고 버튼 생성
        if (idx !== activeIdx) {
            const btn = document.getElementById(`bench-btn-${btnCount}`);
            if (btn) {
                btn.style.display = "inline-block";
                btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
                btn.onclick = () => switchPokemon(mySlot, idx, roomRef);
            }
            btnCount++;
        }
    });
}

// 교체 실행 함수
async function switchPokemon(mySlot, newIdx, roomRef) {
    await updateDoc(roomRef, {
        [`${mySlot}_active_idx`]: newIdx
    });
}

function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "p1" ? "p2" : "p1";

    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        const enemyEntry = [...data[`${enemySlot}_entry`]]; // 배열 복사
        const enemyActiveIdx = data[`${enemySlot}_active_idx`];

        // 상대방 현재 포켓몬 HP 감소
        enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - 20);

        await updateDoc(roomRef, {
            [`${enemySlot}_entry`]: enemyEntry
        });
    };
}
