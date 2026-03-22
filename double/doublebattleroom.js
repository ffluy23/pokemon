// double/doublebattleroom.js
// Firestore 경로: double/{ROOM_ID}
// 슬롯: p1, p2 (팀A) / p3, p4 (팀B)
// game_started → window.BATTLE_URL 로 전원 이동

import { auth, db } from "../js/firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const SLOTS      = ["p1", "p2", "p3", "p4"]
const ROOM_ID    = window.ROOM_ID
const BATTLE_URL = window.BATTLE_URL

const roomRef = doc(db, "double", ROOM_ID)
let myUid = null, myNickname = null
let redirecting = false
let entryUploaded = false  // 내 entry 중복 업로드 방지

// ── 내 슬롯 계산
function calcMySlot(room) {
  if (!myUid || !room) return null
  for (const s of SLOTS) if (room[`${s}_uid`] === myUid) return s
  if ((room.spectators ?? []).includes(myUid)) return "spectator"
  return null
}

// ── 진입
onAuthStateChanged(auth, async user => {
  if (!user) return
  myUid = user.uid
  const snap = await getDoc(doc(db, "users", myUid))
  myNickname = snap.data()?.nickname ?? "Unknown"
  await joinRoom()
  listenRoom()
  setupButtons()
})

async function joinRoom() {
  const snap = await getDoc(roomRef)
  const room = snap.data() ?? {}
  if (calcMySlot(room)) return
  if (room.game_started) { await joinAsSpectator(room); return }
  for (const s of SLOTS) {
    if (!room[`${s}_uid`]) {
      await updateDoc(roomRef, { [`${s}_uid`]: myUid, [`${s}_name`]: myNickname })
      return
    }
  }
  await joinAsSpectator(room)
}

async function joinAsSpectator(room) {
  if ((room.spectators ?? []).includes(myUid)) return
  await updateDoc(roomRef, {
    spectators:      [...(room.spectators      ?? []), myUid],
    spectator_names: [...(room.spectator_names ?? []), myNickname]
  })
}

// ── 실시간 리스너
function listenRoom() {
  onSnapshot(roomRef, async snap => {
    const room   = snap.data() ?? {}
    const mySlot = calcMySlot(room)

    // 슬롯 표시
    for (const s of SLOTS) {
      const el = document.getElementById(`slot-${s}`)
      if (!el) continue
      const name  = room[`${s}_name`]
      const ready = room[`${s}_ready`]
      el.innerText  = name ? `${name}${ready ? " ✓" : ""}` : "대기..."
      el.className  = `slot${ready ? " ready" : ""}`
    }

    // 관전자 목록
    const specEl = document.getElementById("spectator-list")
    if (specEl) {
      const names = room.spectator_names ?? []
      specEl.innerText = names.length ? "관전: " + names.join(", ") : ""
    }

    // 버튼 표시
    const isPlayer = SLOTS.includes(mySlot)
    document.getElementById("readyBtn").style.display = isPlayer               ? "inline-block" : "none"
    document.getElementById("swapBtn").style.display  = mySlot === "spectator" ? "inline-block" : "none"

    renderSwapRequest(room, mySlot)

    // 4명 모두 준비 → 내 entry 업로드 (1회만)
    const allReady = SLOTS.every(s => room[`${s}_uid`] && room[`${s}_ready`])
    if (allReady && !room.game_started && isPlayer && !entryUploaded) {
      entryUploaded = true
      const userSnap = await getDoc(doc(db, "users", myUid))
      const rawEntry = userSnap.data()?.entry ?? []
      const entry    = rawEntry.map(p => ({ ...p, maxHp: p.hp }))
      await updateDoc(roomRef, { [`${mySlot}_entry`]: entry })
    }

    // p1만: 4명 entry 모두 올라왔는지 확인 후 game_started 트리거
    if (allReady && !room.game_started && mySlot === "p1") {
      const freshSnap = await getDoc(roomRef)
      const freshRoom = freshSnap.data() ?? {}
      const allEntryReady = SLOTS.every(s => (freshRoom[`${s}_entry`] ?? []).length > 0)
      if (allEntryReady) {
        await updateDoc(roomRef, { game_started: true })
      }
    }

    // game_started → 배틀 화면으로 이동
    if (room.game_started && mySlot && !redirecting) {
      redirecting = true
      location.href = mySlot === "spectator" ? BATTLE_URL + "?spectator=true" : BATTLE_URL
    }
  })
}

