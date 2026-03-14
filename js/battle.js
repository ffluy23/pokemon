import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc, collection, getDoc, updateDoc, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { moves } from "./moves.js"
import { getTypeMultiplier } from "./typeChart.js"

const roomRef = doc(db, "rooms", ROOM_ID)
const logsRef = collection(db, "rooms", ROOM_ID, "logs")

let mySlot = null
let myUid = null
let myTurn = false
let gameStarted = false
let actionDone = false
let gameOver = false

const isSpectator = new URLSearchParams(location.search).get("spectator") === "true"

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  mySlot = room.player1_uid === myUid ? "p1" : "p2"

  if (isSpectator) {
    const turnDisplay = document.getElementById("turn-display")
    if (turnDisplay) {
      turnDisplay.innerText = "👁 관전 중"
      turnDisplay.style.color = "gray"
    }
    const leaveBtn = document.getElementById("leaveBtn")
    if (leaveBtn) {
      leaveBtn.style.display = "inline-block"
      leaveBtn.disabled = false
      leaveBtn.innerText = "관전 종료"
      leaveBtn.onclick = () => leaveAsSpectator()
    }
  }

  listenRoom()
  listenLogs()
})

// ── 1d10
function rollD10() {
  return Math.floor(Math.random() * 10) + 1
}

// ── 전체 기절 체크
function isAllFainted(entry) {
  return entry.every(p => p.hp <= 0)
}

// ── 데미지 계산
function calcDamage(attacker, moveName, defender) {
  const move = moves[moveName]
  if (!move) return { damage: 0, multiplier: 1, stab: false, dice: 0 }

  const dice = rollD10()
  const multiplier = getTypeMultiplier(move.type, defender.type)
  if (multiplier === 0) return { damage: 0, multiplier: 0, stab: false, dice }

  const stab = attacker.type === move.type
  const stabMult = stab ? 1.3 : 1
  const base = (move.power ?? 40) + (attacker.attack ?? 3) * 4 + dice
  const raw = Math.floor(base * multiplier * stabMult)
  const damage = Math.max(0, raw - (defender.defense ?? 3) * 5)

  return { damage, multiplier, stab, dice }
}

// ── 로그 추가
async function addLog(text) {
  await addDoc(logsRef, { text, ts: Date.now() })
}

async function addLogs(lines) {
  const base = Date.now()
  for (let i = 0; i < lines.length; i++) {
    await addDoc(logsRef, { text: lines[i], ts: base + i })
  }
}

// ── 타이핑 효과 로그 시스템
let renderedLogIds = new Set()
let typingQueue = []
let isTyping = false

function processQueue() {
  if (isTyping || typingQueue.length === 0) return
  isTyping = true

  const text = typingQueue.shift()
  const log = document.getElementById("battle-log")
  if (!log) { isTyping = false; processQueue(); return }

  const line = document.createElement("p")
  log.appendChild(line)

  let i = 0
  const interval = setInterval(() => {
    line.innerText += text[i]
    i++
    log.scrollTop = log.scrollHeight
    if (i >= text.length) {
      clearInterval(interval)
      isTyping = false
      setTimeout(processQueue, 80)
    }
  }, 18)
}

// ── 로그 실시간 리스닝
function listenLogs() {
  const q = query(logsRef, orderBy("ts"))
  onSnapshot(q, (snap) => {
    snap.docs.forEach(d => {
      if (renderedLogIds.has(d.id)) return
      renderedLogIds.add(d.id)
      typingQueue.push(d.data().text)
    })
    processQueue()
  })
}

