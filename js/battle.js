// battle.js

import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc, collection, getDoc, getDocs, updateDoc, addDoc, deleteDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { moves } from "./moves.js"
import { getTypeMultiplier } from "./typeChart.js"
import {
  statusName, josa as josaEH,
  applyMoveEffect, checkPreActionStatus, checkConfusion,
  applyEndOfTurnDamage, applyWeatherEffect,
  getStatusSpdPenalty
} from "./effecthandler.js"
import { fadeBgmOut } from "./intro.js"

const roomRef = doc(db, "rooms", ROOM_ID)
const logsRef = collection(db, "rooms", ROOM_ID, "logs")

let mySlot   = null, myUid  = null, myTurn = false
let gameStarted = false, diceShown = false, actionDone = false, gameOver = false
let battleIntroSequenceStarted = false
let lastHitEventTs = 0   // ← 추가: 중복 깜빡임 방지

const isSpectator = new URLSearchParams(location.search).get("spectator") === "true"

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }
function josa(w, t) { return josaEH(w, t) }
function rollD10() { return Math.floor(Math.random() * 10) + 1 }
function isAllFainted(entry) { return entry.every(p => p.hp <= 0) }

function defaultRanks() { return { atk: 0, atkTurns: 0, def: 0, defTurns: 0, spd: 0, spdTurns: 0 } }
function getActiveRank(pokemon, key) {
  const r = pokemon.ranks ?? {}
  return (r[`${key}Turns`] ?? 0) > 0 ? (r[key] ?? 0) : 0
}
function tickMyRanks(pokemon) {
  if (!pokemon.ranks) return []
  const r = pokemon.ranks, msgs = []
  if (r.atkTurns > 0) { r.atkTurns--; if (!r.atkTurns) { r.atk = 0; msgs.push(`${pokemon.name}의 공격 랭크가 원래대로 돌아왔다!`) } }
  if (r.defTurns > 0) { r.defTurns--; if (!r.defTurns) { r.def = 0; msgs.push(`${pokemon.name}의 방어 랭크가 원래대로 돌아왔다!`) } }
  if (r.spdTurns > 0) { r.spdTurns--; if (!r.spdTurns) { r.spd = 0; msgs.push(`${pokemon.name}의 스피드 랭크가 원래대로 돌아왔다!`) } }
  return msgs
}

function calcHit(attacker, moveInfo, defender) {
  if (Math.random() * 100 >= (moveInfo.accuracy ?? 100)) return { hit: false, hitType: "missed" }
  if (moveInfo.alwaysHit) return { hit: true, hitType: "hit" }
  const as = Math.max(1, (attacker.speed ?? 3) - getStatusSpdPenalty(attacker))
  const ds = Math.max(1, (defender.speed  ?? 3) - getStatusSpdPenalty(defender))
  const ev = Math.min(99, Math.max(0, 5 * (ds - as)) + Math.max(0, getActiveRank(defender, "spd")))
  return Math.random() * 100 < ev ? { hit: false, hitType: "evaded" } : { hit: true, hitType: "hit" }
}

function calcDamage(attacker, moveName, defender, atkRank = 0, defRank = 0) {
  const move = moves[moveName]
  if (!move) return { damage: 0, multiplier: 1, stab: false, dice: 0, critical: false }
  const dice = rollD10()
  const defTypes = Array.isArray(defender.type) ? defender.type : [defender.type]
  let multiplier = 1
  for (const dt of defTypes) multiplier *= getTypeMultiplier(move.type, dt)
  if (multiplier === 0) return { damage: 0, multiplier: 0, stab: false, dice, critical: false }
  const atkTypes = Array.isArray(attacker.type) ? attacker.type : [attacker.type]
  const stab = atkTypes.includes(move.type)
  const base = (move.power ?? 40) + (attacker.attack ?? 3) * 4 + dice
  const raw  = Math.floor(base * multiplier * (stab ? 1.3 : 1))
  const afterAtk = Math.max(0, raw + Math.max(-raw, atkRank))
  const afterDef = Math.max(0, afterAtk - (defender.defense ?? 3) * 5)
  const baseDmg  = Math.max(0, afterDef - Math.min(3, Math.max(0, defRank)) * 3)
  const critical = Math.random() * 100 < Math.min(100, (attacker.attack ?? 3) * 2)
  return { damage: critical ? Math.floor(baseDmg * 1.5) : baseDmg, multiplier, stab, dice, critical }
}

