// battle.js

import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc, collection, getDoc, getDocs, updateDoc, addDoc, deleteDoc, onSnapshot, query, orderBy
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

// ──────────────────────────────────────────────
// 랭크 시스템
// ranks = {
//   atk: 0, atkTurns: 0,   // 공격 랭크 (최대 +4, 최솟값 0)
//   def: 0, defTurns: 0,   // 방어 랭크 (최대 +3)
//   spd: 0, spdTurns: 0,   // 스피드 랭크 (최대 +5%p)
// }
// atkTurns/defTurns/spdTurns: 남은 지속 턴 수
//   기술 사용 턴 포함 2턴 → 사용 직후 2로 세팅
//   해당 포켓몬이 행동할 때마다 1씩 차감 → 0이 되면 만료
// ──────────────────────────────────────────────

function defaultRanks() {
  return { atk: 0, atkTurns: 0, def: 0, defTurns: 0, spd: 0, spdTurns: 0 }
}

// 랭크값 읽기 (턴이 남아 있을 때만 유효)
function getActiveRank(pokemon, key) {
  const r = pokemon.ranks ?? {}
  return (r[`${key}Turns`] ?? 0) > 0 ? (r[key] ?? 0) : 0
}

// 공격 측 턴 소모 (내 행동 시작 시 내 랭크 차감)
function tickMyRanks(pokemon) {
  if (!pokemon.ranks) return
  const r = pokemon.ranks
  if (r.atkTurns > 0) { r.atkTurns--; if (r.atkTurns === 0) r.atk = 0 }
  if (r.spdTurns > 0) { r.spdTurns--; if (r.spdTurns === 0) r.spd = 0 }
  // defTurns는 피격 시 만료이므로 여기서 차감 안 함
}

// 피격 시 수비측 방어 랭크 만료
function expireDefRank(pokemon) {
  if (!pokemon.ranks) return
  pokemon.ranks.defTurns = 0
  pokemon.ranks.def = 0
}

// 수비측 스피드 랭크 차감 (회피 판정 이후)
function tickEnemySpdRank(pokemon) {
  if (!pokemon.ranks) return
  const r = pokemon.ranks
  if (r.spdTurns > 0) { r.spdTurns--; if (r.spdTurns === 0) r.spd = 0 }
}

// ──────────────────────────────────────────────
// 명중 판정
// 1단계: 기술 명중률
// 2단계: 회피율 = 5 × (수비 스피드 - 공격 스피드)% ± 스피드 랭크%p
// ──────────────────────────────────────────────
function calcHit(attacker, moveInfo, defender) {
  // 1단계: 기술 명중
  const accuracyRoll = Math.random() * 100
  if (accuracyRoll >= (moveInfo.accuracy ?? 100)) {
    return { hit: false, hitType: "missed" }
  }

  if (moveInfo.alwaysHit) return { hit: true, hitType: "hit" }

  // 마비로 인한 스피드 감소 반영 (-1)
  const atkSpdPenalty = attacker.status === "paralysis" ? 1 : 0
  const defSpdPenalty = defender.status === "paralysis" ? 1 : 0

  // 얼음으로 인한 스피드 감소 반영 (-3)
  const atkIcePenalty = attacker.status === "frozen" ? 3 : 0
  const defIcePenalty = defender.status === "frozen" ? 3 : 0

  const atkSpd = Math.max(1, (attacker.speed ?? 3) - atkSpdPenalty - atkIcePenalty)
  const defSpd = Math.max(1, (defender.speed ?? 3) - defSpdPenalty - defIcePenalty)

  // 2단계: 회피율
  const spdDiff = defSpd - atkSpd
  const baseEvasion = Math.max(0, 5 * spdDiff)
  const defSpdRankBonus = Math.max(0, getActiveRank(defender, "spd"))
  const evasion = Math.min(99, baseEvasion + defSpdRankBonus) // 최대 99%로 제한

  const evasionRoll = Math.random() * 100
  if (evasionRoll < evasion) {
    return { hit: false, hitType: "evaded" }
  }

  return { hit: true, hitType: "hit" }
}

