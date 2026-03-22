// double/doublebattle.js
// 더블배틀 엔진
// Firestore: double/{ROOM_ID}  +  double/{ROOM_ID}/games/{gameId}
//
// 슬롯 구성: p1+p2 (팀A) vs p3+p4 (팀B)
// 팀 전원 기절 시 패배
// 턴 순서: 4슬롯 각각 주사위(speed+dice 내림차순) → turn_order 배열로 저장
// 특수 팀 액션(팀당 1회):
//   어시스트  - 아군의 다음 공격 위력 2배
//   싱크로나이즈 - 공격받을 때 피해 1/2씩 분산 (양측 동의 필요)

import { auth, db } from "../js/firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc, getDoc, updateDoc, onSnapshot, arrayUnion, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { moves } from "../js/moves.js"
import { getTypeMultiplier } from "../js/typeChart.js"
import {
  statusName, josa,
  applyMoveEffect, checkPreActionStatus, checkConfusion,
  applyEndOfTurnDamage, applyWeatherEffect, getStatusSpdPenalty
} from "../js/effecthandler.js"

// ────────────────────────────────────────────────
// 상수 / 전역
// ────────────────────────────────────────────────
const SLOTS   = ["p1", "p2", "p3", "p4"]
const TEAM_A  = ["p1", "p2"]
const TEAM_B  = ["p3", "p4"]
const ROOM_ID = window.ROOM_ID
const isSpec  = new URLSearchParams(location.search).get("spectator") === "true"

const roomRef = doc(db, "double", ROOM_ID)
let myUid  = null
let mySlot = null
let gameRef  = null
let logSeq   = 0

let actionDone  = false
let gameStarted = false
let redirecting = false

// ────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────
const wait        = ms => new Promise(r => setTimeout(r, ms))
const rollD10     = () => Math.floor(Math.random() * 10) + 1
const teamOf      = s => TEAM_A.includes(s) ? "A" : "B"
const allyOf      = s => (TEAM_A.includes(s) ? TEAM_A : TEAM_B).find(x => x !== s)
const enemyTeamOf = s => TEAM_A.includes(s) ? TEAM_B : TEAM_A
const isAllFainted  = arr => arr.every(p => p.hp <= 0)
const teamFainted   = (entries, team) => team.every(s => entries[s][0].hp <= 0)

function defaultRanks() {
  return { atk: 0, atkTurns: 0, def: 0, defTurns: 0, spd: 0, spdTurns: 0 }
}
function getActiveRank(pkmn, key) {
  const r = pkmn.ranks ?? {}
  return (r[`${key}Turns`] ?? 0) > 0 ? (r[key] ?? 0) : 0
}
function tickRanks(pkmn) {
  const r = pkmn.ranks
  if (!r) return []
  const msgs = []
  for (const [key, label] of [["atk","공격"],["def","방어"],["spd","스피드"]]) {
    if ((r[`${key}Turns`] ?? 0) > 0) {
      r[`${key}Turns`]--
      if (!r[`${key}Turns`]) { r[key] = 0; msgs.push(`${pkmn.name}의 ${label} 랭크가 원래대로 돌아왔다!`) }
    }
  }
  return msgs
}

// ────────────────────────────────────────────────
// 데미지 공식 (싱글배틀과 동일)
// ────────────────────────────────────────────────
function calcHit(atk, moveInfo, def) {
  if (Math.random() * 100 >= (moveInfo.accuracy ?? 100)) return { hit: false, hitType: "missed" }
  if (moveInfo.alwaysHit || moveInfo.skipEvasion) return { hit: true, hitType: "hit" }
  const as = Math.max(1, (atk.speed ?? 3) - getStatusSpdPenalty(atk))
  const ds = Math.max(1, (def.speed ?? 3) - getStatusSpdPenalty(def))
  const ev = Math.min(99, Math.max(0, 5 * (ds - as)) + Math.max(0, getActiveRank(def, "spd")))
  return Math.random() * 100 < ev ? { hit: false, hitType: "evaded" } : { hit: true, hitType: "hit" }
}