function updateHpBar(barId, textId, hp, maxHp, showNumbers) {
  const bar = document.getElementById(barId), txt = textId ? document.getElementById(textId) : null
  if (!bar) return
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  bar.style.width = pct + "%"
  bar.style.backgroundColor = pct > 50 ? "#4caf50" : pct > 20 ? "#ff9800" : "#f44336"
  if (txt) txt.innerText = showNumbers ? `HP: ${hp} / ${maxHp}` : ""
}

function updatePortrait(prefix, pokemon, animate = false) {
  const img = document.getElementById(`${prefix}-portrait`)
  if (!img) return
  if (!pokemon.portrait) { img.classList.remove("visible"); img.style.display = "none"; return }
  img.classList.remove("visible", "slide-in-my", "slide-in-enemy")
  img.style.display = "block"; img.src = pokemon.portrait; img.alt = pokemon.name
  setTimeout(() => {
    img.classList.add("visible", ...(animate ? [prefix === "my" ? "slide-in-my" : "slide-in-enemy"] : []))
  }, 80)
}

function triggerAttackEffect(atkPfx, defPfx) {
  return new Promise(resolve => {
    const atkArea = document.getElementById(`${atkPfx}-pokemon-area`)
    const defArea = document.getElementById(`${defPfx}-pokemon-area`)
    if (atkArea) {
      atkArea.classList.add("attacker-flash")
      atkArea.addEventListener("animationend", () => atkArea.classList.remove("attacker-flash"), { once: true })
    }
    setTimeout(() => {
      if (defArea) {
        defArea.classList.add("defender-hit")
        defArea.addEventListener("animationend", () => { defArea.classList.remove("defender-hit"); resolve() }, { once: true })
      } else resolve()
    }, 120)
  })
}

function triggerBlink(prefix) {
  return new Promise(resolve => {
    const area = document.getElementById(`${prefix}-pokemon-area`)
    if (!area) { resolve(); return }
    area.classList.add("blink-damage")
    area.addEventListener("animationend", () => { area.classList.remove("blink-damage"); resolve() }, { once: true })
  })
}

let renderedLogIds = new Set(), typingQueue = [], isTyping = false

function processQueue() {
  if (isTyping || typingQueue.length === 0) return
  isTyping = true
  const { text, resolve } = typingQueue.shift()
  const log = document.getElementById("battle-log")
  if (!log) { isTyping = false; if (resolve) resolve(); processQueue(); return }
  const line = document.createElement("p"); log.appendChild(line)
  const chars = [...text]; let i = 0
  function typeNext() {
    if (i >= chars.length) { isTyping = false; if (resolve) resolve(); setTimeout(processQueue, 80); return }
    line.textContent += chars[i++]; log.scrollTop = log.scrollHeight; setTimeout(typeNext, 18)
  }
  typeNext()
}

async function addLog(text) { await addDoc(logsRef, { text, ts: Date.now() }) }
async function addLogs(lines) {
  const base = Date.now()
  for (let i = 0; i < lines.length; i++) await addDoc(logsRef, { text: lines[i], ts: base + i })
}

function listenLogs() {
  const q = query(logsRef, orderBy("ts"))
  onSnapshot(q, snap => {
    snap.docs.forEach(d => {
      if (renderedLogIds.has(d.id)) return
      renderedLogIds.add(d.id)
      typingQueue.push({ text: d.data().text, resolve: null })
    })
    processQueue()
  })
}