// ──────────────────────────────────────────────
// 데미지 계산
// ((위력 + 공격력×4 + 1d10) × 타입상성 × 자속보정 ± 공격 랭크) - (방어력×5) - (방어 랭크×3)
// ──────────────────────────────────────────────
function calcDamage(attacker, moveName, defender, atkRank = 0, defRank = 0) {
  const move = moves[moveName]
  if (!move) return { damage: 0, multiplier: 1, stab: false, dice: 0, critical: false }

  const dice = rollD10()

  const defTypes = Array.isArray(defender.type) ? defender.type : [defender.type]
  let multiplier = 1
  for (const dt of defTypes) {
    multiplier *= getTypeMultiplier(move.type, dt)
  }
  if (multiplier === 0) return { damage: 0, multiplier: 0, stab: false, dice, critical: false }

  const atkTypes = Array.isArray(attacker.type) ? attacker.type : [attacker.type]
  const stab = atkTypes.includes(move.type)
  const stabMult = stab ? 1.3 : 1

  const base = (move.power ?? 40) + (attacker.attack ?? 3) * 4 + dice
  const raw = Math.floor(base * multiplier * stabMult)

  // 공격 랭크: 자속보정 이후 정수로 ±, 최솟값 0
  const clampedAtkRank = Math.max(-raw, atkRank) // 음수로 떨어지지 않도록
  const afterAtk = Math.max(0, raw + clampedAtkRank)

  // 방어 감소
  const defReduction = (attacker.defense ?? 3) * 5  // 사용하는 쪽이 아니라 수비 측 방어력
  // 오타 수정: defender.defense 사용
  const afterDef = Math.max(0, afterAtk - (defender.defense ?? 3) * 5)

  // 방어 랭크: 최대 +3, 피해 = afterDef - (defRank × 3), 최솟값 0
  const defRankReduction = Math.min(3, Math.max(0, defRank)) * 3
  const baseDamage = Math.max(0, afterDef - defRankReduction)

  // 급소: 공격력×2% 확률, 급소는 공격 랭크 포함 피해에 ×1.5 (급소율에 공격 랭크 영향 없음)
  const critChance = Math.min(100, (attacker.attack ?? 3) * 2)
  const critical = Math.random() * 100 < critChance
  const damage = critical ? Math.floor(baseDamage * 1.5) : baseDamage

  return { damage, multiplier, stab, dice, critical }
}

// ──────────────────────────────────────────────
// 상태이상 처리
// ──────────────────────────────────────────────

// 마비: 25% 확률로 행동 불가
function checkParalysis(pokemon) {
  if (pokemon.status !== "paralysis") return false
  return Math.random() < 0.25
}

// 얼음: 20% 확률로 해제
function checkFreeze(pokemon) {
  if (pokemon.status !== "frozen") return false
  return Math.random() < 0.20
}

// 턴 종료 시 독/화상 데미지 (최대 HP의 1/16, 소수점 버림, 최소 1)
function calcPoisonBurnDamage(pokemon) {
  if (pokemon.status !== "poison" && pokemon.status !== "burn") return 0
  return Math.max(1, Math.floor((pokemon.maxHp ?? pokemon.hp) / 16))
}

// 상태이상 한글명
function statusName(status) {
  const map = { poison: "독", burn: "화상", paralysis: "마비", frozen: "얼음" }
  return map[status] ?? status
}

// ──────────────────────────────────────────────
// 상태변화 처리
// ──────────────────────────────────────────────

// 혼란: 33.3% 확률로 자해 (공격력×2 고정 위력)
function checkConfusion(pokemon) {
  if (!(pokemon.confusion ?? 0)) return { triggered: false }
  return { triggered: Math.random() < 1 / 3 }
}

function calcConfusionDamage(pokemon) {
  return (pokemon.attack ?? 3) * 2
}

// 혼란 지속 턴 차감 (매 행동 시작 시)
function tickConfusion(pokemon) {
  if (!(pokemon.confusion ?? 0)) return
  pokemon.confusion--
}

// 풀죽음: 1턴 지속, 행동 불가
function checkFlinch(pokemon) {
  return !!(pokemon.flinch)
}

function clearFlinch(pokemon) {
  pokemon.flinch = false
}

