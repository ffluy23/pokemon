import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null
let myUid = null
let myNickname = null

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const userSnap = await getDoc(doc(db, "users", myUid))
  const userData = userSnap.data()
  myNickname = userData.nickname

  const userRoomNum = userData?.room
  const userRoomId = userRoomNum ? `battleroom${userRoomNum}` : null

  if (userRoomId && userRoomId !== ROOM_ID) {
    const activeRoomSnap = await getDoc(doc(db, "rooms", userRoomId))
    const activeRoom = activeRoomSnap.data()
    if (activeRoom?.game_started) {
      const isPlayer = activeRoom.player1_uid === myUid || activeRoom.player2_uid === myUid
      if (isPlayer) {
        alert(`현재 battleroom${userRoomNum}에서 게임 중입니다. 해당 방으로 이동합니다.`)
        location.href = `../games/battleroom${userRoomNum}.html`
        return
      }
    }
  }

  await joinRoom()
  listenRoom()
  setupButtons()
})

function updateButtonsBySlot() {
  const readyBtn = document.getElementById("readyBtn")
  const swapBtn  = document.getElementById("swapBtn")
  const isPlayer = mySlot === "player1" || mySlot === "player2"
  if (readyBtn) readyBtn.style.display = isPlayer ? "inline-block" : "none"
  if (swapBtn)  swapBtn.style.display  = isPlayer ? "none" : "inline-block"
}

async function joinRoom() {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()

  if (room.player1_uid === myUid) { mySlot = "player1"; return }
  if (room.player2_uid === myUid) { mySlot = "player2"; return }
  if ((room.spectators ?? []).includes(myUid)) { mySlot = "spectator"; return }

  if (room.game_started) { await joinAsSpectator(room); return }

  if (!room.player1_uid) {
    await updateDoc(roomRef, { player1_uid: myUid, player1_name: myNickname })
    mySlot = "player1"
  } else if (!room.player2_uid) {
    await updateDoc(roomRef, { player2_uid: myUid, player2_name: myNickname })
    mySlot = "player2"
  } else {
    await joinAsSpectator(room)
  }
}

async function joinAsSpectator(room) {
  const spectators = room.spectators ?? []
  const spectatorNames = room.spectator_names ?? []
  if (spectators.includes(myUid)) { mySlot = "spectator"; return }
  await updateDoc(roomRef, {
    spectators: [...spectators, myUid],
    spectator_names: [...spectatorNames, myNickname]
  })
  mySlot = "spectator"
}

