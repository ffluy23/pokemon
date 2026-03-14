import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null
let myUid = null
let myTurn = false       // 내 턴 여부
let gameStarted = false  // 주사위 굴리기 한 번만 실행
let actionDone = false   // 이번 턴에 내가 행동했는지

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  mySlot = room.player1_uid === myUid ? "p1" : "p2"

  listenRoom()
})

// ── 주사위 1d10
function rollD10() {
  return Math.floor(Math.random() * 10) + 1
}

// ── 주사위 모션 (숫자가 빠르게 바뀌다가 결과로 멈춤)
function animateDice(resultText, onDone) {
  const el = document.getElementById("dice-display")
  if (!el) { onDone(); return }

  el.style.display = "block"
  let count = 0
  const total = 15 // 모션 횟수
  const interval = setInterval(() => {
    el.innerText = Math.floor(Math.random() * 10) + 1
    count++
    if (count >= total) {
      clearInterval(interval)
      el.innerText = resultText
      setTimeout(() => {
        el.style.display = "none"
        onDone()
      }, 1000)
    }
  }, 60)
}

// ── 게임 시작: 선공 판정 (p1이 담당해서 Firestore에 저장)
async function initTurn(data) {
  if (gameStarted) return
  gameStarted = true

  const p1Pokemon = data.p1_entry[0]
  const p2Pokemon = data.p2_entry[0]

  const p1Roll = rollD10()
  const p2Roll = rollD10()
  const p1Total = (p1Pokemon.speed ?? 3) + p1Roll
  const p2Total = (p2Pokemon.speed ?? 3) + p2Roll

  // 동률이면 재판정 (p1 유리하게)
  const firstSlot = p1Total >= p2Total ? "p1" : "p2"

  addLog(`--- 선공 판정 ---`)
  addLog(`${data.player1_name} 스피드 ${p1Pokemon.speed ?? 3} + 주사위 ${p1Roll} = ${p1Total}`)
  addLog(`${data.player2_name} 스피드 ${p2Pokemon.speed ?? 3} + 주사위 ${p2Roll} = ${p2Total}`)
  addLog(`${firstSlot === "p1" ? data.player1_name : data.player2_name} 선공!`)

  // Firestore에 선공 슬롯 + 현재 턴 저장
  await updateDoc(roomRef, {
    first_slot: firstSlot,
    current_turn: firstSlot,
    turn_count: 1
  })
}

// ── 실시간 리스닝
function listenRoom() {
  onSnapshot(roomRef, async (snap) => {
    const data = snap.data()
    if (!data) return

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

    if (!data.p1_entry || !data.p2_entry) return

    const enemySlot = mySlot === "p1" ? "p2" : "p1"

    updateActiveUI(mySlot, data, "my")
    updateActiveUI(enemySlot, data, "enemy")
    updateBenchButtons(data)

    // 게임 시작 시 선공 판정 (p1만 실행)
    if (!data.current_turn && mySlot === "p1") {
      // 주사위 모션 보여주고 나서 선공 판정
      animateDice("?", () => initTurn(data))
      return
    }

    if (!data.current_turn) return

    // 내 턴 여부 업데이트
    myTurn = data.current_turn === mySlot
    actionDone = false

    updateTurnUI(data)
    updateButtonState()
  })
}

// ── 현재 싸우는 포켓몬 UI
function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`]
  const pokemon = data[`${slot}_entry`][activeIdx]
  if (!pokemon) return

  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name
  document.getElementById(`${prefix}-active-hp`).innerText =
    `HP: ${pokemon.hp} / ${pokemon.maxHp}`
}

// ── 교체 버튼
function updateBenchButtons(data) {
  const benchContainer = document.getElementById("bench-container")
  benchContainer.innerHTML = ""

  const myEntry = data[`${mySlot}_entry`]
  const activeIdx = data[`${mySlot}_active_idx`]

  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return

    const btn = document.createElement("button")

    if (pkmn.hp <= 0) {
      btn.innerText = `${pkmn.name} (기절)`
      btn.disabled = true
    } else {
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp} / ${pkmn.maxHp})`
      btn.disabled = !myTurn || actionDone
      btn.onclick = () => switchPokemon(idx)
    }

    benchContainer.appendChild(btn)
  })
}

// ── 턴 UI 표시
function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (!el) return
  if (myTurn) {
    el.innerText = "내 턴!"
    el.style.color = "green"
  } else {
    el.innerText = "상대 턴..."
    el.style.color = "gray"
  }

  const turnCount = document.getElementById("turn-count")
  if (turnCount) turnCount.innerText = `${data.turn_count ?? 1}턴`
}

// ── 버튼 활성화/비활성화
function updateButtonState() {
  const attackBtn = document.getElementById("attackBtn")
  if (attackBtn) attackBtn.disabled = !myTurn || actionDone
}

// ── 공격
async function attack() {
  if (!myTurn || actionDone) return
  actionDone = true

  const snap = await getDoc(roomRef)
  const data = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myActiveIdx = data[`${mySlot}_active_idx`]
  const enemyActiveIdx = data[`${enemySlot}_active_idx`]

  const myPokemon = data[`${mySlot}_entry`][myActiveIdx]
  const enemyEntry = data[`${enemySlot}_entry`].map(p => ({ ...p }))

  // 임시 고정 데미지 20 (나중에 calcDamage.js 연결)
  const damage = 20
  enemyEntry[enemyActiveIdx].hp = Math.max(0, enemyEntry[enemyActiveIdx].hp - damage)

  addLog(`${myPokemon.name}의 공격! ${enemyEntry[enemyActiveIdx].name}에게 ${damage} 데미지`)

  if (enemyEntry[enemyActiveIdx].hp <= 0) {
    addLog(`${enemyEntry[enemyActiveIdx].name}은(는) 쓰러졌다!`)
  }

  // 턴 넘기기
  const nextTurn = enemySlot
  await updateDoc(roomRef, {
    [`${enemySlot}_entry`]: enemyEntry,
    current_turn: nextTurn,
    turn_count: (data.turn_count ?? 1) + 1
  })
}

// ── 교체 (후공 처리: 교체 후 턴을 상대에게 넘김)
async function switchPokemon(newIdx) {
  if (actionDone) return
  actionDone = true

  const snap = await getDoc(roomRef)
  const data = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myEntry = data[`${mySlot}_entry`]
  addLog(`${myEntry[data[`${mySlot}_active_idx`]].name}을(를) 교체! ${myEntry[newIdx].name} 등장!`)

  // 교체는 후공이므로 턴을 상대에게 넘김
  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
    current_turn: enemySlot,
    turn_count: (data.turn_count ?? 1) + 1
  })
}

// ── 배틀 로그
function addLog(msg) {
  const log = document.getElementById("battle-log")
  if (!log) return
  const line = document.createElement("p")
  line.innerText = msg
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

// ── 공격 버튼 연결
document.addEventListener("DOMContentLoaded", () => {
  const attackBtn = document.getElementById("attackBtn")
  if (attackBtn) {
    attackBtn.disabled = true
    attackBtn.onclick = attack
  }
})