function calcDamage(atk, moveName, def, atkRank = 0, defRank = 0) {
  const move = moves[moveName]
  if (!move) return { damage: 0, multiplier: 1, critical: false }
  const dice     = rollD10()
  const defTypes = Array.isArray(def.type) ? def.type : [def.type]
  let multiplier = 1
  for (const dt of defTypes) multiplier *= getTypeMultiplier(move.type, dt)
  if (multiplier === 0) return { damage: 0, multiplier: 0, critical: false }
  const atkTypes = Array.isArray(atk.type) ? atk.type : [atk.type]
  const stab     = atkTypes.includes(move.type)
  const base     = (move.power ?? 40) + (atk.attack ?? 3) * 4 + dice
  const raw      = Math.floor(base * multiplier * (stab ? 1.3 : 1))
  const aAfter   = Math.max(0, raw + Math.max(-raw, atkRank))
  const dAfter   = Math.max(0, aAfter - (def.defense ?? 3) * 5)
  const baseDmg  = Math.max(0, dAfter - Math.min(3, Math.max(0, defRank)) * 3)
  const crit     = Math.random() * 100 < Math.min(100, (atk.attack ?? 3) * 2)
  return { damage: crit ? Math.floor(baseDmg * 1.5) : baseDmg, multiplier, critical: crit }
}

// ────────────────────────────────────────────────
// 변화기 랭크 적용
// ────────────────────────────────────────────────
function applyRankChanges(r, self, target) {
  if (!r) return []
  const roll = r.chance !== undefined ? Math.random() < r.chance : true
  if (!roll) return []
  const msgs = []
  const sR = { ...defaultRanks(), ...(self.ranks   ?? {}) }
  const tR = { ...defaultRanks(), ...(target.ranks ?? {}) }
  const cap   = { atk: 4, def: 3, spd: 5 }
  const label = { atk: "공격", def: "방어", spd: "스피드" }

  const apply = (obj, key, who, name) => {
    const val = obj[key]
    if (val === undefined) return
    if (val > 0) {
      const p = who[key]; who[key] = Math.min(cap[key], who[key] + val); who[`${key}Turns`] = r.turns ?? 2
      msgs.push(`${name}의 ${label[key]}이(가) 올라갔다! (+${who[key] - p})`)
    } else if (val < 0) {
      if (who[key] === 0) { msgs.push(`${name}의 ${label[key]}은(는) 더 이상 내려가지 않는다!`) }
      else { const p = who[key]; who[key] = Math.max(0, who[key] + val); who[`${key}Turns`] = r.turns ?? 2; msgs.push(`${name}의 ${label[key]}이(가) 내려갔다! (${who[key] - p})`) }
    }
  }

  apply({ atk: r.atk },       "atk", sR, self.name)
  apply({ def: r.def },       "def", sR, self.name)
  apply({ spd: r.spd },       "spd", sR, self.name)
  apply({ atk: r.targetAtk }, "atk", tR, target.name)
  apply({ def: r.targetDef }, "def", tR, target.name)
  apply({ spd: r.targetSpd }, "spd", tR, target.name)

  self.ranks   = sR
  target.ranks = tR
  return msgs
}

// ────────────────────────────────────────────────
// 로그 시스템
// ────────────────────────────────────────────────
let typingQueue = [], isTyping = false

function processQueue() {
  if (isTyping || !typingQueue.length) return
  isTyping = true
  const { text } = typingQueue.shift()
  const log = document.getElementById("battle-log")
  if (!log) { isTyping = false; processQueue(); return }
  const line = document.createElement("p")
  log.appendChild(line)
  const chars = [...text]; let i = 0
  const typeNext = () => {
    if (i >= chars.length) { isTyping = false; setTimeout(processQueue, 60); return }
    line.textContent += chars[i++]; log.scrollTop = log.scrollHeight; setTimeout(typeNext, 16)
  }
  typeNext()
}

async function addLog(text) {
  if (!gameRef) return
  await updateDoc(gameRef, { logs: arrayUnion({ text, ts: Date.now() }) })
}
async function addLogs(lines) {
  if (!gameRef || !lines.length) return
  const base = Date.now()
  await updateDoc(gameRef, { logs: arrayUnion(...lines.map((text, i) => ({ text, ts: base + i }))) })
}

function listenLogs() {
  if (!gameRef) return
  onSnapshot(gameRef, snap => {
    const data = snap.data()
    if (!data?.logs) return
    const all = data.logs
    if (all.length > logSeq) {
      all.slice(logSeq).sort((a, b) => a.ts - b.ts).forEach(l => typingQueue.push({ text: l.text }))
      logSeq = all.length
      processQueue()
    }
  })
}