// ── 교체 요청 UI
function renderSwapRequest(room, mySlot) {
  const el = document.getElementById("swap-request-display")
  if (!el) return
  const req = room.swap_request
  if (!req) { el.innerHTML = ""; return }

  if (req.toSlot === mySlot && req.from !== myUid) {
    el.innerHTML = `
      <p>${req.fromName}님이 <b>${req.toSlot.toUpperCase()}</b> 자리 교체를 요청했습니다.</p>
      <button onclick="window._acceptSwap()">수락</button>
      <button onclick="window._rejectSwap()">거절</button>`
  } else if (req.from === myUid) {
    el.innerHTML = `<p>${req.toSlot.toUpperCase()} 자리 교체 요청 중...</p>`
  } else {
    el.innerHTML = ""
  }
}

window._acceptSwap = async function () {
  const snap      = await getDoc(roomRef)
  const room      = snap.data() ?? {}
  const req       = room.swap_request
  if (!req) return
  const specs     = room.spectators      ?? []
  const specNames = room.spectator_names ?? []
  await updateDoc(roomRef, {
    [`${req.toSlot}_uid`]:  req.from     ?? null,
    [`${req.toSlot}_name`]: req.fromName ?? null,
    spectators:      [...specs.filter(u => u !== req.from), myUid],
    spectator_names: [...specNames.filter(n => n !== req.fromName), myNickname ?? null],
    swap_request: null
  })
}

window._rejectSwap = async function () {
  await updateDoc(roomRef, { swap_request: null })
}

// ── 버튼 세팅
function setupButtons() {
  // 준비 완료
  document.getElementById("readyBtn").onclick = async () => {
    const snap   = await getDoc(roomRef)
    const mySlot = calcMySlot(snap.data())
    if (!SLOTS.includes(mySlot)) return
    await updateDoc(roomRef, { [`${mySlot}_ready`]: true })
    document.getElementById("msg").innerText = "준비 완료! 다른 플레이어를 기다리는 중..."
  }

  // 나가기
  document.getElementById("leaveBtn").onclick = async () => {
    const snap   = await getDoc(roomRef)
    const room   = snap.data() ?? {}
    const mySlot = calcMySlot(room)
    if (SLOTS.includes(mySlot) && room.game_started) { alert("도망칠 수 없다!"); return }
    await leaveRoom(mySlot, room)
    location.href = "../main.html"
  }

  // 자리 교체 요청 (관전자 전용)
  document.getElementById("swapBtn").onclick = async () => {
    const snap = await getDoc(roomRef)
    const room = snap.data() ?? {}
    for (const s of SLOTS) {
      if (!room[`${s}_uid`]) { await promoteToSlot(s, room); return }
    }
    const target = prompt("교체 요청할 슬롯 입력 (p1 / p2 / p3 / p4):")?.toLowerCase()
    if (SLOTS.includes(target)) {
      await updateDoc(roomRef, {
        swap_request: { from: myUid, fromName: myNickname ?? null, toSlot: target }
      })
    }
  }
}

async function promoteToSlot(slot, room) {
  const specs     = room.spectators      ?? []
  const specNames = room.spectator_names ?? []
  await updateDoc(roomRef, {
    [`${slot}_uid`]:  myUid      ?? null,
    [`${slot}_name`]: myNickname ?? null,
    spectators:      specs.filter(u => u !== myUid),
    spectator_names: specNames.filter(n => n !== myNickname)
  })
}

async function leaveRoom(mySlot, room) {
  const specs     = room.spectators      ?? []
  const specNames = room.spectator_names ?? []

  if (SLOTS.includes(mySlot)) {
    if (specs.length > 0) {
      const i = Math.floor(Math.random() * specs.length)
      await updateDoc(roomRef, {
        [`${mySlot}_uid`]:   specs[i]     ?? null,
        [`${mySlot}_name`]:  specNames[i] ?? null,
        [`${mySlot}_ready`]: false,
        spectators:      specs.filter((_, j) => j !== i),
        spectator_names: specNames.filter((_, j) => j !== i)
      })
    } else {
      await updateDoc(roomRef, {
        [`${mySlot}_uid`]:   null,
        [`${mySlot}_name`]:  null,
        [`${mySlot}_ready`]: false
      })
    }
  } else {
    await updateDoc(roomRef, {
      spectators:      specs.filter(u => u !== myUid),
      spectator_names: specNames.filter(n => n !== myNickname)
    })
  }
}