// ──────────────────────────────────────────────
// HP바 업데이트
// ──────────────────────────────────────────────
function updateHpBar(barId, textId, hp, maxHp, showNumbers) {
  const bar = document.getElementById(barId)
  const text = textId ? document.getElementById(textId) : null
  if (!bar) return

  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  bar.style.width = pct + "%"

  if (pct > 50) bar.style.backgroundColor = "#4caf50"
  else if (pct > 20) bar.style.backgroundColor = "#ff9800"
  else bar.style.backgroundColor = "#f44336"

  if (text) {
    text.innerText = showNumbers ? `HP: ${hp} / ${maxHp}` : ""
  }
}

// ──────────────────────────────────────────────
// 타이핑 로그 시스템
// ──────────────────────────────────────────────
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

  const chars = [...text]
  let i = 0

  function typeNext() {
    if (i >= chars.length) {
      isTyping = false
      setTimeout(processQueue, 80)
      return
    }
    line.textContent += chars[i]
    i++
    log.scrollTop = log.scrollHeight
    setTimeout(typeNext, 18)
  }

  typeNext()
}

async function addLog(text) {
  await addDoc(logsRef, { text, ts: Date.now() })
}

async function addLogs(lines) {
  const base = Date.now()
  for (let i = 0; i < lines.length; i++) {
    await addDoc(logsRef, { text: lines[i], ts: base + i })
  }
}

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

// ──────────────────────────────────────────────
// 조사 처리 유틸
// ──────────────────────────────────────────────
function josa(word, type) {
  if (!word) return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xAC00 || code > 0xD7A3) {
    return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  }
  const hasFinal = (code - 0xAC00) % 28 !== 0
  if (type === "은는") return hasFinal ? "은" : "는"
  if (type === "이가") return hasFinal ? "이" : "가"
  if (type === "을를") return hasFinal ? "을" : "를"
  if (type === "과와") return hasFinal ? "과" : "와"
  if (type === "으로") return hasFinal ? "으로" : "로"
  return ""
}

// ──────────────────────────────────────────────
// 주사위 2개 모션
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// 선공 판정 (p1만 실행)
// ──────────────────────────────────────────────
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

  await updateDoc(roomRef, {
    first_slot: firstSlot,
    first_pokemon_name: firstPokemon.name,
    p1_dice: p1Roll,
    p2_dice: p2Roll
  })
}