function animateDualDice(p1Roll, p2Roll, onDone) {
  const p1El = document.getElementById("dice-p1"), p2El = document.getElementById("dice-p2")
  const wrap = document.getElementById("dice-wrap")
  const p1Box = document.getElementById("dice-box-p1"), p2Box = document.getElementById("dice-box-p2")
  const hitBox = document.getElementById("dice-box-hit")
  if (!wrap) { onDone(); return }
  if (p1Box) p1Box.style.display = "block"
  if (p2Box) p2Box.style.display = "block"
  if (hitBox) hitBox.style.display = "none"
  wrap.style.display = "flex"
  let count = 0
  const iv = setInterval(() => {
    if (p1El) p1El.innerText = rollD10()
    if (p2El) p2El.innerText = rollD10()
    if (++count >= 15) {
      clearInterval(iv)
      if (p1El) p1El.innerText = p1Roll
      if (p2El) p2El.innerText = p2Roll
      setTimeout(() => { wrap.style.display = "none"; onDone() }, 1500)
    }
  }, 60)
}

onAuthStateChanged(auth, async user => {
  if (!user) return
  myUid = user.uid
  const roomSnap = await getDoc(roomRef), room = roomSnap.data()
  mySlot = room.player1_uid === myUid ? "p1" : "p2"

  if (isSpectator) {
    const td = document.getElementById("turn-display")
    if (td) { td.innerText = "관전 중"; td.style.color = "gray" }
    const lb = document.getElementById("leaveBtn")
    if (lb) { lb.style.display = "inline-block"; lb.disabled = false; lb.innerText = "관전 종료"; lb.onclick = leaveAsSpectator }
    document.getElementById("battle-screen").classList.add("visible")
  }

  waitForBattleReady()
  listenLogs()
})

function waitForBattleReady() {
  const screen = document.getElementById("battle-screen")
  if (screen.classList.contains("visible")) { listenRoom(); return }
  const obs = new MutationObserver(() => {
    if (screen.classList.contains("visible")) { obs.disconnect(); listenRoom() }
  })
  obs.observe(screen, { attributes: true, attributeFilter: ["class"] })
}

async function initTurn(data) {
  if (gameStarted) return
  gameStarted = true
  const p1 = data.p1_entry[0], p2 = data.p2_entry[0]
  const r1 = rollD10(), r2 = rollD10()
  const fs = (p1.speed ?? 3) + r1 >= (p2.speed ?? 3) + r2 ? "p1" : "p2"
  await updateDoc(roomRef, { first_slot: fs, first_pokemon_name: fs === "p1" ? p1.name : p2.name, p1_dice: r1, p2_dice: r2 })
}

async function runBattleIntroSequence(data) {
  const p1Name = data.player1_name, p2Name = data.player2_name
  const enemySlot = mySlot === "p1" ? "p2" : "p1"
  await addLog(`${p1Name}${josa(p1Name, "과와")} ${p2Name}의 승부가 시작됐다!`)
  await wait(3000)
  await addLogs([
    `${p1Name}${josa(p1Name, "은는")} ${data.p1_entry[0].name}${josa(data.p1_entry[0].name, "을를")} 내보냈다!`,
    `${p2Name}${josa(p2Name, "은는")} ${data.p2_entry[0].name}${josa(data.p2_entry[0].name, "을를")} 내보냈다!`,
    `${data.first_pokemon_name}의 선공!`
  ])
  updatePortrait("my",    data[`${mySlot}_entry`][0],    true)
  updatePortrait("enemy", data[`${enemySlot}_entry`][0], true)
  await updateDoc(roomRef, { current_turn: data.first_slot, turn_count: 1, intro_done: true })
}

