import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

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

// ── 주사위 모션 (단일)
function animateSingleDice(elId, result, onDone) {
  const el = document.getElementById(elId)
  const wrap = document.getElementById("dice-wrap")
  if (!el || !wrap) { onDone(); return }

  wrap.style.display = "flex"
  let count = 0
  const total = 15
  const interval = setInterval(() => {
    el.innerText = Math.floor(Math.random() * 10) + 1
    count++
    if (count >= total) {
      clearInterval(interval)
      el.innerText = result
      setTimeout(() => {
        wrap.style.display = "none"
        onDone()
      }, 1000)
    }
  }, 60)
}

// ── 주사위 2개 모션 (선공 판정용)
function animateDualDice(p1Roll, p2Roll, onDone) {
  const p1El = document.getElementById("dice-p1")
  const p2El = document.getElementById("dice-p2")
  const wrap = document.getElementById("dice-wrap")
  if (!wrap) { onDone(); return }

  // 2개 모두 보이게
  if (p1El) p1El.parentElement.style.display = "block"
  if (p2El) p2El.parentElement.style.display = "block"
  wrap.style.display = "flex"

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
        wrap.style.display = "none"
        onDone()
      }, 1500)
    }
  }, 60)
}

// ── 명중 판정 다이스 모션 (단일, 명중용)
function animateHitDice(roll, onDone) {
  const el = document.getElementById("dice-hit")
  const wrap = document.getElementById("dice-wrap")
  const p1Box = document.getElementById("dice-box-p1")
  const p2Box = document.getElementById("dice-box-p2")
  const hitBox = document.getElementById("dice-box-hit")

  if (!wrap) { onDone(); return }

  // 명중 판정 때는 주사위 1개만
  if (p1Box) p1Box.style.display = "none"
  if (p2Box) p2Box.style.display = "none"
  if (hitBox) hitBox.style.display = "block"
  wrap.style.display = "flex"

  let count = 0
  const total = 15
  const interval = setInterval(() => {
    if (el) el.innerText = Math.floor(Math.random() * 10) + 1
    count++
    if (count >= total) {
      clearInterval(interval)
      if (el) el.innerText = roll
      setTimeout(() => {
        wrap.style.display = "none"
        if (p1Box) p1Box.style.display = "block"
        if (p2Box) p2Box.style.display = "block"
        if (hitBox) hitBox.style.display = "none"
        onDone()
      }, 1000)
    }
  }, 60)
}

// ── Firestore 로그 추가
async function addLog(msg) {
  // 로컬 UI에도 즉시 반영
  appendLogUI(msg)
  // Firestore에 저장 (상대방도 볼 수 있게)
  await updateDoc(roomRef, {
    battle_log: arrayUnion(msg)
  })
}

// ── 로그 UI에 한 줄 추가
function appendLogUI(msg) {
  const log = document.getElementById("battle-log")
  if (!log) return
  const line = document.createElement("p")
  line.innerText = msg
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
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
    const logs = [
      "--- 선공 판정 ---",
      `${data.player1_name} 스피드 ${p1Pokemon.speed ?? 3} + 주사위 ${p1Roll} = ${p1Total}`,
      `${data.player2_name} 스피드 ${p2Pokemon.speed ?? 3} + 주사위 ${p2Roll} = ${p2Total}`,
      `${firstSlot === "p1" ? data.player1_name : data.player2_name} 선공!`
    ]

    await updateDoc(roomRef, {
      first_slot: firstSlot,
      current_turn: firstSlot,
      turn_count: 1,
      p1_dice: p1Roll,
      p2_dice: p2Roll,
      battle_log: logs
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

    // 로그 동기화 (Firestore 기준으로 전체 다시 렌더)
    renderLog(data.battle_log ?? [])

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
              animateDualDice(d.p1_dice, d.p2_dice, () => {})
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

// ── 로그 전체 렌더 (중복 방지)
let lastLogLength = 0
function renderLog(logs) {
  if (logs.length === lastLogLength) return
  const log = document.getElementById("battle-log")
  if (!log) return

  // 새로 추가된 것만 렌더
  for (let i = lastLogLength; i < logs.length; i++) {
    const line = document.createElement("p")
    line.innerText = logs[i]
    log.appendChild(line)
  }
  lastLogLength = logs.length
  log.scrollTop = log.scrollHeight
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

// ── 기술 버튼 (2x2)
function updateMoveButtons(data) {
  const myActiveIdx = data[`${mySlot}_active_idx`]
  const myPokemon = data[`${mySlot}_entry`][myActiveIdx]
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

    const move = moves[i]
    btn.innerText = `${move.name}\nPP: ${move.pp}`

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

// ── 기술 사용 (명중 판정 포함)
async function useMove(moveIdx, data) {
  if (!myTurn || actionDone) return
  actionDone = true
  updateMoveButtons(data)

  const snap = await getDoc(roomRef)
  const freshData = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myActiveIdx  = freshData[`${mySlot}_active_idx`]
  const eneActiveIdx = freshData[`${enemySlot}_active_idx`]

  const myEntry    = freshData[`${mySlot}_entry`].map(p => ({ ...p, moves: [...(p.moves ?? [])] }))
  const enemyEntry = freshData[`${enemySlot}_entry`].map(p => ({ ...p }))

  const myPokemon  = myEntry[myActiveIdx]
  const enePokemon = enemyEntry[eneActiveIdx]

  if (myPokemon.hp <= 0) { actionDone = false; return }

  const move = myPokemon.moves[moveIdx]
  if (!move || move.pp <= 0) { actionDone = false; return }

  // PP 차감
  myPokemon.moves[moveIdx] = { ...move, pp: move.pp - 1 }

  // 명중 판정: 공격자 스피드 + 1d10 > 방어자 스피드 + 3
  const hitRoll = rollD10()
  const hitValue = (myPokemon.speed ?? 3) + hitRoll
  const defValue = (enePokemon.speed ?? 3) + 3
  const isHit = hitValue > defValue

  // 명중 다이스 모션 후 결과 처리
  animateHitDice(hitRoll, async () => {
    const logLines = []
    logLines.push(`--- ${myPokemon.name}의 ${move.name} ---`)
    logLines.push(`명중 판정: 스피드 ${myPokemon.speed ?? 3} + 주사위 ${hitRoll} = ${hitValue} vs ${defValue}`)

    if (!isHit) {
      logLines.push(`${myPokemon.name}의 공격이 빗나갔다!`)
    } else {
      // 임시 고정 데미지 20 (나중에 calcDamage.js 연결)
      const damage = 20
      enePokemon.hp = Math.max(0, enePokemon.hp - damage)
      logLines.push(`${move.name} 명중! ${enePokemon.name}에게 ${damage} 데미지`)
      if (enePokemon.hp <= 0) logLines.push(`${enePokemon.name}은(는) 쓰러졌다!`)
    }

    await updateDoc(roomRef, {
      [`${mySlot}_entry`]:    myEntry,
      [`${enemySlot}_entry`]: enemyEntry,
      current_turn: enemySlot,
      turn_count: (freshData.turn_count ?? 1) + 1,
      battle_log: arrayUnion(...logLines)
    })
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
  const prevName = myEntry[data[`${mySlot}_active_idx`]].name
  const nextName = myEntry[newIdx].name

  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
    current_turn: enemySlot,
    turn_count: (data.turn_count ?? 1) + 1,
    battle_log: arrayUnion(`${prevName} 교체! ${nextName} 등장!`)
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
