import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 현재 페이지의 URL에서 룸 ID 추출 (예: battleroom1.html -> battleroom1)
const ROOM_ID = window.location.pathname.split('/').pop().replace('.html', '');
const roomRef = doc(db, "rooms", ROOM_ID);

let myUid = null;
let mySlot = null; // 'p1' 또는 'p2'

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        location.href = "../main.html"; // 로그인 안 됐으면 쫓아내기
        return;
    }
    myUid = user.uid;
    
    await setupBattle(); // 1. 배틀 데이터 초기 세팅
    listenBattle();      // 2. 실시간 데이터 감시
});

// 1. 배틀 초기 데이터 세팅 (유저의 entry를 룸으로 복사)
async function setupBattle() {
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data();

    // 내가 P1인지 P2인지 판별
    if (roomData.player1_uid === myUid) mySlot = "p1";
    else if (roomData.player2_uid === myUid) mySlot = "p2";

    // 만약 이미 entry가 복사되어 있다면 중복 복사 방지
    if (roomData.p1_entry && roomData.p2_entry) return;

    // 내 정보 가져오기
    const userDoc = await getDoc(doc(db, "users", myUid));
    const myEntry = userDoc.data().entry; // [ {name, hp}, ... ]

    // 내가 P1이라면 내 entry를 p1_entry에 넣기 (P2는 P2가 들어왔을 때 각자 실행)
    if (mySlot === "p1") {
        await updateDoc(roomRef, {
            p1_entry: myEntry,
            p1_active_idx: 0
        });
    } else {
        await updateDoc(roomRef, {
            p2_entry: myEntry,
            p2_active_idx: 0
        });
    }
}

// 2. 화면 실시간 업데이트
function listenBattle() {
    onSnapshot(roomRef, (snap) => {
        const data = snap.data();
        if (!data || !data.p1_entry || !data.p2_entry) return; // 데이터 다 찰 때까지 대기

        // 이름 표시
        document.getElementById("p1-name").innerText = data.player1_name;
        document.getElementById("p2-name").innerText = data.player2_name;

        // --- 내 포켓몬 표시 (mySlot 기준) ---
        const myPrefix = mySlot; // 'p1' 또는 'p2'
        const enemyPrefix = mySlot === "p1" ? "p2" : "p1";

        const myActive = data[`${myPrefix}_entry`][data[`${myPrefix}_active_idx`]];
        const enemyActive = data[`${enemyPrefix}_entry`][data[`${enemyPrefix}_active_idx`]];

        // 내 화면 (아래쪽)
        document.getElementById("p1-active-name").innerText = myActive.name;
        document.getElementById("p1-hp-bar").value = myActive.hp;
        document.getElementById("p1-hp-text").innerText = `${myActive.hp}/100`;

        // 상대방 화면 (위쪽)
        document.getElementById("p2-active-name").innerText = enemyActive.name;
        document.getElementById("p2-hp-bar").value = enemyActive.hp;
        document.getElementById("p2-hp-text").innerText = `${enemyActive.hp}/100`;

        // 대기 포켓몬 버튼 (내 entry 기준)
        const myEntry = data[`${myPrefix}_entry`];
        const myActiveIdx = data[`${myPrefix}_active_idx`];
        
        let btnIdx = 1;
        myEntry.forEach((pkmn, idx) => {
            if (idx !== myActiveIdx) {
                const btn = document.getElementById(`btn-pkmn-${btnIdx}`);
                if (btn) {
                    btn.innerText = `${pkmn.name} (HP:${pkmn.hp})`;
                    btn.onclick = () => switchPokemon(idx);
                }
                btnIdx++;
            }
        });
    });
}

// 3. 교체 함수
async function switchPokemon(newIdx) {
    const updateData = {};
    updateData[`${mySlot}_active_idx`] = newIdx;
    await updateDoc(roomRef, updateData);
}

// 4. 공격 함수 (상대 HP 깎기)
window.attack = async () => {
    const snap = await getDoc(roomRef);
    const data = snap.data();
    const enemyPrefix = mySlot === "p1" ? "p2" : "p1";
    const enemyEntry = [...data[`${enemyPrefix}_entry`]];
    const enemyIdx = data[`${enemyPrefix}_active_idx`];

    enemyEntry[enemyIdx].hp = Math.max(0, enemyEntry[enemyIdx].hp - 10);

    const updateData = {};
    updateData[`${enemyPrefix}_entry`] = enemyEntry;
    await updateDoc(roomRef, updateData);
};
