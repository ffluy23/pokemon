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
let diceShown = false
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
      turnDisplay.innerText = "관전 중"
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

// ── 명중 판정
function calcHit(attacker, moveInfo, defender) {
  if (moveInfo.alwaysHit) return { hit: true, hitType: "alwaysHit" }

  const evasion = Math.max(0, Math.min(10, 5 * ((defender.speed ?? 3) - (attacker.speed ?? 3))))
  const finalAccuracy = (moveInfo.accuracy ?? 100) - evasion
  const roll = Math.random() * 100
  const hit = roll < finalAccuracy

  return { hit, hitType: hit ? "hit" : (evasion > 0 ? "evaded" : "missed") }
}

// ── 데미지 계산
function calcDamage(attacker, moveName, defender) {
  const move = moves[moveName]
  if (!move) return { damage: 0, multiplier: 1, stab: false, dice: 0, critical: false }

  const dice = rollD10()
  const multiplier = getTypeMultiplier(move.type, defender.type)
  if (multiplier === 0) return { damage: 0, multiplier: 0, stab: false, dice, critical: false }

  const stab = attacker.type === move.type
  const stabMult = stab ? 1.3 : 1
  const base = (move.power ?? 40) + (attacker.attack ?? 3) * 4 + dice
  const raw = Math.floor(base * multiplier * stabMult)
  const baseDamage = Math.max(0, raw - (defender.defense ?? 3) * 5)

  // 급소 판정: 급소율 = 공격력 × 2% (최대 100%)
  const critChance = Math.min(100, (attacker.attack ?? 3) * 2)
  const critical = Math.random() * 100 < critChance
  const damage = critical ? Math.floor(baseDamage * 1.5) : baseDamage

  return { damage, multiplier, stab, dice, critical }
}

// ── HP바 업데이트
// showNumbers: true면 HP 숫자도 표시, false면 바만
function updateHpBar(barId, textId, hp, maxHp, showNumbers) {
  const bar = document.getElementById(barId)
  const text = textId ? document.getElementById(textId) : null

  if (!bar) return

  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0

  bar.style.width = pct + "%"

  // 체력 비율에 따라 색상 변경
  if (pct > 50) {
    bar.style.backgroundColor = "#4caf50" // 초록
  } else if (pct > 20) {
    bar.style.backgroundColor = "#ff9800" // 주황
  } else {
    bar.style.backgroundColor = "#f44336" // 빨강
  }

  if (text) {
    if (showNumbers) {
      text.innerText = `HP: ${hp} / ${maxHp}`
    } else {
      text.innerText = ""
    }
  }
}

// ── 타이핑 효과 로그 시스템
// 버그 수정: text[i] → [...text][i] 로 문자 단위 처리
// 공백 문자도 정확히 처리되도록 수정
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

  // 문자 배열로 변환 (이모지·한글 등 유니코드 안전하게 처리)
  const chars = [...text]
  let i = 0

  function typeNext() {
    if (i >= chars.length) {
      isTyping = false
      setTimeout(processQueue, 80)
      return
    }
    // 공백도 그대로 출력 (innerText += 이면 trailing space가 잘릴 수 있으므로 textContent 사용)
    line.textContent += chars[i]
    i++
    log.scrollTop = log.scrollHeight
    setTimeout(typeNext, 18)
  }

  typeNext()
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

// ── 조사 처리 유틸 (은/는, 이/가, 을/를, 과/와, 으로/로)
function josa(word, type) {
  if (!word) return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xAC00 || code > 0xD7A3) {
    // 한글 아닌 경우 기본값
    return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  }
  const hasFinal = (code - 0xAC00) % 28 !== 0 // 받침 있으면 true
  if (type === "은는") return hasFinal ? "은" : "는"
  if (type === "이가") return hasFinal ? "이" : "가"
  if (type === "을를") return hasFinal ? "을" : "를"
  if (type === "과와") return hasFinal ? "과" : "와"
  if (type === "으로") return hasFinal ? "으로" : "로"
  return ""
}

// ── 주사위 2개 모션 (선공 판정용)
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

