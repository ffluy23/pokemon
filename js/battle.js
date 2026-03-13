import { db, auth } from "./firebase.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ROOM_ID = "battleroom1"; // 실제로는 동적으로 받겠지?
const roomRef = doc(db, "rooms", ROOM_ID);

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    // 1. 방 정보와 유저의 원본 엔트리 가져오기
    const roomSnap = await getDoc(roomRef);
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!roomSnap.exists() || !userDoc.exists()) return;

    const roomData = roomSnap.data();
    const myEntry = userDoc.data().entry; // 유저의 [ {name, hp}, ... ] 배열

    // 2. 내가 P1인지 P2인지 판별해서 데이터 복사
    // 방의 player1_uid가 내 UID와 같다면 p1_entry로, 아니면 p2_entry로 복사
    if (roomData.player1_uid === user.uid) {
        // [중요] 이미 복사되어 있다면 다시 복사하지 않음 (무한 업데이트 방지)
        if (!roomData.p1_entry) {
            await updateDoc(roomRef, {
                p1_entry: myEntry,
                p1_active_idx: 0
            });
            console.log("P1 엔트리 복사 완료");
        }
    } else if (roomData.player2_uid === user.uid) {
        if (!roomData.p2_entry) {
            await updateDoc(roomRef, {
                p2_entry: myEntry,
                p2_active_idx: 0
            });
            console.log("P2 엔트리 복사 완료");
        }
    }
});

// 3. 실시간 감시 (복사가 잘 됐는지 콘솔로 확인)
onSnapshot(roomRef, (snap) => {
    const data = snap.data();
    if (!data) return;

    console.log("현재 방 데이터 상황:", data);

    if (data.p1_entry && data.p2_entry) {
        console.log("양쪽 플레이어 엔트리 로드 완료! 이제 전투 가능");
        // 여기서부터 화면에 뿌려주는 코드를 작성하면 돼
    }
});