// ────────────────────────────────────────────────
// HP 바 / UI 업데이트
// ────────────────────────────────────────────────
function updateHpBar(slot, pkmn) {
  const bar = document.getElementById(`${slot}-hp-bar`)
  const txt = document.getElementById(`${slot}-hp-text`)
  if (!bar) return
  const pct = pkmn?.maxHp > 0 ? Math.max(0, Math.min(100, pkmn.hp / pkmn.maxHp * 100)) : 0
  bar.style.width = pct + "%"
  bar.style.background = pct > 50 ? "#4caf50" : pct > 20 ? "#ff9800" : "#f44336"
  if (txt) {
    if (!pkmn) { txt.innerText = "???"; return }
    const st = pkmn.status ? ` [${statusName(pkmn.status)}]` : ""
    const cf = (pkmn.confusion ?? 0) > 0 ? " [혼란]" : ""
    txt.innerText = `${pkmn.name} ${pkmn.hp}/${pkmn.maxHp}${st}${cf}`
  }
}

function updateTagDisplay(slot, pkmn) {
  const el = document.getElementById(`${slot}-tag`)
  if (!el || !pkmn) return
  const tags = []
  if (pkmn.assistBoost) tags.push("⚡어시스트")
  if (pkmn.syncActive)  tags.push("🔗싱크로")
  if (pkmn.isAssisting) tags.push("↗어시중")
  el.innerText = tags.join(" ")
}

function updateAllUI(data) {
  for (const s of SLOTS) {
    const pkmn = data[`${s}_entry`]?.[0]
    updateHpBar(s, pkmn)
    updateTagDisplay(s, pkmn)
    const nameEl = document.getElementById(`${s}-player-name`)
    if (nameEl) nameEl.innerText = data[`${s}_name`] ?? s.toUpperCase()
  }
  updateTurnOrderUI(data)
}

function updateTurnOrderUI(data) {
  const el = document.getElementById("turn-order-display")
  if (!el || !data.turn_order) return
  const idx = data.turn_order_idx ?? 0
  el.innerText = "턴 순서: " + data.turn_order.map((s, i) => {
    const pkmn = data[`${s}_entry`]?.[0]
    const name = data[`${s}_name`] ?? s.toUpperCase()
    const dead = !pkmn || pkmn.hp <= 0
    return dead ? `[${name}↓]` : i === idx ? `【${name}】` : name
  }).join(" → ")
}