function listenRoom() {
  onSnapshot(roomRef, async snap => {
    const data = snap.data(); if (!data) return

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."
    const spectEl = document.getElementById("spectator-list")
    if (spectEl) { const n = data.spectator_names ?? []; spectEl.innerText = n.length > 0 ? "관전: " + n.join(", ") : "" }

    if (!data.p1_entry || !data.p2_entry) return
    const enemySlot = mySlot === "p1" ? "p2" : "p1"
    updateActiveUI(mySlot, data, "my"); updateActiveUI(enemySlot, data, "enemy")

    // ── 추가: hit_event 감지 → 피격자 화면에서 깜빡임
    if (data.hit_event && data.hit_event.ts > lastHitEventTs) {
      lastHitEventTs = data.hit_event.ts
      const defPrefix = data.hit_event.defender === mySlot ? "my" : "enemy"
      triggerBlink(defPrefix)
    }

    if (data.game_over) { showGameOver(data); return }

    if (!data.current_turn) {
      if (!isSpectator && mySlot === "p1" && !gameStarted) await initTurn(data)
      if (!diceShown && data.p1_dice && data.p2_dice && data.first_slot) {
        diceShown = true
        animateDualDice(data.p1_dice, data.p2_dice, async () => {
          if (!isSpectator && mySlot === "p1" && !data.intro_done && !battleIntroSequenceStarted) {
            battleIntroSequenceStarted = true
            await runBattleIntroSequence(data)
          }
        })
      }
      return
    }

    if (!isSpectator) {
      const wasMine = myTurn; myTurn = data.current_turn === mySlot
      if (!wasMine && myTurn) actionDone = false
      updateTurnUI(data)
    }
    updateBenchButtons(data); updateMoveButtons(data)
  })
}

function showGameOver(data) {
  fadeBgmOut(2000)
  const td = document.getElementById("turn-display")
  if (isSpectator) {
    if (td) { td.innerText = `🏆 ${data.winner}의 승리!`; td.style.color = "gold" }
  } else {
    const myName = mySlot === "p1" ? data.player1_name : data.player2_name
    const enemyName = mySlot === "p1" ? data.player2_name : data.player1_name
    const win = data.winner === myName
    if (td) { td.innerText = win ? `${enemyName}${josa(enemyName,"과와")}의 전투에서 승리했다!` : `${enemyName}${josa(enemyName,"과와")}의 전투에서 패배했다…`; td.style.color = win ? "gold" : "red" }
  }
  for (let i = 0; i < 4; i++) { const b = document.getElementById(`move-btn-${i}`); if (b) { b.disabled = true; b.onclick = null } }
  const bench = document.getElementById("bench-container"); if (bench) bench.innerHTML = ""
  if (!isSpectator) {
    const lb = document.getElementById("leaveBtn")
    if (lb) { lb.style.display = "inline-block"; lb.disabled = false; lb.innerText = "방 나가기"; lb.onclick = leaveGame }
  }
}

async function leaveAsSpectator() {
  const snap = await getDoc(roomRef), data = snap.data()
  await updateDoc(roomRef, {
    spectators:      (data.spectators      ?? []).filter(u => u !== myUid),
    spectator_names: (data.spectator_names ?? []).filter((_, i) => (data.spectators ?? [])[i] !== myUid)
  })
  location.href = "../main.html"
}

async function leaveGame() {
  const logSnap = await getDocs(logsRef)
  await Promise.all(logSnap.docs.map(d => deleteDoc(d.ref)))
  await updateDoc(roomRef, {
    player1_uid: null, player1_name: null, player1_ready: false,
    player2_uid: null, player2_name: null, player2_ready: false,
    game_started: false, game_over: false, winner: null,
    current_turn: null, turn_count: 0, p1_entry: null, p2_entry: null,
    p1_active_idx: 0, p2_active_idx: 0, p1_dice: null, p2_dice: null,
    first_slot: null, first_pokemon_name: null, intro_done: false,
    intro_ready_p1: false, intro_ready_p2: false,
    hit_event: null
  })
  location.href = "../main.html"
}