// ──────────────────────────────────────────────
// 실시간 리스닝
// ──────────────────────────────────────────────
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
      if (!isSpectator && mySlot === "p1" && !gameStarted) {
        initTurn(data)
      }
      if (!diceShown && data.p1_dice && data.p2_dice && data.first_slot && data.first_pokemon_name) {
        diceShown = true
        animateDualDice(data.p1_dice, data.p2_dice, async () => {
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

// ──────────────────────────────────────────────
// 게임 종료 UI
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// 관전자 나가기
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// 게임 종료 후 방 나가기
// ──────────────────────────────────────────────
async function leaveGame() {
  const logSnap = await getDocs(logsRef)
  const deletePromises = logSnap.docs.map(d => deleteDoc(d.ref))
  await Promise.all(deletePromises)

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

// ──────────────────────────────────────────────
// 포켓몬 UI (HP바 + 상태이상 표시)
// ──────────────────────────────────────────────
function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`]
  const pokemon   = data[`${slot}_entry`][activeIdx]
  if (!pokemon) return

  // 상태이상 표기
  const statusTag = pokemon.status ? ` [${statusName(pokemon.status)}]` : ""
  const confusionTag = (pokemon.confusion ?? 0) > 0 ? " [혼란]" : ""
  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name + statusTag + confusionTag

  const showNumbers = (prefix === "my")
  updateHpBar(
    `${prefix}-hp-bar`,
    `${prefix}-active-hp`,
    pokemon.hp,
    pokemon.maxHp,
    showNumbers
  )
}

// ──────────────────────────────────────────────
// 기술 버튼
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// 교체 버튼
// ──────────────────────────────────────────────
function updateBenchButtons(data) {
  const benchContainer = document.getElementById("bench-container")
  benchContainer.innerHTML = ""

  const myEntry   = data[`${mySlot}_entry`]
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

// ──────────────────────────────────────────────
// 기술 사용 (메인 액션)
// ──────────────────────────────────────────────
async function useMove(moveIdx, data) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
  actionDone = true
  updateMoveButtons(data)

  const snap      = await getDoc(roomRef)
  const freshData = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  const myActiveIdx  = freshData[`${mySlot}_active_idx`]
  const eneActiveIdx = freshData[`${enemySlot}_active_idx`]

  // 깊은 복사
  const myEntry    = freshData[`${mySlot}_entry`].map(p => ({
    ...p,
    moves: (p.moves ?? []).map(m => ({ ...m })),
    ranks: { ...defaultRanks(), ...(p.ranks ?? {}) }
  }))
  const enemyEntry = freshData[`${enemySlot}_entry`].map(p => ({
    ...p,
    ranks: { ...defaultRanks(), ...(p.ranks ?? {}) }
  }))

  const myPokemon  = myEntry[myActiveIdx]
  const enePokemon = enemyEntry[eneActiveIdx]

  if (myPokemon.hp <= 0) { actionDone = false; return }

  const moveData = myPokemon.moves[moveIdx]
  if (!moveData || moveData.pp <= 0) { actionDone = false; return }

  const newLines = []

  // ── 풀죽음 체크 (행동 불가)
  if (checkFlinch(myPokemon)) {
    clearFlinch(myPokemon)
    newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 풀이 죽어서 움직일 수 없다!`)
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      current_turn: enemySlot,
      turn_count: (freshData.turn_count ?? 1) + 1
    })
    await addLogs(newLines)
    return
  }

  // ── 마비 행동불가 체크 (25%)
  if (checkParalysis(myPokemon)) {
    newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 마비 때문에 움직일 수 없다!`)
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      current_turn: enemySlot,
      turn_count: (freshData.turn_count ?? 1) + 1
    })
    await addLogs(newLines)
    return
  }

  // ── 얼음 해제 체크 (20%)
  if (myPokemon.status === "frozen") {
    if (checkFreeze(myPokemon)) {
      myPokemon.status = null
      newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 얼음 상태에서 회복됐다!`)
      // 해제됐으면 이번 턴은 행동 불가
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry,
        current_turn: enemySlot,
        turn_count: (freshData.turn_count ?? 1) + 1
      })
      await addLogs(newLines)
      return
    } else {
      newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 꽁꽁 얼어서 움직일 수 없다!`)
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry,
        current_turn: enemySlot,
        turn_count: (freshData.turn_count ?? 1) + 1
      })
      await addLogs(newLines)
      return
    }
  }

  // ── 혼란 체크 (33.3%)
  tickConfusion(myPokemon)
  if ((myPokemon.confusion ?? 0) > 0) {
    const { triggered } = checkConfusion(myPokemon)
    if (triggered) {
      const selfDmg = calcConfusionDamage(myPokemon)
      myPokemon.hp = Math.max(0, myPokemon.hp - selfDmg)
      newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 혼란으로 자기 자신을 공격했다! (${selfDmg} 데미지)`)
      if (myPokemon.hp <= 0) {
        newLines.push(`${myPokemon.name}${josa(myPokemon.name, "은는")} 쓰러졌다!`)
      }
      await updateDoc(roomRef, {
        [`${mySlot}_entry`]: myEntry,
        current_turn: enemySlot,
        turn_count: (freshData.turn_count ?? 1) + 1
      })
      await addLogs(newLines)
      return
    }
  }
  if ((myPokemon.confusion ?? 0) <= 0) myPokemon.confusion = 0

  // ── PP 차감
  myPokemon.moves[moveIdx] = { ...moveData, pp: moveData.pp - 1 }

  const moveInfo = moves[moveData.name]

  // 공격 지문
  newLines.push(`${myPokemon.name}의 ${moveData.name}!`)

  // ── 랭크 기술 처리 (업/다운 통합)
  // rank 필드: { atk, def, spd } → 양수면 랭크업(자신), 음수면 랭크다운(상대)
  if (moveInfo?.rank) {
    const r = moveInfo.rank
    const myRanks  = { ...defaultRanks(), ...(myPokemon.ranks ?? {}) }
    const eneRanks = { ...defaultRanks(), ...(enePokemon.ranks ?? {}) }

    // 공격 랭크
    if (r.atk !== undefined) {
      if (r.atk > 0) {
        // 랭크업: 자신에게 적용
        const prev = myRanks.atk
        myRanks.atk = Math.min(4, myRanks.atk + r.atk)
        myRanks.atkTurns = 2
        newLines.push(`${myPokemon.name}의 공격이 올라갔다! (공격 랭크 +${myRanks.atk - prev})`)
      } else {
        // 랭크다운: 상대에게 적용, 최솟값 0
        const prev = eneRanks.atk
        eneRanks.atk = Math.max(0, eneRanks.atk + r.atk) // r.atk가 음수
        eneRanks.atkTurns = 2
        newLines.push(`${enePokemon.name}의 공격이 내려갔다! (공격 랭크 ${myRanks.atk - prev})`)
      }
    }

    // 방어 랭크
    if (r.def !== undefined) {
      if (r.def > 0) {
        const prev = myRanks.def
        myRanks.def = Math.min(3, myRanks.def + r.def)
        myRanks.defTurns = 2
        newLines.push(`${myPokemon.name}의 방어가 올라갔다! (방어 랭크 +${myRanks.def - prev})`)
      } else {
        const prev = eneRanks.def
        eneRanks.def = Math.max(0, eneRanks.def + r.def)
        eneRanks.defTurns = 2
        newLines.push(`${enePokemon.name}의 방어가 내려갔다! (방어 랭크 ${eneRanks.def - prev})`)
      }
    }

    // 스피드 랭크
    if (r.spd !== undefined) {
      if (r.spd > 0) {
        const prev = myRanks.spd
        myRanks.spd = Math.min(5, myRanks.spd + r.spd)
        myRanks.spdTurns = 2
        newLines.push(`${myPokemon.name}의 스피드가 올라갔다! (스피드 랭크 +${myRanks.spd - prev}%p)`)
      } else {
        const prev = eneRanks.spd
        eneRanks.spd = Math.max(0, eneRanks.spd + r.spd)
        eneRanks.spdTurns = 2
        newLines.push(`${enePokemon.name}의 스피드가 내려갔다! (스피드 랭크 ${eneRanks.spd - prev}%p)`)
      }
    }

    myPokemon.ranks  = myRanks
    enePokemon.ranks = eneRanks

    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      [`${enemySlot}_entry`]: enemyEntry,
      current_turn: enemySlot,
      turn_count: (freshData.turn_count ?? 1) + 1
    })
    await addLogs(newLines)
    return
  }

  // ── 현재 유효한 랭크 값 읽기
  const atkRank    = getActiveRank(myPokemon, "atk")
  const defRankEne = getActiveRank(enePokemon, "def")

  // ── 내 공격/스피드 랭크 차감 (이번 행동 소모)
  tickMyRanks(myPokemon)

  // ── 명중 판정
  const { hit, hitType } = calcHit(myPokemon, moveInfo, enePokemon)

  // ── 수비측 스피드 랭크 차감 (회피 판정 이후)
  tickEnemySpdRank(enePokemon)

  if (!hit) {
    if (hitType === "evaded") {
      newLines.push(`${enePokemon.name}에게는 맞지 않았다!`)
    } else {
      newLines.push(`그러나 ${myPokemon.name}의 공격은 빗나갔다!`)
    }
  } else {
    const { damage, multiplier, stab, dice, critical } = calcDamage(
      myPokemon, moveData.name, enePokemon, atkRank, defRankEne
    )

    if (multiplier === 0) {
      newLines.push(`${enePokemon.name}에게는 효과가 없다…`)
    } else {
      if (multiplier > 1) newLines.push("효과가 굉장했다!")
      if (multiplier < 1) newLines.push("효과가 별로인 듯하다…")
      if (critical) newLines.push("급소에 맞았다!")

      enePokemon.hp = Math.max(0, enePokemon.hp - damage)

      // ── 부가효과 처리 (moves.js effect 구조 기준)
      const effect = moveInfo?.effect
      if (effect && enePokemon.hp > 0) {
        const roll = Math.random()

        // 상태이상 부여 (상대에게 이미 상태이상 없을 때만)
        if (effect.status && roll < effect.chance && !enePokemon.status) {
          enePokemon.status = effect.status
          newLines.push(`${enePokemon.name}${josa(enePokemon.name, "은는")} ${statusName(effect.status)} 상태가 됐다!`)
        }

        // 혼란 부여
        if (effect.volatile === "혼란" && roll < effect.chance && !(enePokemon.confusion ?? 0)) {
          enePokemon.confusion = Math.floor(Math.random() * 3) + 1 // 1~3턴
          newLines.push(`${enePokemon.name}${josa(enePokemon.name, "은는")} 혼란에 빠졌다!`)
        }

        // 풀죽음 부여
        if (effect.volatile === "풀죽음" && roll < effect.chance) {
          enePokemon.flinch = true
          newLines.push(`${enePokemon.name}${josa(enePokemon.name, "은는")} 풀이 죽었다!`)
        }
      }

      if (enePokemon.hp <= 0) newLines.push(`${enePokemon.name}${josa(enePokemon.name, "은는")} 쓰러졌다!`)

      // 피격 시 수비측 방어 랭크 만료
      expireDefRank(enePokemon)
    }
  }

  const myName    = mySlot === "p1" ? freshData.player1_name : freshData.player2_name
  const enemyName = enemySlot === "p1" ? freshData.player1_name : freshData.player2_name

  // ── 턴 종료 처리 (독/화상 데미지, 게임 종료 체크)
  // 양측 행동이 끝난 후 → current_turn이 바뀌는 시점에서 처리
  // "turn_count가 짝수일 때 p1 행동 완료, 홀수일 때 p2 행동 완료"로 판단 가능하나
  // 간단하게: enemySlot이 다음 턴이 되면 이 턴이 하나의 반턴 → 양측 모두 행동 완료 후 독/화상 처리
  // → turn_count를 통해 짝수번째 행동(=한 라운드 완료) 시 처리
  // 현재 turn_count가 짝수 → 이번 행동 후 한 라운드 완료 (first_slot 기준 2번 행동)
  const nextTurnCount = (freshData.turn_count ?? 1) + 1
  // 독/화상은 양측이 모두 행동한 후 = turn_count가 짝수일 때 적용
  // (1라운드 = p1 행동 + p2 행동, turn_count는 매 행동마다 +1)
  if (nextTurnCount % 2 === 0) {
    // 이번 라운드 종료 시 독/화상 데미지 적용
    for (const entry of [myEntry, enemyEntry]) {
      for (const pkmn of entry) {
        if (pkmn.hp <= 0) continue
        const dmg = calcPoisonBurnDamage(pkmn)
        if (dmg > 0) {
          pkmn.hp = Math.max(0, pkmn.hp - dmg)
          newLines.push(`${pkmn.name}${josa(pkmn.name, "은는")} ${statusName(pkmn.status)} 때문에 ${dmg} 데미지를 입었다!`)
          if (pkmn.hp <= 0) newLines.push(`${pkmn.name}${josa(pkmn.name, "은는")} 쓰러졌다!`)
        }
      }
    }
  }

  if (isAllFainted(enemyEntry)) {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      [`${enemySlot}_entry`]: enemyEntry,
      turn_count: nextTurnCount,
      game_over: true, winner: myName, current_turn: null
    })
    newLines.push(`${myName}의 승리!`)
  } else if (isAllFainted(myEntry)) {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      [`${enemySlot}_entry`]: enemyEntry,
      turn_count: nextTurnCount,
      game_over: true, winner: enemyName, current_turn: null
    })
    newLines.push(`${enemyName}의 승리!`)
  } else {
    await updateDoc(roomRef, {
      [`${mySlot}_entry`]: myEntry,
      [`${enemySlot}_entry`]: enemyEntry,
      current_turn: enemySlot,
      turn_count: nextTurnCount
    })
  }

  await addLogs(newLines)
}

// ──────────────────────────────────────────────
// 교체
// ──────────────────────────────────────────────
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
  await addLogs([
    `돌아와, ${prevName}!`,
    `${myName}${josa(myName, "은는")} ${nextName}${josa(nextName, "을를")} 내보냈다!`
  ])
}

// ──────────────────────────────────────────────
// 턴 UI
// ──────────────────────────────────────────────
function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (el && !isSpectator) {
    el.innerText   = myTurn ? "내 턴!" : "상대 턴..."
    el.style.color = myTurn ? "green" : "gray"
  }
  const tc = document.getElementById("turn-count")
  if (tc) tc.innerText = `${data.turn_count ?? 1}턴`
}