// ────────────────────────────────────────────────
// 액션 패널 렌더
// ────────────────────────────────────────────────
function renderActionPanel(data) {
  if (isSpec || !mySlot) { hidePanel(); return }
  const idx      = data.turn_order_idx ?? 0
  const curSlot  = data.turn_order?.[idx]
  const isMyTurn = curSlot === mySlot && !data.game_over
  const myPkmn   = data[`${mySlot}_entry`]?.[0]
  const fainted  = !myPkmn || myPkmn.hp <= 0

  const panel = document.getElementById("action-panel")
  if (!panel) return

  if (!isMyTurn || fainted || actionDone) { hidePanel(); return }
  panel.style.display = "block"

  // 기술 버튼
  const movesArr = myPkmn.moves ?? []
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`)
    if (!btn) continue
    const mv = movesArr[i]
    if (!mv) { btn.textContent = "-"; btn.disabled = true; btn.onclick = null; continue }
    btn.textContent = `${mv.name} (PP:${mv.pp})`
    btn.disabled    = mv.pp <= 0
    btn.onclick     = mv.pp > 0 ? () => showTargetSelect(i, data) : null
  }

  // 팀 액션 버튼
  const teamKey  = TEAM_A.includes(mySlot) ? "teamA" : "teamB"
  const ally     = allyOf(mySlot)
  const allyPkmn = data[`${ally}_entry`]?.[0]
  const allyAlive = allyPkmn && allyPkmn.hp > 0

  const assistBtn = document.getElementById("assist-btn")
  const syncBtn   = document.getElementById("sync-btn")

  if (assistBtn) {
    const used       = data[`${teamKey}_assist_used`]
    const pendingReq = data[`assist_request_${mySlot}`]
    assistBtn.disabled    = !allyAlive || used || !!pendingReq || !!myPkmn.assistBoost
    assistBtn.textContent = used ? "어시스트(사용됨)" : "어시스트 요청"
    assistBtn.onclick     = () => requestTeamAction("assist", data)
  }
  if (syncBtn) {
    const used       = data[`${teamKey}_sync_used`]
    const pendingReq = data[`sync_request_${mySlot}`]
    syncBtn.disabled    = !allyAlive || used || !!pendingReq || !!myPkmn.syncActive
    syncBtn.textContent = used ? "싱크로나이즈(사용됨)" : "싱크로나이즈 요청"
    syncBtn.onclick     = () => requestTeamAction("sync", data)
  }

  renderPendingRequests(data)
}

function hidePanel() {
  const p = document.getElementById("action-panel")
  if (p) p.style.display = "none"
  const tm = document.getElementById("target-modal")
  if (tm) tm.innerHTML = ""
}

function showTargetSelect(moveIdx, data) {
  const modal = document.getElementById("target-modal")
  if (!modal) return
  modal.innerHTML = "<p style='margin-bottom:6px;font-size:12px;'>타겟 선택:</p>"

  const enemies = enemyTeamOf(mySlot)
  let anyTarget = false
  for (const es of enemies) {
    const pkmn = data[`${es}_entry`]?.[0]
    if (!pkmn || pkmn.hp <= 0) continue
    anyTarget = true
    const btn = document.createElement("button")
    btn.textContent = `${data[`${es}_name`]}의 ${pkmn.name} (HP:${pkmn.hp})`
    btn.onclick = () => { modal.innerHTML = ""; useMove(moveIdx, es) }
    modal.appendChild(btn)
  }
  if (!anyTarget) { modal.innerHTML = ""; return }

  const cancel = document.createElement("button")
  cancel.textContent  = "취소"
  cancel.style.background = "#555"
  cancel.onclick = () => { modal.innerHTML = "" }
  modal.appendChild(cancel)
}

// ────────────────────────────────────────────────
// 팀 액션: 어시스트 / 싱크로나이즈
// ────────────────────────────────────────────────
async function requestTeamAction(type, data) {
  const ally     = allyOf(mySlot)
  const myPkmn   = data[`${mySlot}_entry`]?.[0]
  const allyPkmn = data[`${ally}_entry`]?.[0]
  if (!allyPkmn || allyPkmn.hp <= 0) return

  const key = type === "assist" ? `assist_request_${mySlot}` : `sync_request_${mySlot}`
  await updateDoc(roomRef, { [key]: { from: mySlot, to: ally, ts: Date.now() } })
  await addLog(`${data[`${mySlot}_name`]}의 ${myPkmn?.name}이(가) ${type === "assist" ? "어시스트" : "싱크로나이즈"}를 요청했다!`)
}

function renderPendingRequests(data) {
  const container = document.getElementById("pending-requests")
  if (!container) return
  container.innerHTML = ""
  const ally = allyOf(mySlot)
  if (!ally) return

  const ar = data[`assist_request_${ally}`]
  if (ar && ar.to === mySlot) {
    const div = document.createElement("div")
    div.innerHTML = `<span>어시스트 요청!</span> `
    const btn = document.createElement("button")
    btn.textContent = "수락"
    btn.onclick = () => acceptAssist(data, ar)
    div.appendChild(btn)
    container.appendChild(div)
  }

  const sr = data[`sync_request_${ally}`]
  if (sr && sr.to === mySlot) {
    const div = document.createElement("div")
    div.innerHTML = `<span> 싱크로나이즈 요청!</span> `
    const btn = document.createElement("button")
    btn.textContent = "수락"
    btn.onclick = () => acceptSync(data, sr)
    div.appendChild(btn)
    container.appendChild(div)
  }
}

async function acceptAssist(data, req) {
  const teamKey   = TEAM_A.includes(mySlot) ? "teamA" : "teamB"
  const fromEntry = (data[`${req.from}_entry`] ?? []).map(p => ({ ...p }))
  fromEntry[0].assistBoost = true
  await updateDoc(roomRef, {
    [`${req.from}_entry`]:      fromEntry,
    [`${teamKey}_assist_used`]: true,
    [`assist_request_${req.from}`]: null
  })
  await addLog(`어시스트 수락! ${fromEntry[0].name}의 다음 공격 위력이 오른다!`)
}

async function acceptSync(data, req) {
  const teamKey   = TEAM_A.includes(mySlot) ? "teamA" : "teamB"
  const fromEntry = (data[`${req.from}_entry`] ?? []).map(p => ({ ...p }))
  const toEntry   = (data[`${mySlot}_entry`]   ?? []).map(p => ({ ...p }))
  fromEntry[0].syncActive  = true
  fromEntry[0].syncPartner = mySlot
  toEntry[0].syncActive    = true
  toEntry[0].syncPartner   = req.from
  await updateDoc(roomRef, {
    [`${req.from}_entry`]:    fromEntry,
    [`${mySlot}_entry`]:      toEntry,
    [`${teamKey}_sync_used`]: true,
    [`sync_request_${req.from}`]: null
  })
  await addLog(`싱크로나이즈 발동! ${fromEntry[0].name}과(와) ${toEntry[0].name}이(가) 연결됐다!`)
}

// ────────────────────────────────────────────────
// 게임 초기화 (p1만 실행)
// ────────────────────────────────────────────────
async function initGame(data) {
  if (gameStarted) return
  gameStarted = true

  const gameId = `dgame_${Date.now()}`
  gameRef = doc(db, "double", ROOM_ID, "games", gameId)
  await updateDoc(roomRef, { game_id: gameId })
  await setDoc(gameRef, {
    logs: [],
    createdAt: Date.now(),
    p1: data.p1_name ?? null,
    p2: data.p2_name ?? null,
    p3: data.p3_name ?? null,
    p4: data.p4_name ?? null
  })
  listenLogs()

  // 4슬롯 주사위
  const dice = {}
  for (const s of SLOTS) dice[`${s}_dice`] = rollD10()

  // speed + dice 내림차순으로 턴 순서 정렬
  const order = [...SLOTS].sort((a, b) => {
    const pa = data[`${a}_entry`]?.[0]
    const pb = data[`${b}_entry`]?.[0]
    return ((pb?.speed ?? 3) + dice[`${b}_dice`]) - ((pa?.speed ?? 3) + dice[`${a}_dice`])
  })

  await updateDoc(roomRef, {
    ...dice,
    turn_order:     order,
    turn_order_idx: 0,
    turn_count:     1,
    game_state:     "battle"
  })

  await addLog("더블배틀이 시작됐다!")
  await wait(400)
  for (const s of SLOTS) {
    const pkmn = data[`${s}_entry`]?.[0]
    await addLog(`${data[`${s}_name`]}의 ${pkmn?.name ?? "???"}이(가) 등장!`)
  }
  await wait(300)
  const diceLog = SLOTS.map(s => `${data[`${s}_name`]}: ${dice[`${s}_dice`]}`).join(", ")
  await addLog(`주사위: ${diceLog}`)
  await addLog(`선공 순서: ${order.map(s => data[`${s}_name`]).join(" → ")}`)
}

// ────────────────────────────────────────────────
// 메인 onSnapshot
// ────────────────────────────────────────────────
function listenRoom() {
  onSnapshot(roomRef, async snap => {
    const data = snap.data()
    if (!data) return

     // 임시 디버그
    console.log("p3_entry:", data.p3_entry)
    console.log("p4_entry:", data.p4_entry)

    if (data.game_id && !gameRef) {
      gameRef = doc(db, "double", ROOM_ID, "games", data.game_id)
      listenLogs()
    }

    if (data.game_over) { showGameOver(data); return }

    if (data.game_started && !data.turn_order && mySlot === "p1" && !gameStarted) {
      await initGame(data)
      return
    }

    const curSlot = data.turn_order?.[data.turn_order_idx ?? 0]
    if (curSlot !== mySlot) actionDone = false

    updateAllUI(data)
    renderActionPanel(data)
  })
}

// ────────────────────────────────────────────────
// 이동기 사용
// ────────────────────────────────────────────────
async function useMove(moveIdx, targetSlot) {
  if (actionDone || isSpec || !mySlot) return
  actionDone = true
  hidePanel()

  const snap = await getDoc(roomRef)
  const data = snap.data()

  const E = {}
  for (const s of SLOTS) {
    E[s] = (data[`${s}_entry`] ?? []).map(p => ({
      ...p,
      moves: (p.moves ?? []).map(m => ({ ...m })),
      ranks: { ...defaultRanks(), ...(p.ranks ?? {}) }
    }))
  }

  const atk = E[mySlot][0]
  const def = E[targetSlot][0]

  if (atk.hp <= 0) { actionDone = false; return }
  const moveData = atk.moves[moveIdx]
  if (!moveData || moveData.pp <= 0) { actionDone = false; return }

  const myName     = data[`${mySlot}_name`]
  const targetName = data[`${targetSlot}_name`]

  const pre = checkPreActionStatus(atk)
  for (const msg of pre.msgs) { await addLog(msg); await wait(300) }
  if (pre.blocked) { await advanceTurn(data, E); return }

  const conf = checkConfusion(atk)
  for (const msg of conf.msgs) { await addLog(msg); await wait(300) }
  if (conf.selfHit) {
    await advanceTurn(data, E); return
  }

  atk.moves[moveIdx] = { ...moveData, pp: moveData.pp - 1 }
  const moveInfo = moves[moveData.name]

  await addLog(`${atk.name}의 ${moveData.name}! → ${targetName}의 ${def.name}을(를) 노린다!`)
  await wait(300)

  // 변화기 처리
  if (!moveInfo?.power) {
    const targetsEnemy = moveInfo?.rank &&
      (moveInfo.rank.targetAtk !== undefined ||
       moveInfo.rank.targetDef !== undefined ||
       moveInfo.rank.targetSpd !== undefined)

    if (targetsEnemy) {
      const { hit, hitType } = calcHit(atk, moveInfo, def)
      if (!hit) {
        await addLog(hitType === "evaded" ? `${def.name}에게는 맞지 않았다!` : `${atk.name}의 공격은 빗나갔다!`)
        await advanceTurn(data, E); return
      }
    } else if (!moveInfo?.alwaysHit && Math.random() * 100 >= (moveInfo?.accuracy ?? 100)) {
      await addLog(`${atk.name}의 기술은 실패했다!`)
      await advanceTurn(data, E); return
    }

    const rMsgs = applyRankChanges(moveInfo?.rank, atk, def)
    rMsgs.push(...tickRanks(atk))
    for (const msg of rMsgs) { await addLog(msg); await wait(280) }

    if (moveInfo?.effect?.weather) {
      const wr = applyWeatherEffect(moveInfo.effect)
      for (const msg of wr.msgs) { await addLog(msg); await wait(280) }
    }

    await advanceTurn(data, E); return
  }

  // 공격기 처리
  const atkRank     = getActiveRank(atk, "atk")
  const defRank     = getActiveRank(def, "def")
  const expiredMsgs = tickRanks(atk)

  const { hit, hitType } = calcHit(atk, moveInfo, def)
  if (!hit) {
    await addLog(hitType === "evaded" ? `${def.name}에게는 맞지 않았다!` : `${atk.name}의 공격은 빗나갔다!`)
    await advanceTurn(data, E); return
  }

  let { damage, multiplier, critical } = calcDamage(atk, moveData.name, def, atkRank, defRank)

  if (multiplier === 0) {
    await addLog(`${def.name}에게는 효과가 없는 듯하다…`)
    await advanceTurn(data, E); return
  }

  if (atk.assistBoost) {
    damage = Math.floor(damage * 2)
    atk.assistBoost = false
    await addLog(`어시스트 효과로 위력이 크게 올라갔다! (×2)`)
  }

  const partner     = def.syncActive ? def.syncPartner : null
  const partnerPkmn = partner ? E[partner]?.[0] : null

  if (partnerPkmn && partnerPkmn.hp > 0) {
    const half = Math.floor(damage / 2)
    def.hp         = Math.max(0, def.hp - half)
    partnerPkmn.hp = Math.max(0, partnerPkmn.hp - half)
    await addLog(`싱크로나이즈 발동! 피해가 ${def.name}과(와) ${partnerPkmn.name}에게 분산! (각 ${half})`)
    if (def.hp <= 0)         await addLog(`${def.name}은(는) 쓰러졌다!`)
    if (partnerPkmn.hp <= 0) await addLog(`${partnerPkmn.name}은(는) 쓰러졌다!`)
  } else {
    def.hp = Math.max(0, def.hp - damage)
    if (multiplier > 1) { await addLog("효과가 굉장했다!"); await wait(250) }
    if (multiplier < 1) { await addLog("효과가 별로인 듯하다…"); await wait(250) }
    if (critical)        { await addLog("급소에 맞았다!"); await wait(250) }
    const effMsgs = applyMoveEffect(moveInfo?.effect, atk, def, damage)
    for (const msg of effMsgs) { await addLog(msg); await wait(250) }
    if (moveInfo?.rank) {
      const rm = applyRankChanges(moveInfo.rank, atk, def)
      for (const msg of rm) { await addLog(msg); await wait(250) }
    }
    if (def.hp <= 0) await addLog(`${def.name}은(는) 쓰러졌다!`)
  }

  const wr = applyWeatherEffect(moveInfo?.effect)
  if (wr.weather) for (const msg of wr.msgs) { await addLog(msg); await wait(280) }

  for (const msg of expiredMsgs) { await addLog(msg); await wait(220) }

  await advanceTurn(data, E, wr.weather)
}

// ────────────────────────────────────────────────
// 턴 진행
// ────────────────────────────────────────────────
async function advanceTurn(data, E, weather = null) {
  const order    = data.turn_order ?? []
  const curCount = data.turn_count ?? 1
  let   idx      = (data.turn_order_idx ?? 0) + 1

  while (idx < order.length && (E[order[idx]]?.[0]?.hp ?? 0) <= 0) idx++

  const isRoundEnd = idx >= order.length

  const entryUpdate = {}
  for (const s of SLOTS) entryUpdate[`${s}_entry`] = E[s]
  if (weather) entryUpdate.weather = weather

  const aFainted = teamFainted(E, TEAM_A)
  const bFainted = teamFainted(E, TEAM_B)

  if (aFainted || bFainted) {
    const winTeam     = aFainted ? "B" : "A"
    const winnerNames = (winTeam === "A" ? TEAM_A : TEAM_B)
      .map(s => data[`${s}_name`]).join(" & ")
    await updateDoc(roomRef, { ...entryUpdate, game_over: true, winner: winnerNames, current_slot: null })
    await addLog(`팀 ${winTeam} (${winnerNames})의 승리!`)
    return
  }

  if (isRoundEnd) {
    const { msgs } = applyEndOfTurnDamage(SLOTS.map(s => E[s]))
    for (const msg of msgs) { await addLog(msg); await wait(250) }

    const aF = teamFainted(E, TEAM_A)
    const bF = teamFainted(E, TEAM_B)
    if (aF || bF) {
      const winTeam     = aF ? "B" : "A"
      const winnerNames = (winTeam === "A" ? TEAM_A : TEAM_B)
        .map(s => data[`${s}_name`]).join(" & ")
      const eu2 = {}
      for (const s of SLOTS) eu2[`${s}_entry`] = E[s]
      await updateDoc(roomRef, { ...eu2, game_over: true, winner: winnerNames, current_slot: null })
      await addLog(`팀 ${winTeam} (${winnerNames})의 승리!`)
      return
    }

    const newOrder = [...order].filter(s => (E[s]?.[0]?.hp ?? 0) > 0)
    const eu2 = {}
    for (const s of SLOTS) eu2[`${s}_entry`] = E[s]
    if (weather) eu2.weather = weather
    await updateDoc(roomRef, {
      ...eu2,
      turn_order:     newOrder,
      turn_order_idx: 0,
      turn_count:     curCount + 1
    })
    await addLog(`=== ${curCount + 1}턴 시작 ===`)
  } else {
    await updateDoc(roomRef, { ...entryUpdate, turn_order_idx: idx })
  }
}

// ────────────────────────────────────────────────
// 게임 오버
// ────────────────────────────────────────────────
function showGameOver(data) {
  hidePanel()
  const el = document.getElementById("status-display")
  if (el) { el.innerText = `🏆 ${data.winner}의 승리!`; el.style.color = "gold" }
  const lb = document.getElementById("leave-btn")
  if (lb) { lb.style.display = "inline-block"; lb.onclick = () => location.href = "../main.html" }
}

// ────────────────────────────────────────────────
// 인증 진입점
// ────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) return
  myUid = user.uid
  const snap = await getDoc(roomRef)
  const room = snap.data() ?? {}
  for (const s of SLOTS) {
    if (room[`${s}_uid`] === myUid) { mySlot = s; break }
  }
  listenRoom()
})
