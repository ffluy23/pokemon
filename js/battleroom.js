import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null   // "player1" | "player2" | "spectator"
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

  // 재접속 체크
  if (userRoomId && userRoomId !== ROOM_ID) {
    const activeRoomSnap = await getDoc(doc(db, "rooms", userRoomId))
    const activeRoom = activeRoomSnap.data()
    if (activeRoom?.game_started) {
      // 플레이어로 참여 중인 경우만 강제 이동 (관전자는 자유롭게 이동 가능)
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

async function joinRoom() {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()

  // 이미 이 방에 있는 경우
  if (room.player1_uid === myUid) { mySlot = "player1"; return }
  if (room.player2_uid === myUid) { mySlot = "player2"; return }
  if ((room.spectators ?? []).includes(myUid)) { mySlot = "spectator"; return }

  // 게임 중이면 관전으로만 입장
  if (room.game_started) {
    await joinAsSpectator(room)
    return
  }

  // 빈 플레이어 슬롯에 입장
  if (!room.player1_uid) {
    await updateDoc(roomRef, { player1_uid: myUid, player1_name: myNickname })
    mySlot = "player1"
  } else if (!room.player2_uid) {
    await updateDoc(roomRef, { player2_uid: myUid, player2_name: myNickname })
    mySlot = "player2"
  } else {
    // 플레이어 자리 다 찼으면 관전
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

    // 플레이어 이름
    document.getElementById("player1").innerText = "Player1: " + (room.player1_name ?? "대기...")
    document.getElementById("player2").innerText = "Player2: " + (room.player2_name ?? "대기...")

    // 관전자 목록 렌더
    renderSpectators(room)

    // 교체 요청 처리
    renderSwapRequest(room)

    // leave 버튼: 플레이어이고 게임 중이면 비활성화
    const leaveBtn = document.getElementById("leaveBtn")
    if (leaveBtn) {
      const isPlayer = mySlot === "player1" || mySlot === "player2"
      leaveBtn.disabled = isPlayer && !!room.game_started
    }

    // ready 버튼: 관전자는 숨김
    const readyBtn = document.getElementById("readyBtn")
    if (readyBtn) {
      readyBtn.style.display = mySlot === "spectator" ? "none" : "inline-block"
    }

    // 교체 요청 버튼: 관전자만 보임
    const swapBtn = document.getElementById("swapBtn")
    if (swapBtn) {
      swapBtn.style.display = mySlot === "spectator" ? "inline-block" : "none"
    }

    // entry 복사 + game_started
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
      // 플레이어면 게임 화면으로
      if (mySlot === "player1" || mySlot === "player2") {
        const roomNumber = ROOM_ID.replace("battleroom", "")
        location.href = `../games/battleroom${roomNumber}.html`
      }
      // 관전자는 이 화면에 머뭄
    }
  })
}

// ── 관전자 목록 렌더
function renderSpectators(room) {
  const spectatorNames = room.spectator_names ?? []
  let el = document.getElementById("spectator-list")
  if (!el) return
  if (spectatorNames.length === 0) {
    el.innerText = "관전자 없음"
  } else {
    el.innerText = "관전자: " + spectatorNames.join(", ")
  }
}

// ── 교체 요청 렌더 (플레이어에게 수락/거절 버튼 표시)
function renderSwapRequest(room) {
  const req = room.swap_request
  const el = document.getElementById("swap-request-display")
  if (!el) return

  if (!req) { el.innerHTML = ""; return }

  // 나한테 온 요청인지 확인
  const isTargetPlayer =
    (req.toSlot === "player1" && mySlot === "player1") ||
    (req.toSlot === "player2" && mySlot === "player2")

  if (isTargetPlayer && req.from !== myUid) {
    el.innerHTML = `
      <p>${req.fromName}님이 자리 교체를 요청했습니다.</p>
      <button onclick="acceptSwap()">수락</button>
      <button onclick="rejectSwap()">거절</button>
    `
  } else if (req.from === myUid) {
    el.innerHTML = `<p>${req.toSlot === "player1" ? "Player1" : "Player2"}에게 교체 요청 중...</p>`
  } else {
    el.innerHTML = ""
  }
}