// ── 선공 판정 (p1만 실행) — 주사위값 계산 후 Firestore에 저장만 함
// 애니메이션은 listenRoom에서 전원(p1 포함) 통일 처리
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
  const firstPokemon = firstSlot === "p1" ? p1Pokemon : p2Pokemon

  // 주사위값 + first_slot + first_pokemon_name 한 번에 저장
  // intro_done은 로그 추가 후 p1이 true로 설정 → 중복 실행 방지
  await updateDoc(roomRef, {
    first_slot: firstSlot,
    first_pokemon_name: firstPokemon.name,
    p1_dice: p1Roll,
    p2_dice: p2Roll
  })
}

// ── 실시간 리스닝
let battleIntroLogged = false

function listenRoom() {
  onSnapshot(roomRef, async (snap) => {
    const data = snap.data()
    if (!data) return

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

    const spectEl = document.getElementById("spectator-list")
    if (spectEl) {
      const names = data.spectator_names ?? []
      spectEl.innerText = names.length > 0 ? "관전: " + names.join(", ") : ""
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
      // p1: 주사위 굴려서 Firestore에 저장 
      if (!isSpectator && mySlot === "p1" && !gameStarted) {
        initTurn(data)
      }
      // 전원(p1 포함): 필요한 값이 모두 있을 때 애니메이션 재생 (diceShown으로 중복 방지)
      if (!diceShown && data.p1_dice && data.p2_dice && data.first_slot && data.first_pokemon_name) {
        diceShown = true
        animateDualDice(data.p1_dice, data.p2_dice, async () => {
          // 애니메이션 끝난 후 p1만 current_turn + 로그 설정
          // intro_done 필드로 Firestore 레벨에서 중복 실행 완전 차단
          if (!isSpectator && mySlot === "p1" && !data.intro_done) {
            const p1Name = data.player1_name
            const p2Name = data.player2_name
            await updateDoc(roomRef, {
              current_turn: data.first_slot,
              turn_count: 1,
              intro_done: true
            })
            await addLogs([
              `${p1Name}${josa(p1Name, "과와")} ${p2Name}의 승부가 시작됐다!`,
              `${p1Name}${josa(p1Name, "은는")} ${data.p1_entry[0].name}${josa(data.p1_entry[0].name, "을를")} 내보냈다!`,
              `${p2Name}${josa(p2Name, "은는")} ${data.p2_entry[0].name}${josa(data.p2_entry[0].name, "을를")} 내보냈다!`,
              `${data.first_pokemon_name}의 선공!`
            ])
          }
        })
      }
      return
    }

    if (!isSpectator) {
      const wasMine = myTurn
      myTurn = data.current_turn === mySlot
      if (!wasMine && myTurn) actionDone = false
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
      turnDisplay.innerText = `🏆 ${data.winner}의 승리!`
      turnDisplay.style.color = "gold"
    }
  } else {
    const myName    = mySlot === "p1" ? data.player1_name : data.player2_name
    const enemyName = mySlot === "p1" ? data.player2_name : data.player1_name
    const isWinner  = data.winner === myName

    if (turnDisplay) {
      if (isWinner) {
        turnDisplay.innerText = `${enemyName}${josa(enemyName, "과와")}의 전투에서 승리했다!`
        turnDisplay.style.color = "gold"
      } else {
        turnDisplay.innerText = `${enemyName}${josa(enemyName, "과와")}의 전투에서 패배했다…`
        turnDisplay.style.color = "red"
      }
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
    p1_active_idx: 0, p2_active_idx: 0,
    p1_dice: null, p2_dice: null,
    first_slot: null, first_pokemon_name: null, intro_done: false
  })
  location.href = "../main.html"
}

// ── 포켓몬 UI (HP바 포함)
function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`]
  const pokemon   = data[`${slot}_entry`][activeIdx]
  if (!pokemon) return

  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name

  const showNumbers = (prefix === "my") // 내 포켓몬만 숫자 표시
  updateHpBar(
    `${prefix}-hp-bar`,
    `${prefix}-active-hp`,
    pokemon.hp,
    pokemon.maxHp,
    showNumbers
  )
}

// ── 기술 버튼
function updateMoveButtons(data) {
  const myActiveIdx = data[`${mySlot}_active_idx`]
  const myPokemon   = data[`${mySlot}_entry`][myActiveIdx]
  const fainted     = !myPokemon || myPokemon.hp <= 0
  const movesArr    = myPokemon?.moves ?? []

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`)
    if (!btn) continue

    if (i >= movesArr.length) {
      btn.innerText = "-"
      btn.disabled  = true
      btn.onclick   = null
      continue
    }

    const move     = movesArr[i]
    const moveInfo = moves[move.name]
    const accText  = moveInfo?.alwaysHit ? "필중" : `${moveInfo?.accuracy ?? 100}%`
    btn.innerText  = `${move.name}\nPP: ${move.pp} | ${accText}`

    if (isSpectator || fainted || move.pp <= 0 || !myTurn || actionDone) {
      btn.disabled = true
      btn.onclick  = null
    } else {
      btn.disabled = false
      btn.onclick  = () => useMove(i, data)
    }
  }
}

