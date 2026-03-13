import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

// ROOM_ID는 외부에서 정의되어 있다고 가정하거나 window.location 등으로 가져와야 함
const ROOM_ID = "battleroom1"; 
const roomRef = doc(db, "rooms", ROOM_ID)

let mySlot = null
let myUid = null

onAuthStateChanged(auth, async (user) => {
    if (!user) return
    myUid = user.uid

    await joinRoom()
    listenRoom()
    setupButtons()
})

async function joinRoom() {
    const userDoc = await getDoc(doc(db, "users", myUid))
    const nickname = userDoc.data().nickname

    const roomSnap = await getDoc(roomRef)
    const room = roomSnap.data()

    if (room.player1_uid === myUid) {
        mySlot = "player1"
        return
    }
    if (room.player2_uid === myUid) {
        mySlot = "player2"
        return
    }

    if (!room.player1_uid) {
        await updateDoc(roomRef, {
            player1_uid: myUid,
            player1_name: nickname
        })
        mySlot = "player1"
    } else if (!room.player2_uid) {
        await updateDoc(roomRef, {
            player2_uid: myUid,
            player2_name: nickname
        })
        mySlot = "player2"
    }
}

function listenRoom() {
    // 트리거 체크를 위해 snapshot 내에서 async/await 사용
    onSnapshot(roomRef, async (snap) => {
        const room = snap.data()
        if (!room) return

        document.getElementById("player1").innerText =
            "Player1: " + (room.player1_name ?? "대기...")
        document.getElementById("player2").innerText =
            "Player2: " + (room.player2_name ?? "대기...")

        // [핵심 트리거] 둘 다 레디했고, 아직 게임이 시작되지 않았을 때
        if (room.player1_ready && room.player2_ready && !room.game_started) {
            
            // 데이터 복사 중복 실행 방지를 위해 즉시 로컬 플래그 처리 효과를 주거나,
            // 한 사람(보통 p1)만 복사 로직을 수행하도록 제한하는 것이 좋음
            if (mySlot === "player1") {
                console.log("전투 데이터 복사 시작...");

                // 1. 각 유저의 원본 entry 데이터 가져오기
                const p1Doc = await getDoc(doc(db, "users", room.player1_uid));
                const p2Doc = await getDoc(doc(db, "users", room.player2_uid));

                // 2. rooms 문서에 배틀용 데이터 복사 (원본 보존)
                await updateDoc(roomRef, {
                    p1_entry: p1Doc.data().entry, // [ {name, hp}, ... ]
                    p2_entry: p2Doc.data().entry,
                    p1_active_idx: 0, // 선두 0번
                    p2_active_idx: 0,
                    game_started: true // 모든 데이터 세팅 후 시작 플래그 ON
                });
            }
        }

        // 게임 시작 플래그가 켜지면 페이지 이동
        if (room.game_started) {
            const roomNumber = ROOM_ID.replace("battleroom", "")
            location.href = `../games/battleroom${roomNumber}.html`
        }
    })
}

function setupButtons() {
    document.getElementById("readyBtn").onclick = async () => {
        if (mySlot === "player1") {
            await updateDoc(roomRef, { player1_ready: true })
        }
        if (mySlot === "player2") {
            await updateDoc(roomRef, { player2_ready: true })
        }
    }

    document.getElementById("leaveBtn").onclick = leaveRoom
}

async function leaveRoom() {
    if (mySlot === "player1") {
        await updateDoc(roomRef, {
            player1_uid: null,
            player1_name: null,
            player1_ready: false
        })
    }
    if (mySlot === "player2") {
        await updateDoc(roomRef, {
            player2_uid: null,
            player2_name: null,
            player2_ready: false
        })
    }
    location.href = "../main.html"
}