// ── 관전자 → 플레이어 교체 요청
async function requestSwap(targetSlot) {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()

  // 해당 슬롯이 비어있으면 바로 이동
  if (!room[`${targetSlot}_uid`]) {
    await promoteToPlayer(targetSlot)
    return
  }

  await updateDoc(roomRef, {
    swap_request: {
      from: myUid,
      fromName: myNickname,
      toSlot: targetSlot
    }
  })
}

// ── 교체 요청 수락
window.acceptSwap = async function () {
  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  const req = room.swap_request
  if (!req) return

  // 내 자리를 관전자로 내려주고 요청자를 플레이어로
  const spectators = room.spectators ?? []
  const spectatorNames = room.spectator_names ?? []

  // 나를 관전자 목록에 추가
  const newSpectators = [...spectators.filter(u => u !== req.from), myUid]
  const newSpectatorNames = [...spectatorNames.filter(n => n !== myNickname), myNickname]

  // 요청자를 내 슬롯에 올림
  await updateDoc(roomRef, {
    [`${req.toSlot}_uid`]: req.from,
    [`${req.toSlot}_name`]: req.fromName,
    spectators: newSpectators.filter(u => u !== myUid),
    spectator_names: newSpectatorNames.filter(n => n !== myNickname),
    swap_request: null
  })

  mySlot = "spectator"
}

// ── 교체 요청 거절
window.rejectSwap = async function () {
  await updateDoc(roomRef, { swap_request: null })
}

// ── 관전자를 플레이어로 바로 승격 (빈 자리)
async function promoteToPlayer(targetSlot) {
  const spectators = (await getDoc(roomRef)).data().spectators ?? []
  const spectatorNames = (await getDoc(roomRef)).data().spectator_names ?? []

  await updateDoc(roomRef, {
    [`${targetSlot}_uid`]: myUid,
    [`${targetSlot}_name`]: myNickname,
    spectators: spectators.filter(u => u !== myUid),
    spectator_names: spectatorNames.filter(n => n !== myNickname)
  })
  mySlot = targetSlot
}

function setupButtons() {
  // ready
  document.getElementById("readyBtn").onclick = async () => {
    if (mySlot === "player1") await updateDoc(roomRef, { player1_ready: true })
    if (mySlot === "player2") await updateDoc(roomRef, { player2_ready: true })
  }

  // leave
  document.getElementById("leaveBtn").onclick = async () => {
    const roomSnap = await getDoc(roomRef)
    const room = roomSnap.data()
    const isPlayer = mySlot === "player1" || mySlot === "player2"

    if (isPlayer && room.game_started) {
      alert("도망칠 수 없다!")
      return
    }
    await leaveRoom()
  }

  // 관전자 → player1 요청
  const swapBtn = document.getElementById("swapBtn")
  if (swapBtn) {
    swapBtn.onclick = async () => {
      const roomSnap = await getDoc(roomRef)
      const room = roomSnap.data()
      // player1 비어있으면 player1, 아니면 player2 요청
      if (!room.player1_uid) {
        await requestSwap("player1")
      } else if (!room.player2_uid) {
        await requestSwap("player2")
      } else {
        // 둘 다 차있으면 선택
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
    // 관전자 중 랜덤 1명을 빈 자리로 승격
    const spectators = room.spectators ?? []
    const spectatorNames = room.spectator_names ?? []

    if (spectators.length > 0) {
      const randIdx = Math.floor(Math.random() * spectators.length)
      const newPlayerUid = spectators[randIdx]
      const newPlayerName = spectatorNames[randIdx]

      await updateDoc(roomRef, {
        [`${mySlot}_uid`]: newPlayerUid,
        [`${mySlot}_name`]: newPlayerName,
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
  } else if (mySlot === "spectator") {
    // 관전자 목록에서 제거
    const spectators = room.spectators ?? []
    const spectatorNames = room.spectator_names ?? []
    await updateDoc(roomRef, {
      spectators: spectators.filter(u => u !== myUid),
      spectator_names: spectatorNames.filter(n => n !== myNickname)
    })
  }

  location.href = "../main.html"
}