function listenRoom() {
  onSnapshot(roomRef, async (snap) => {
    const room = snap.data()
    if (!room) return

    document.getElementById("player1").innerText = "Player1: " + (room.player1_name ?? "대기...")
    document.getElementById("player2").innerText = "Player2: " + (room.player2_name ?? "대기...")

    renderSpectators(room)
    renderSwapRequest(room)
    updateButtonsBySlot()

    const leaveBtn = document.getElementById("leaveBtn")
    if (leaveBtn) {
      const isPlayer = mySlot === "player1" || mySlot === "player2"
      leaveBtn.disabled = isPlayer && !!room.game_started
    }

    if (room.player1_ready && room.player2_ready && !room.game_started) {
      if (mySlot === "player1" || mySlot === "player2") {
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
    }

    if (room.game_started) {
      const roomNumber = ROOM_ID.replace("battleroom", "")
      if (mySlot === "spectator") {
        location.href = `../games/battleroom${roomNumber}.html?spectator=true`
      } else {
        location.href = `../games/battleroom${roomNumber}.html`
      }
    }
  })
}

function renderSpectators(room) {
  const el = document.getElementById("spectator-list")
  if (!el) return
  const names = room.spectator_names ?? []
  el.innerText = names.length > 0 ? "관전자: " + names.join(", ") : "관전자 없음"
}

function renderSwapRequest(room) {
  const req = room.swap_request
  const el = document.getElementById("swap-request-display")
  if (!el) return
  if (!req) { el.innerHTML = ""; return }

  const isTargetPlayer =
    (req.toSlot === "player1" && mySlot === "player1") ||
    (req.toSlot === "player2" && mySlot === "player2")

  if (isTargetPlayer && req.from !== myUid) {
    el.innerHTML = `
      <p>${req.fromName}님이 자리 교체를 요청했습니다.</p>
      <button onclick="window.acceptSwap()">수락</button>
      <button onclick="window.rejectSwap()">거절</button>
    `
  } else if (req.from === myUid) {
    el.innerHTML = `<p>${req.toSlot === "player1" ? "Player1" : "Player2"}에게 교체 요청 중...</p>`
  } else {
    el.innerHTML = ""
  }
}

async function requestSwap(targetSlot) {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  if (!room[`${targetSlot}_uid`]) {
    await promoteToPlayer(targetSlot)
    return
  }
  await updateDoc(roomRef, {
    swap_request: { from: myUid, fromName: myNickname, toSlot: targetSlot }
  })
}

window.acceptSwap = async function () {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  const req = room.swap_request
  if (!req) return

  const spectators = room.spectators ?? []
  const spectatorNames = room.spectator_names ?? []

  await updateDoc(roomRef, {
    [`${req.toSlot}_uid`]: req.from,
    [`${req.toSlot}_name`]: req.fromName,
    spectators: [...spectators.filter(u => u !== req.from), myUid],
    spectator_names: [...spectatorNames.filter(n => n !== req.fromName), myNickname],
    swap_request: null
  })

  mySlot = "spectator"
  updateButtonsBySlot()
}

window.rejectSwap = async function () {
  await updateDoc(roomRef, { swap_request: null })
}

async function promoteToPlayer(targetSlot) {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  const spectators = room.spectators ?? []
  const spectatorNames = room.spectator_names ?? []

  await updateDoc(roomRef, {
    [`${targetSlot}_uid`]: myUid,
    [`${targetSlot}_name`]: myNickname,
    spectators: spectators.filter(u => u !== myUid),
    spectator_names: spectatorNames.filter(n => n !== myNickname)
  })

  mySlot = targetSlot
  updateButtonsBySlot()
}

function setupButtons() {
  updateButtonsBySlot()

  document.getElementById("readyBtn").onclick = async () => {
    if (mySlot === "player1") await updateDoc(roomRef, { player1_ready: true })
    if (mySlot === "player2") await updateDoc(roomRef, { player2_ready: true })
  }

  document.getElementById("leaveBtn").onclick = async () => {
    const roomSnap = await getDoc(roomRef)
    const room = roomSnap.data()
    const isPlayer = mySlot === "player1" || mySlot === "player2"
    if (isPlayer && room.game_started) { alert("도망칠 수 없다!"); return }
    await leaveRoom()
  }

  const swapBtn = document.getElementById("swapBtn")
  if (swapBtn) {
    swapBtn.onclick = async () => {
      const roomSnap = await getDoc(roomRef)
      const room = roomSnap.data()
      if (!room.player1_uid) {
        await requestSwap("player1")
      } else if (!room.player2_uid) {
        await requestSwap("player2")
      } else {
        const target = confirm("Player1 자리 요청? (취소 시 Player2)") ? "player1" : "player2"
        await requestSwap(target)
      }
    }
  }
}

async function leaveRoom() {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()

  if (mySlot === "player1" || mySlot === "player2") {
    const spectators = room.spectators ?? []
    const spectatorNames = room.spectator_names ?? []
    if (spectators.length > 0) {
      const randIdx = Math.floor(Math.random() * spectators.length)
      await updateDoc(roomRef, {
        [`${mySlot}_uid`]: spectators[randIdx],
        [`${mySlot}_name`]: spectatorNames[randIdx],
        [`${mySlot}_ready`]: false,
        spectators: spectators.filter((_, i) => i !== randIdx),
        spectator_names: spectatorNames.filter((_, i) => i !== randIdx)
      })
    } else {
      await updateDoc(roomRef, {
        [`${mySlot}_uid`]: null,
        [`${mySlot}_name`]: null,
        [`${mySlot}_ready`]: false
      })
    }
  } else {
    const spectators = room.spectators ?? []
    const spectatorNames = room.spectator_names ?? []
    await updateDoc(roomRef, {
      spectators: spectators.filter(u => u !== myUid),
      spectator_names: spectatorNames.filter(n => n !== myNickname)
    })
  }

  location.href = "../main.html"
}
