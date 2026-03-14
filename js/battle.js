import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null
let myUid = null
let myTurn = false
let gameStarted = false
let actionDone = false

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  mySlot = room.player1_uid === myUid ? "p1" : "p2"

  listenRoom()
})

// ── 1d10
function rollD10() {
  return Math.floor(Math.random() * 10) + 1
}

// ── 주사위 2개 동시 모션
function animateDualDice(p1Roll, p2Roll, onDone) {
  const p1El = document.getElementById("dice-p1")
  const p2El = document.getElementById("dice-p2")
  const diceWrap = document.getElementById("dice-wrap")
  if (!diceWrap) { onDone(); return }

  diceWrap.style.display = "flex"

  let count = 0
  const total = 15
  const interval = setInterval(() => {
    if (p1El) p1El.innerText = Math.floor(Math.random() * 10) + 1
    if (p2El) p2El.innerText = Math.floor(Math.random() * 10) + 1
    count++
    if (count >= total) {
      clearInterval(interval)
      if (p1El) p1El.innerText = p1Roll
      if (p2El) p2El.innerText = p2Roll
      setTimeout(() => {
        diceWrap.style.display = "none"
        onDone()
      }, 1500)
    }
  }, 60)
}

// ── 선공 판정 (p1만 실행)
async function initTurn(data) {
  if (gameStarted) return
  gameStarted = true

  const p1Pokemon = data.p1_entry[0]
  const p2Pokemon = data.p2_entry[0]

  const p1Roll = rollD10()
  const p2Roll = rollD10()
  const p1Total = (p1Pokemon.speed ?? 3) + p1Roll
  const p2Total = (p2Pokemon.speed ?? 3) + p2Roll
  const firstSlot = p1Total >= p2Total ? "p1" : "p2"

  animateDualDice(p1Roll, p2Roll, async () => {
    addLog("--- 선공 판정 ---")
    addLog(`${data.player1_name} 스피드 ${p1Pokemon.speed ?? 3} + 주사위 ${p1Roll} = ${p1Total}`)
    addLog(`${data.player2_name} 스피드 ${p2Pokemon.speed ?? 3} + 주사위 ${p2Roll} = ${p2Total}`)
    addLog(`${firstSlot === "p1" ? data.player1_name : data.player2_name} 선공!`)

    await updateDoc(roomRef, {
      first_slot: firstSlot,
      current_turn: firstSlot,
      turn_count: 1,
      p1_dice: p1Roll,
      p2_dice: p2Roll
    })
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

    if (!data.current_turn) {
      if (mySlot === "p1") {
        initTurn(data)
      } else {
        if (!gameStarted) {
          gameStarted = true
          setTimeout(async () => {
            const s = await getDoc(roomRef)
            const d = s.data()
            if (d.p1_dice && d.p2_dice) {
              animateDualDice(d.p1_dice, d.p2_dice, () => {
                addLog("--- 선공 판정 ---")
                addLog(`${d.player1_name} 스피드 ${d.p1_entry[0].speed ?? 3} + 주사위 ${d.p1_dice} = ${(d.p1_entry[0].speed ?? 3) + d.p1_dice}`)
                addLog(`${d.player2_name} 스피드 ${d.p2_entry[0].speed ?? 3} + 주사위 ${d.p2_dice} = ${(d.p2_entry[0].speed ?? 3) + d.p2_dice}`)
                addLog(`${d.current_turn === "p1" ? d.player1_name : d.player2_name} 선공!`)
              })
            }
          }, 1000)
        }
      }
      return
    }

    myTurn = data.current_turn === mySlot
    actionDone = false

    updateTurnUI(data)
    updateBenchButtons(data)
    updateMoveButtons(data)
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

// ── 기술 버튼 (2x2 그리드)
// moves: [{ name: "전광석화", pp: 15 }, ...]
function updateMoveButtons(data) {
  const myActiveIdx = data[`${mySlot}_active_idx`]
  const myPokemon = data[`${mySlot}_entry`][myActiveIdx]

  // HP 0이면 기술 버튼 전부 비활성화
  const fainted = !myPokemon || myPokemon.hp <= 0
  const moves = myPokemon?.moves ?? []

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`)
    if (!btn) continue

    if (i >= moves.length) {
      btn.innerText = "-"
      btn.disabled = true
      btn.onclick = null
      continue
    }

    const move = moves[i]  // { name, pp } 순서 고정
    btn.innerText = `${move.name}\nPP: ${move.pp}`

    // 비활성화 조건: HP 0 / PP 0 / 내 턴 아님 / 이미 행동함
    if (fainted || move.pp <= 0 || !myTurn || actionDone) {
      btn.disabled = true
      btn.onclick = null
    } else {
      btn.disabled = false
      btn.onclick = () => useMove(i, data)
    }
  }
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

// ── 기술 사용
// moveIdx: moves 배열 인덱스 (순서 고정)
async function useMove(moveIdx, data) {
  if (!myTurn || actionDone) return
  actionDone = true

  const snap = await getDoc(roomRef)
  const freshData = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myActiveIdx  = freshData[`${mySlot}_active_idx`]
  const eneActiveIdx = freshData[`${enemySlot}_active_idx`]

  const myEntry    = freshData[`${mySlot}_entry`].map(p => ({ ...p, moves: [...(p.moves ?? [])] }))
  const enemyEntry = freshData[`${enemySlot}_entry`].map(p => ({ ...p }))

  const myPokemon  = myEntry[myActiveIdx]
  const enePokemon = enemyEntry[eneActiveIdx]

  // HP 0이면 행동 불가
  if (myPokemon.hp <= 0) {
    actionDone = false
    return
  }

  const move = myPokemon.moves[moveIdx]
  if (!move || move.pp <= 0) {
    actionDone = false
    return
  }

  // PP 차감 (기술 실패해도 차감)
  myPokemon.moves[moveIdx] = { ...move, pp: move.pp - 1 }

  // 임시 고정 데미지 20 (나중에 calcDamage.js 연결)
  const damage = 20
  enePokemon.hp = Math.max(0, enePokemon.hp - damage)

  addLog(`${myPokemon.name}의 ${move.name}! ${enePokemon.name}에게 ${damage} 데미지`)
  if (enePokemon.hp <= 0) {
    addLog(`${enePokemon.name}은(는) 쓰러졌다!`)
  }

  await updateDoc(roomRef, {
    [`${mySlot}_entry`]:    myEntry,
    [`${enemySlot}_entry`]: enemyEntry,
    current_turn: enemySlot,
    turn_count: (freshData.turn_count ?? 1) + 1
  })
}

// ── 교체 (후공)
async function switchPokemon(newIdx) {
  if (!myTurn || actionDone) return
  actionDone = true

  const snap = await getDoc(roomRef)
  const data = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"
  const myEntry = data[`${mySlot}_entry`]

  addLog(`${myEntry[data[`${mySlot}_active_idx`]].name} 교체! ${myEntry[newIdx].name} 등장!`)

  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
    current_turn: enemySlot,
    turn_count: (data.turn_count ?? 1) + 1
  })
}

// ── 턴 UI
function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (el) {
    el.innerText = myTurn ? "내 턴!" : "상대 턴..."
    el.style.color = myTurn ? "green" : "gray"
  }
  const tc = document.getElementById("turn-count")
  if (tc) tc.innerText = `${data.turn_count ?? 1}턴`
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