// ── 주사위 2개 모션
function animateDualDice(p1Roll, p2Roll, onDone) {
  const p1El = document.getElementById("dice-p1")
  const p2El = document.getElementById("dice-p2")
  const wrap = document.getElementById("dice-wrap")
  const p1Box = document.getElementById("dice-box-p1")
  const p2Box = document.getElementById("dice-box-p2")
  const hitBox = document.getElementById("dice-box-hit")
  if (!wrap) { onDone(); return }

  if (p1Box) p1Box.style.display = "block"
  if (p2Box) p2Box.style.display = "block"
  if (hitBox) hitBox.style.display = "none"
  wrap.style.display = "flex"

  let count = 0
  const interval = setInterval(() => {
    if (p1El) p1El.innerText = rollD10()
    if (p2El) p2El.innerText = rollD10()
    count++
    if (count >= 15) {
      clearInterval(interval)
      if (p1El) p1El.innerText = p1Roll
      if (p2El) p2El.innerText = p2Roll
      setTimeout(() => { wrap.style.display = "none"; onDone() }, 1500)
    }
  }, 60)
}

// ── 명중 판정 주사위 모션
function animateHitDice(roll, onDone) {
  const el = document.getElementById("dice-hit")
  const wrap = document.getElementById("dice-wrap")
  const p1Box = document.getElementById("dice-box-p1")
  const p2Box = document.getElementById("dice-box-p2")
  const hitBox = document.getElementById("dice-box-hit")
  if (!wrap) { onDone(); return }

  if (p1Box) p1Box.style.display = "none"
  if (p2Box) p2Box.style.display = "none"
  if (hitBox) hitBox.style.display = "block"
  wrap.style.display = "flex"

  let count = 0
  const interval = setInterval(() => {
    if (el) el.innerText = rollD10()
    count++
    if (count >= 15) {
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
    await updateDoc(roomRef, {
      first_slot: firstSlot,
      current_turn: firstSlot,
      turn_count: 1,
      p1_dice: p1Roll,
      p2_dice: p2Roll
    })
    await addLogs([
      "--- 선공 판정 ---",
      `${data.player1_name} 스피드 ${p1Pokemon.speed ?? 3} + 주사위 ${p1Roll} = ${p1Total}`,
      `${data.player2_name} 스피드 ${p2Pokemon.speed ?? 3} + 주사위 ${p2Roll} = ${p2Total}`,
      `${firstSlot === "p1" ? data.player1_name : data.player2_name} 선공!`
    ])
  })
}

// ── 실시간 리스닝
function listenRoom() {
  onSnapshot(roomRef, async (snap) => {
    const data = snap.data()
    if (!data) return

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

    const spectEl = document.getElementById("spectator-list")
    if (spectEl) {
      const names = data.spectator_names ?? []
      spectEl.innerText = names.length > 0 ? "👁 관전: " + names.join(", ") : ""
    }

    if (!data.p1_entry || !data.p2_entry) return

    const enemySlot = mySlot === "p1" ? "p2" : "p1"
    updateActiveUI(mySlot, data, "my")
    updateActiveUI(enemySlot, data, "enemy")

    if (data.game_over) {
      showGameOver(data)
      return
    }

    if (!data.current_turn) {
      if (!isSpectator && mySlot === "p1") {
        initTurn(data)
      } else if (!isSpectator && mySlot === "p2") {
        if (!gameStarted) {
          gameStarted = true
          setTimeout(async () => {
            const s = await getDoc(roomRef)
            const d = s.data()
            if (d.p1_dice && d.p2_dice) animateDualDice(d.p1_dice, d.p2_dice, () => {})
          }, 1000)
        }
      } else if (isSpectator && !gameStarted) {
        gameStarted = true
        setTimeout(async () => {
          const s = await getDoc(roomRef)
          const d = s.data()
          if (d.p1_dice && d.p2_dice) animateDualDice(d.p1_dice, d.p2_dice, () => {})
        }, 1500)
      }
      return
    }

    if (!isSpectator) {
      myTurn = data.current_turn === mySlot
      actionDone = false
      updateTurnUI(data)
    }

    updateBenchButtons(data)
    updateMoveButtons(data)
  })
}

// ── 게임 종료 UI
function showGameOver(data) {
  const turnDisplay = document.getElementById("turn-display")
  if (isSpectator) {
    if (turnDisplay) {
      turnDisplay.innerText = `🏆 ${data.winner} 승리!`
      turnDisplay.style.color = "gold"
    }
  } else {
    const myName = mySlot === "p1" ? data.player1_name : data.player2_name
    const isWinner = data.winner === myName
    if (turnDisplay) {
      turnDisplay.innerText = isWinner ? "🏆 승리!" : "💀 패배..."
      turnDisplay.style.color = isWinner ? "gold" : "red"
    }
  }

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`)
    if (btn) { btn.disabled = true; btn.onclick = null }
  }
  const benchContainer = document.getElementById("bench-container")
  if (benchContainer) benchContainer.innerHTML = ""

  if (!isSpectator) {
    const leaveBtn = document.getElementById("leaveBtn")
    if (leaveBtn) {
      leaveBtn.style.display = "inline-block"
      leaveBtn.disabled = false
      leaveBtn.innerText = "방 나가기"
      leaveBtn.onclick = () => leaveGame()
    }
  }
}

// ── 관전자 나가기
async function leaveAsSpectator() {
  const snap = await getDoc(roomRef)
  const data = snap.data()
  const idx = (data.spectators ?? []).indexOf(myUid)
  await updateDoc(roomRef, {
    spectators: (data.spectators ?? []).filter(u => u !== myUid),
    spectator_names: (data.spectator_names ?? []).filter((_, i) => i !== idx)
  })
  location.href = "../main.html"
}

// ── 게임 종료 후 방 나가기
async function leaveGame() {
  await updateDoc(roomRef, {
    player1_uid: null, player1_name: null, player1_ready: false,
    player2_uid: null, player2_name: null, player2_ready: false,
    game_started: false, game_over: false, winner: null,
    current_turn: null, turn_count: 0,
    p1_entry: null, p2_entry: null,
    p1_active_idx: 0, p2_active_idx: 0
  })
  location.href = "../main.html"
}

// ── 포켓몬 UI
function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`]
  const pokemon = data[`${slot}_entry`][activeIdx]
  if (!pokemon) return
  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name
  document.getElementById(`${prefix}-active-hp`).innerText =
    `HP: ${pokemon.hp} / ${pokemon.maxHp}`
}

