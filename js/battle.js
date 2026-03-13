import { db, auth } from "./firebase.js";
import { 
    doc, onSnapshot, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadBattle(roomId) {
    const roomRef = doc(db, "rooms", roomId);

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // [최초 1회] 유저 데이터 복사해오기
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const myPokemon = userData.entry[0]; // 0번 포켓몬

        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();
        const mySlot = roomData.player1_uid === user.uid ? "player1" : "player2";

        // 방에 내 HP 정보가 아직 없으면(최초 진입) 복사 실행
        if (roomData[`${mySlot}_hp`] === undefined || roomData[`${mySlot}_hp`] === 0) {
            await updateDoc(roomRef, {
                [`${mySlot}_name`]: myPokemon.name,
                [`${mySlot}_hp`]: myPokemon.hp,      // 현재 체력으로 쓸 복사본
                [`${mySlot}_maxHp`]: myPokemon.hp   // 최대 체력 제한용
            });
        }

        setupControls(mySlot, roomRef);
    });

    // 실시간 화면 업데이트
    onSnapshot(roomRef, (snap) => {
        const room = snap.data();
        if (!room) return;

        // 플레이어 1 UI
        document.getElementById("player1_name").innerText = room.player1_name || "대기...";
        document.getElementById("player1_hp").innerText = room.player1_hp ?? 0;
        document.getElementById("p1-max-hp").innerText = room.player1_maxHp ?? 0;

        // 플레이어 2 UI
        document.getElementById("player2_name").innerText = room.player2_name || "대기...";
        document.getElementById("player2_hp").innerText = room.player2_hp ?? 0;
        document.getElementById("p2-max-hp").innerText = room.player2_maxHp ?? 0;
    });
}

function setupControls(mySlot, roomRef) {
    const enemySlot = mySlot === "player1" ? "player2" : "player1";

    // 공격 버튼: 상대방 HP를 깎음
    document.getElementById("attackBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const enemyHp = data[`${enemySlot}_hp`] ?? 0;

        await updateDoc(roomRef, {
            [`${enemySlot}_hp`]: Math.max(0, enemyHp - 40)
        });
    };

    // 치유 버튼: 내 HP를 채움 (최대 체력까지만)
    document.getElementById("healBtn").onclick = async () => {
        const snap = await getDoc(roomRef);
        const data = snap.data();
        const myHp = data[`${mySlot}_hp`] ?? 0;
        const myMaxHp = data[`${mySlot}_maxHp`] ?? 0;

        // 회복 후 체력이 maxHp를 넘지 않게 계산
        const healedHp = Math.min(myMaxHp, myHp + 20);

        await updateDoc(roomRef, {
            [`${mySlot}_hp`]: healedHp
        });
    };
}
