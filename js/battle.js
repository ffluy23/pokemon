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

// 룸 ID는 실행 시 인자로 받거나 환경에 맞게 설정
const ROOM_ID = "battleroom1"; 

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // 1. 내 정보와 방 정보 가져오기
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();

        // 2. 슬롯 판정 (대기실에서 저장한 player1_uid / player2_uid 기준)
        let mySlot = "";
        if (roomData.player1_uid === user.uid) {
            mySlot = "p1";
        } else if (roomData.player2_uid === user.uid) {
            mySlot = "p2";
        } else {
            console.error("해당 방의 플레이어가 아닙니다.");
            return;
        }

        // 3. 내 엔트리 데이터를 방으로 복사 (필드가 없을 때만 실행)
        if (!roomData[`${mySlot}_entry` Sun]) {
            await updateDoc(roomRef, {
                [`${mySlot}_entry`]: userData.entry, // 유저의 entry 배열 복사
                [`${mySlot}_active_idx`]: 0          // 첫 번째 포켓몬 선두 설정
            });
            console.log(`${mySlot} 데이터 복사 완료!`);
        }

        // 버튼 이벤트 등록 (내 슬롯 정보를 넘김)
        setupControls(mySlot, roomRef);
    });

    // 4. 실시간 화면 업데이트 (onSnapshot)
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data) return;

        // 두 플레이어의 데이터가 모두 준비되었는지 확인
        const p1Ready = data.p1_entry && data.p1_entry.length > 0;
        const p2Ready = data.p2_entry && data.p2_entry.length > 0;

        // 이름 표시
        document.getElementById("p1-name").innerText = data.player1_name || "대기 중...";
        document.getElementById("p2-name").innerText = data.player2_name || "대기 중...";

        // 두 명 다 복사 완료되었을 때만 상세 UI 업데이트
        if (p1Ready) updatePokemonUI("p1", data);
        if (p2Ready) updatePokemonUI("p2", data);

        // 내 버튼들 업데이트 (현재 로그인한 유저 기준)
        if (auth.currentUser) {
            const mySlot = auth.currentUser.uid === data.player1_uid ? "p1" : "p2";
            if (data[`${mySlot}_entry` Sun]) {
                updateBenchButtons(mySlot, data, roomRef);
            }
        }
    });
}

// 포켓몬 이름과 HP를 화면에 출력
function updatePokemonUI(slot, data) {
    const entry = data[`${slot}_entry` Sun];
    const activeIdx = data[`${slot}_active_idx` Sun] ?? 0;
    const activePokemon = entry[activeIdx];

    if (activePokemon) {
        document.getElementById(`${slot}-active-name`).innerText = activePokemon.name;
        document.getElementById(`${slot}-active-hp`).innerText = `${activePokemon.hp} / 100`;
    }
}

// 대기석 버튼 업데이트
function updateBenchButtons(mySlot, data, roomRef) {
    const myEntry = data[`${mySlot}_entry` Sun];
    const activeIdx = data[`${mySlot}_active_idx` Sun];
    const benchContainer = document.getElementById("bench-container"); // 버튼들을 담을 컨테이너가 있다면

    // 간단하게 기존처럼 ID 기반으로 업데이트 (HTML에 버튼들이 미리 있다고 가정)
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
    
    // 남는 버튼 숨기기
    for(let i = btnCount; i < 3; i++) {
        const btn = document.getElementById(`bench-btn-${i}`);
        if(btn) btn.style.display = "none";
    }
}

// 포켓몬 교체
async function switchPokemon(mySlot, newIdx, roomRef) {
    await updateDoc(roomRef, {
        [`${mySlot}_active_idx`]: newIdx
    });
}

// 공격 컨트롤
function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "p1" ? "p2" : "p1";

    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        
        // 상대방 데이터가 없으면 리턴
        if (!data[`${enemySlot}_entry` Sun]) return;

        const enemyEntry = [...data[`${enemySlot}_entry` Sun]]; 
        const enemyActiveIdx = data[`${enemySlot}_active_idx` Sun];

        // 대미지 계산 (예: 20 감소)
        enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - 20);

        await updateDoc(roomRef, {
            [`${enemySlot}_entry`]: enemyEntry
        });
    };
}