// ── 교체 버튼
function updateBenchButtons(data) {
  const benchContainer = document.getElementById("bench-container")
  benchContainer.innerHTML = ""

  const myEntry  = data[`${mySlot}_entry`]
  const activeIdx = data[`${mySlot}_active_idx`]

  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return
    const btn = document.createElement("button")
    if (pkmn.hp <= 0) {
      btn.innerText = `${pkmn.name} (기절)`
      btn.disabled  = true
    } else {
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp} / ${pkmn.maxHp})`
      btn.disabled  = isSpectator || !myTurn || actionDone
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

  const snap      = await getDoc(roomRef)
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

  const moveInfo = moves[moveData.name]
  const newLines = []

  // 공격 지문
  newLines.push(`${myPokemon.name}의 ${moveData.name}!`)

  // 명중 판정
  const { hit, hitType } = calcHit(myPokemon, moveInfo, enePokemon)

  if (!hit) {
    if (hitType === "evaded") {
      newLines.push(`${enePokemon.name}에게는 맞지 않았다!`)
    } else {
      newLines.push(`그러나 ${myPokemon.name}의 공격은 빗나갔다!`)
    }
  } else {
    const { damage, multiplier, stab, dice, critical } = calcDamage(myPokemon, moveData.name, enePokemon)
    if (multiplier === 0) {
      newLines.push(`${enePokemon.name}에게는 효과가 없다…`)
    } else {
      if (multiplier > 1) newLines.push("효과가 굉장했다!")
      if (multiplier < 1) newLines.push("효과가 별로인 듯하다…")
      if (critical) newLines.push("급소에 맞았다!")
      // 1배는 추가 출력 없음
      enePokemon.hp = Math.max(0, enePokemon.hp - damage)
      if (enePokemon.hp <= 0) newLines.push(`${enePokemon.name}${josa(enePokemon.name, "은는")} 쓰러졌다!`)
    }
  }

  const myName    = mySlot === "p1" ? freshData.player1_name : freshData.player2_name
  const enemyName = enemySlot === "p1" ? freshData.player1_name : freshData.player2_name

  if (isAllFainted(enemyEntry)) {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
      turn_count: (freshData.turn_count ?? 1) + 1,
      game_over: true, winner: myName, current_turn: null
    })
    // 각 클라이언트가 listenRoom → showGameOver에서 지문 표시
    newLines.push(`${myName}의 승리!`)
  } else if (isAllFainted(myEntry)) {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
      turn_count: (freshData.turn_count ?? 1) + 1,
      game_over: true, winner: enemyName, current_turn: null
    })
    newLines.push(`${enemyName}의 승리!`)
  } else {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry,
      current_turn: enemySlot,
      turn_count: (freshData.turn_count ?? 1) + 1
    })
  }

  await addLogs(newLines)
}

// ── 교체
async function switchPokemon(newIdx) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
  actionDone = true

  const snap      = await getDoc(roomRef)
  const data      = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"
  const myEntry   = data[`${mySlot}_entry`]
  const myName    = mySlot === "p1" ? data.player1_name : data.player2_name
  const prevName  = myEntry[data[`${mySlot}_active_idx`]].name
  const nextName  = myEntry[newIdx].name

  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx,
    current_turn: enemySlot,
    turn_count: (data.turn_count ?? 1) + 1
  })
  // 포켓몬 스타일 교체 지문
  await addLogs([
    `돌아와, ${prevName}!`,
    `${myName}${josa(myName, "은는")} ${nextName}${josa(nextName, "을를")} 내보냈다!`
  ])
}

// ── 턴 UI
function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (el && !isSpectator) {
    el.innerText  = myTurn ? "내 턴!" : "상대 턴..."
    el.style.color = myTurn ? "green" : "gray"
  }
  const tc = document.getElementById("turn-count")
  if (tc) tc.innerText = `${data.turn_count ?? 1}턴`
}