function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`], pokemon = data[`${slot}_entry`]?.[activeIdx]
  if (!pokemon) return
  const st = pokemon.status ? ` [${statusName(pokemon.status)}]` : ""
  const cf = (pokemon.confusion ?? 0) > 0 ? " [혼란]" : ""
  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name + st + cf
  updateHpBar(`${prefix}-hp-bar`, `${prefix}-active-hp`, pokemon.hp, pokemon.maxHp, prefix === "my")
  updatePortrait(prefix, pokemon)
}

function updateMoveButtons(data) {
  const myPokemon = data[`${mySlot}_entry`]?.[data[`${mySlot}_active_idx`]]
  const fainted = !myPokemon || myPokemon.hp <= 0, movesArr = myPokemon?.moves ?? []
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`move-btn-${i}`); if (!btn) continue
    if (i >= movesArr.length) { btn.innerText = "-"; btn.disabled = true; btn.onclick = null; continue }
    const move = movesArr[i], moveInfo = moves[move.name]
    btn.innerText = `${move.name}\nPP: ${move.pp} | ${moveInfo?.alwaysHit ? "필중" : `${moveInfo?.accuracy ?? 100}%`}`
    if (isSpectator || fainted || move.pp <= 0 || !myTurn || actionDone) { btn.disabled = true; btn.onclick = null }
    else { btn.disabled = false; btn.onclick = () => useMove(i, data) }
  }
}

function updateBenchButtons(data) {
  const bench = document.getElementById("bench-container"); bench.innerHTML = ""
  const myEntry = data[`${mySlot}_entry`], activeIdx = data[`${mySlot}_active_idx`]
  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return
    const btn = document.createElement("button")
    if (pkmn.hp <= 0) { btn.innerText = `${pkmn.name} (기절)`; btn.disabled = true }
    else {
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp} / ${pkmn.maxHp})`
      btn.disabled = isSpectator || !myTurn || actionDone
      if (!isSpectator) btn.onclick = () => switchPokemon(idx)
    }
    bench.appendChild(btn)
  })
}

function updateTurnUI(data) {
  const el = document.getElementById("turn-display")
  if (el && !isSpectator) { el.innerText = myTurn ? "내 턴!" : "상대 턴..."; el.style.color = myTurn ? "green" : "gray" }
  const tc = document.getElementById("turn-count"); if (tc) tc.innerText = `${data.turn_count ?? 1}턴`
}

async function switchPokemon(newIdx) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
  actionDone = true
  const snap = await getDoc(roomRef), data = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"
  const myEntry = data[`${mySlot}_entry`]
  const myName = mySlot === "p1" ? data.player1_name : data.player2_name
  const prev = myEntry[data[`${mySlot}_active_idx`]].name, next = myEntry[newIdx].name
  await addLog(`돌아와, ${prev}!`); await wait(400)
  await addLog(`${myName}${josa(myName, "은는")} ${next}${josa(next, "을를")} 내보냈다!`); await wait(200)
  await updateDoc(roomRef, { [`${mySlot}_active_idx`]: newIdx, current_turn: enemySlot, turn_count: (data.turn_count ?? 1) + 1 })
}

