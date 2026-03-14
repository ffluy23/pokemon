import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null
let myUid = null

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const userSnap = await getDoc(doc(db, "users", myUid))
  const userData = userSnap.data()
  const userRoomNum = userData?.room  // number: 1, 2, 3
  const userRoomId = userRoomNum ? `battleroom${userRoomNum}` : null

  // ── 게임 중인 방이 있는 경우
  if (userRoomId) {
    const activeRoomSnap = await getDoc(doc(db, "rooms", userRoomId))
    const activeRoom = activeRoomSnap.data()

    if (activeRoom?.game_started) {
      if (userRoomId === ROOM_ID) {
        // 이 방에서 게임 중 → 튕겼다가 재접속: 바로 게임 화면으로
        const roomNumber = ROOM_ID.replace("battleroom", "")
        location.href = `../games/battleroom${roomNumber}.html`
        return
      } else {
        // 다른 방에서 게임 중 → 입장 불가
        alert(`현재 battleroom${userRoomNum}에서 게임 중입니다. 해당 방으로 이동합니다.`)
        const roomNumber = userRoomId.replace("battleroom", "")
        location.href = `../games/battleroom${roomNumber}.html`
        return
      }
    }
  }

  await joinRoom()
  listenRoom()
  setupButtons()
})

async function joinRoom() {
  const userSnap = await getDoc(doc(db, "users", myUid))
  const userData = userSnap.data()
  const nickname = userData.nickname
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()

  // 이미 이 방에 있는 경우
  if (room.player1_uid === myUid) { mySlot = "player1"; return }
  if (room.player2_uid === myUid) { mySlot = "player2"; return }

  // 게임 중인 방에 새로 입장 불가
  if (room.game_started) {
    alert("이미 게임이 진행 중인 방입니다.")
    location.href = "../main.html"
    return
  }

  // 빈 슬롯에 입장
  if (!room.player1_uid) {
    await updateDoc(roomRef, { player1_uid: myUid, player1_name: nickname })
    mySlot = "player1"
  } else if (!room.player2_uid) {
    await updateDoc(roomRef, { player2_uid: myUid, player2_name: nickname })
    mySlot = "player2"
  }
}

function listenRoom() {
  onSnapshot(roomRef, async (snap) => {
    const room = snap.data()

    document.getElementById("player1").innerText = "Player1: " + (room.player1_name ?? "대기...")
    document.getElementById("player2").innerText = "Player2: " + (room.player2_name ?? "대기...")

    // leave 버튼: 게임 중이면 비활성화
    const leaveBtn = document.getElementById("leaveBtn")
    if (leaveBtn) leaveBtn.disabled = !!room.game_started

    if (room.player1_ready && room.player2_ready && !room.game_started) {
      const firestoreSlot = mySlot === "player1" ? "p1" : "p2"
      const userSnap = await getDoc(doc(db, "users", myUid))
      const myEntry = userSnap.data()?.entry ?? []
      const myEntryWithMax = myEntry.map(pkmn => ({ ...pkmn, maxHp: pkmn.hp }))

      await updateDoc(roomRef, {
        [`${firestoreSlot}_entry`]: myEntryWithMax,
        [`${firestoreSlot}_active_idx`]: 0,
      })

      if (mySlot === "player1") {
        await updateDoc(roomRef, { game_started: true })
      }
    }

    if (room.game_started) {
      const roomNumber = ROOM_ID.replace("battleroom", "")
      location.href = `../games/battleroom${roomNumber}.html`
    }
  })
}

function setupButtons() {
  document.getElementById("readyBtn").onclick = async () => {
    if (mySlot === "player1") await updateDoc(roomRef, { player1_ready: true })
    if (mySlot === "player2") await updateDoc(roomRef, { player2_ready: true })
  }

  document.getElementById("leaveBtn").onclick = async () => {
    const roomSnap = await getDoc(roomRef)
    const room = roomSnap.data()
    if (room.game_started) {
      alert("도망칠 수 없다!")
      return
    }
    await leaveRoom()
  }
}

async function leaveRoom() {
  if (mySlot === "player1") {
    await updateDoc(roomRef, { player1_uid: null, player1_name: null, player1_ready: false })
  }
  if (mySlot === "player2") {
    await updateDoc(roomRef, { player2_uid: null, player2_name: null, player2_ready: false })
  }
  location.href = "../main.html"
}