// ── 기술 버튼
function updateMoveButtons(data) {
  const myActiveIdx = data[`${mySlot}_active_idx`]
  const myPokemon = data[`${mySlot}_entry`][myActiveIdx]
  const fainted = !myPokemon || myPokemon.hp <= 0
  const movesArr = myPokemon?.moves ?? []

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`)
    if (!btn) continue

    if (i >= movesArr.length) {
      btn.innerText = "-"
      btn.disabled = true
      btn.onclick = null
      continue
    }

    const move = movesArr[i]
    btn.innerText = `${move.name}\nPP: ${move.pp}`

    if (isSpectator || fainted || move.pp <= 0 || !myTurn || actionDone) {
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
      btn.disabled = isSpectator || !myTurn || actionDone
      if (!isSpectator) btn.onclick = () => switchPokemon(idx)
    }
    benchContainer.appendChild(btn)
  })
}

// ── 기술 사용
async function useMove(moveIdx, data) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
  actionDone = true
  updateMoveButtons(data)

  const snap = await getDoc(roomRef)
  const freshData = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myActiveIdx  = freshData[`${mySlot}_active_idx`]
  const eneActiveIdx = freshData[`${enemySlot}_active_idx`]

  const myEntry    = freshData[`${mySlot}_entry`].map(p => ({ ...p, moves: (p.moves ?? []).map(m => ({ ...m })) }))
  const enemyEntry = freshData[`${enemySlot}_entry`].map(p => ({ ...p }))

  const myPokemon  = myEntry[myActiveIdx]
  const enePokemon = enemyEntry[eneActiveIdx]

  if (myPokemon.hp <= 0) { actionDone = false; return }

  const moveData = myPokemon.moves[moveIdx]
  if (!moveData || moveData.pp <= 0) { actionDone = false; return }

  // PP 차감
  myPokemon.moves[moveIdx] = { ...moveData, pp: moveData.pp - 1 }

  // moves.js에서 alwaysHit 여부 확인
  const moveInfo = moves[moveData.name]
  const alwaysHit = moveInfo?.alwaysHit ?? false

  // 명중 판정
  const hitRoll = rollD10()
  const hitValue = (myPokemon.speed ?? 3) + hitRoll
  const defValue = (enePokemon.speed ?? 3) + 3
  const isHit = alwaysHit || hitValue > defValue

  // alwaysHit이면 주사위 모션 없이 바로 처리, 아니면 모션 후 처리
  const processAttack = async () => {
    const newLines = []
    newLines.push(`--- ${myPokemon.name}의 ${moveData.name} ---`)

    if (alwaysHit) {
      newLines.push("반드시 명중!")
    } else {
      newLines.push(`명중: ${myPokemon.speed ?? 3} + ${hitRoll} = ${hitValue} vs ${defValue} → ${isHit ? "명중!" : "빗나감!"}`)
    }

    if (!isHit) {
      newLines.push(`${myPokemon.name}의 공격이 빗나갔다!`)
    } else {
      const { damage, multiplier, stab, dice } = calcDamage(myPokemon, moveData.name, enePokemon)
      if (multiplier === 0) {
        newLines.push(`${enePokemon.name}에게는 효과가 없다...`)
      } else {
        if (multiplier === 1.8) newLines.push("효과가 굉장했다!")
        if (multiplier === 0.8) newLines.push("효과가 별로인 것 같다...")
        if (stab) newLines.push("자속보정!")
        newLines.push(`주사위 ${dice} → ${enePokemon.name}에게 ${damage} 데미지`)
        enePokemon.hp = Math.max(0, enePokemon.hp - damage)
        newLines.push(`${enePokemon.name} HP: ${enePokemon.hp} / ${enePokemon.maxHp}`)
        if (enePokemon.hp <= 0) newLines.push(`${enePokemon.name}은(는) 쓰러졌다!`)
      }
    }

    const myName    = mySlot === "p1" ? freshData.player1_name : freshData.player2_name
    const enemyName = enemySlot === "p1" ? freshData.player1_name : freshData.player2_name

    if (isAllFainted(enemyEntry)) {
      newLines.push("══════════════")
      newLines.push(`${myName}의 승리! ${enemyName}의 패배!`)
      newLines.push("══════════════")
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
        turn_count: (freshData.turn_count ?? 1) + 1,
        game_over: true, winner: myName, current_turn: null
      })
    } else if (isAllFainted(myEntry)) {
      newLines.push("══════════════")
      newLines.push(`${enemyName}의 승리! ${myName}의 패배!`)
      newLines.push("══════════════")
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
        turn_count: (freshData.turn_count ?? 1) + 1,
        game_over: true, winner: enemyName, current_turn: null
      })
    } else {
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
        current_turn: enemySlot,
        turn_count: (freshData.turn_count ?? 1) + 1
      })
    }

    await addLogs(newLines)
  }

  if (alwaysHit) {
    // 주사위 모션 없이 바로 처리
    await processAttack()
  } else {
    // 명중 주사위 모션 후 처리
    animateHitDice(hitRoll, processAttack)
  }
}

// ── 교체
async function switchPokemon(newIdx) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
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
    turn_count: (data.turn_count ?? 1) + 1
  })
  await addLog(`${prevName} 교체! ${nextName} 등장!`)
}

// ── 턴 UI
function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (el && !isSpectator) {
    el.innerText = myTurn ? "내 턴!" : "상대 턴..."
    el.style.color = myTurn ? "green" : "gray"
  }
  const tc = document.getElementById("turn-count")
  if (tc) tc.innerText = `${data.turn_count ?? 1}턴`
}