async function useMove(moveIdx, data) {
  if (isSpectator || !myTurn || actionDone || gameOver) return
  actionDone = true; updateMoveButtons(data)

  const snap = await getDoc(roomRef), freshData = snap.data()
  const enemySlot = mySlot === "p1" ? "p2" : "p1"
  const myActiveIdx = freshData[`${mySlot}_active_idx`], eneActiveIdx = freshData[`${enemySlot}_active_idx`]

  const myEntry = freshData[`${mySlot}_entry`].map(p => ({ ...p, moves: (p.moves ?? []).map(m => ({ ...m })), ranks: { ...defaultRanks(), ...(p.ranks ?? {}) } }))
  const enemyEntry = freshData[`${enemySlot}_entry`].map(p => ({ ...p, ranks: { ...defaultRanks(), ...(p.ranks ?? {}) } }))
  const myPokemon = myEntry[myActiveIdx], enePokemon = enemyEntry[eneActiveIdx]

  if (myPokemon.hp <= 0) { actionDone = false; return }
  const moveData = myPokemon.moves[moveIdx]
  if (!moveData || moveData.pp <= 0) { actionDone = false; return }

  const myName = mySlot === "p1" ? freshData.player1_name : freshData.player2_name
  const enemyName = enemySlot === "p1" ? freshData.player1_name : freshData.player2_name

  const preAction = checkPreActionStatus(myPokemon)
  for (const msg of preAction.msgs) { await addLog(msg); await wait(350) }
  if (preAction.blocked) {
    await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, current_turn: enemySlot, turn_count: (freshData.turn_count ?? 1) + 1 })
    return
  }

  const confResult = checkConfusion(myPokemon)
  for (const msg of confResult.msgs) { await addLog(msg); await wait(350) }
  if (confResult.selfHit) {
    if (isAllFainted(myEntry)) {
      await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, turn_count: (freshData.turn_count ?? 1) + 1, game_over: true, winner: enemyName, current_turn: null })
      await addLog(`${enemyName}의 승리!`)
    } else {
      await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, current_turn: enemySlot, turn_count: (freshData.turn_count ?? 1) + 1 })
    }
    return
  }

  myPokemon.moves[moveIdx] = { ...moveData, pp: moveData.pp - 1 }
  const moveInfo = moves[moveData.name]

  await addLog(`${myPokemon.name}의 ${moveData.name}!`); await wait(300)

  if (moveInfo?.rank) {
    const r = moveInfo.rank
    const myR = { ...defaultRanks(), ...(myPokemon.ranks ?? {}) }, eneR = { ...defaultRanks(), ...(enePokemon.ranks ?? {}) }
    const rl = []
    if (r.atk !== undefined) {
      if (r.atk > 0) { const p = myR.atk; myR.atk = Math.min(4, myR.atk + r.atk); myR.atkTurns = 2; rl.push(`${myPokemon.name}의 공격이 올라갔다! (+${myR.atk - p})`) }
      else if (eneR.atk === 0) rl.push(`${enePokemon.name}의 공격은 더 이상 내려가지 않는다!`)
      else { const p = eneR.atk; eneR.atk = Math.max(0, eneR.atk + r.atk); eneR.atkTurns = 2; rl.push(`${enePokemon.name}의 공격이 내려갔다! (${eneR.atk - p})`) }
    }
    if (r.def !== undefined) {
      if (r.def > 0) { const p = myR.def; myR.def = Math.min(3, myR.def + r.def); myR.defTurns = 2; rl.push(`${myPokemon.name}의 방어가 올라갔다! (+${myR.def - p})`) }
      else if (eneR.def === 0) rl.push(`${enePokemon.name}의 방어는 더 이상 내려가지 않는다!`)
      else { const p = eneR.def; eneR.def = Math.max(0, eneR.def + r.def); eneR.defTurns = 2; rl.push(`${enePokemon.name}의 방어가 내려갔다! (${eneR.def - p})`) }
    }
    if (r.spd !== undefined) {
      if (r.spd > 0) { const p = myR.spd; myR.spd = Math.min(5, myR.spd + r.spd); myR.spdTurns = 2; rl.push(`${myPokemon.name}의 스피드가 올라갔다! (+${myR.spd - p}%p)`) }
      else if (eneR.spd === 0) rl.push(`${enePokemon.name}의 스피드는 더 이상 내려가지 않는다!`)
      else { const p = eneR.spd; eneR.spd = Math.max(0, eneR.spd + r.spd); eneR.spdTurns = 2; rl.push(`${enePokemon.name}의 스피드가 내려갔다! (${eneR.spd - p}%p)`) }
    }
    myPokemon.ranks = myR; enePokemon.ranks = eneR; rl.push(...tickMyRanks(myPokemon))
    for (const msg of rl) { await addLog(msg); await wait(300) }
    await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, current_turn: enemySlot, turn_count: (freshData.turn_count ?? 1) + 1 })
    return
  }

  const atkRank = getActiveRank(myPokemon, "atk"), defRankEne = getActiveRank(enePokemon, "def")
  const expiredMsgs = tickMyRanks(myPokemon)

  await triggerAttackEffect("my", "enemy")

  const { hit, hitType } = calcHit(myPokemon, moveInfo, enePokemon)
  if (!hit) {
    await addLog(hitType === "evaded" ? `${enePokemon.name}에게는 맞지 않았다!` : `그러나 ${myPokemon.name}의 공격은 빗나갔다!`)
  } else {
    const { damage, multiplier, stab, dice, critical } = calcDamage(myPokemon, moveData.name, enePokemon, atkRank, defRankEne)
    if (multiplier === 0) {
      await addLog(`${enePokemon.name}에게는 효과가 없다…`)
    } else {
      // ── 추가: hit_event 기록 → 상대 화면에서도 깜빡임 트리거
      const hitTs = Date.now()
      await updateDoc(roomRef, { hit_event: { defender: enemySlot, ts: hitTs } })
      await triggerBlink("enemy")   // 공격자 화면은 로컬로 즉시
      await updateDoc(roomRef, { hit_event: null })   // 이벤트 정리

      enePokemon.hp = Math.max(0, enePokemon.hp - damage)
      updateHpBar("enemy-hp-bar", "enemy-active-hp", enePokemon.hp, enePokemon.maxHp, false)
      await wait(500)

      if (multiplier > 1) { await addLog("효과가 굉장했다!"); await wait(280) }
      if (multiplier < 1) { await addLog("효과가 별로인 듯하다…"); await wait(280) }
      if (critical)       { await addLog("급소에 맞았다!"); await wait(280) }
      const effectMsgs = applyMoveEffect(moveInfo?.effect, myPokemon, enePokemon)
      for (const msg of effectMsgs) { await addLog(msg); await wait(280) }
      if (enePokemon.hp <= 0) { await addLog(`${enePokemon.name}${josa(enePokemon.name, "은는")} 쓰러졌다!`); await wait(300) }
    }
  }

  const weatherResult = applyWeatherEffect(moveInfo?.effect)
  if (weatherResult.weather) { for (const msg of weatherResult.msgs) { await addLog(msg); await wait(280) } }

  const nextTurn = (freshData.turn_count ?? 1) + 1
  if (nextTurn % 2 === 0) {
    const { msgs: eotMsgs, anyFainted } = applyEndOfTurnDamage([myEntry, enemyEntry])
    for (const msg of eotMsgs) { await addLog(msg); await wait(280) }
    if (anyFainted) {
      if (isAllFainted(enemyEntry)) {
        await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, turn_count: nextTurn, game_over: true, winner: myName, current_turn: null, ...(weatherResult.weather ? { weather: weatherResult.weather } : {}) })
        await addLog(`${myName}의 승리!`); return
      } else if (isAllFainted(myEntry)) {
        await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, turn_count: nextTurn, game_over: true, winner: enemyName, current_turn: null, ...(weatherResult.weather ? { weather: weatherResult.weather } : {}) })
        await addLog(`${enemyName}의 승리!`); return
      }
    }
  }

  for (const msg of expiredMsgs) { await addLog(msg); await wait(250) }

  if (isAllFainted(enemyEntry)) {
    await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, turn_count: nextTurn, game_over: true, winner: myName, current_turn: null, ...(weatherResult.weather ? { weather: weatherResult.weather } : {}) })
    await addLog(`${myName}의 승리!`)
  } else if (isAllFainted(myEntry)) {
    await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, turn_count: nextTurn, game_over: true, winner: enemyName, current_turn: null, ...(weatherResult.weather ? { weather: weatherResult.weather } : {}) })
    await addLog(`${enemyName}의 승리!`)
  } else {
    await updateDoc(roomRef, { [`${mySlot}_entry`]: myEntry, [`${enemySlot}_entry`]: enemyEntry, current_turn: enemySlot, turn_count: nextTurn, ...(weatherResult.weather ? { weather: weatherResult.weather } : {}) })
  }
}
