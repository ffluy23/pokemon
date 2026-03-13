import { auth, db } from “./firebase.js”
import { onAuthStateChanged } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js”
import { doc, getDoc, updateDoc, onSnapshot } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js”
import { moves } from “./moves.js”

const roomRef = doc(db, “rooms”, ROOM_ID)
let mySlot = null
let myUid = null

onAuthStateChanged(auth, async (user) => {
if (!user) return
myUid = user.uid

const roomSnap = await getDoc(roomRef)
const room = roomSnap.data()
mySlot = room.player1_uid === myUid ? “p1” : “p2”

listenRoom()
})

function listenRoom() {
onSnapshot(roomRef, (snap) => {
const data = snap.data()
if (!data) return
if (!data.p1_entry || !data.p2_entry) return

```
const enemySlot = mySlot === "p1" ? "p2" : "p1"

document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

updateActiveUI(mySlot, data, "my")
updateActiveUI(enemySlot, data, "enemy")
updateBenchButtons(data)

// 기술 버튼: 내 현재 포켓몬 기술로 세팅
const myActiveIdx = data[`${mySlot}_active_idx`]
const myPokemon = data[`${mySlot}_entry`][myActiveIdx]
setupMoveButtons(myPokemon, data)
```

})
}

// 현재 싸우는 포켓몬 이름/HP 표시
function updateActiveUI(slot, data, prefix) {
const activeIdx = data[`${slot}_active_idx`]
const pokemon = data[`${slot}_entry`][activeIdx]
if (!pokemon) return

document.getElementById(`${prefix}-active-name`).innerText = pokemon.name
document.getElementById(`${prefix}-active-hp`).innerText =
`HP: ${pokemon.hp} / ${pokemon.maxHp}`
}

// 교체 버튼 렌더링
// 기절한 포켓몬은 비활성화 + “기절” 표시, 현재 싸우는 포켓몬은 숨김
function updateBenchButtons(data) {
const benchContainer = document.getElementById(“bench-container”)
benchContainer.innerHTML = “”

const myEntry = data[`${mySlot}_entry`]
const activeIdx = data[`${mySlot}_active_idx`]

myEntry.forEach((pkmn, idx) => {
if (idx === activeIdx) return  // 현재 싸우는 포켓몬은 표시 안 함

```
const btn = document.createElement("button")

if (pkmn.hp <= 0) {
  // 기절 상태: 비활성화 + "기절" 표시
  btn.innerText = `${pkmn.name} (기절)`
  btn.disabled = true
} else {
  btn.innerText = `${pkmn.name} (HP: ${pkmn.hp} / ${pkmn.maxHp})`
  btn.onclick = () => switchPokemon(idx)
}

benchContainer.appendChild(btn)
```

})
}

// 기술 버튼 4개 세팅
function setupMoveButtons(myPokemon, data) {
const moveNames = myPokemon?.moves ?? []

for (let i = 0; i < 4; i++) {
const btn = document.getElementById(`move-btn-${i}`)
if (!btn) continue

```
const moveName = moveNames[i]
if (!moveName) {
  btn.innerText = "-"
  btn.disabled = true
  continue
}

const move = moves[moveName]
if (!move) {
  btn.innerText = moveName
  btn.disabled = true
  continue
}

btn.innerText = `${moveName} [${move.type}]${move.priority ? " ★" : ""}`
btn.disabled = false
btn.onclick = () => useMove(moveName, data)
```

}
}

// 배틀 로그 추가
function addLog(msg) {
const log = document.getElementById(“battle-log”)
if (!log) return
const line = document.createElement(“p”)
line.innerText = msg
log.appendChild(line)
log.scrollTop = log.scrollHeight  // 자동 스크롤
}

// 기술 사용
async function useMove(moveName, data) {
const enemySlot = mySlot === “p1” ? “p2” : “p1”
const myActiveIdx = data[`${mySlot}_active_idx`]
const eneActiveIdx = data[`${enemySlot}_active_idx`]

const myEntry    = data[`${mySlot}_entry`].map(p => ({ …p }))
const enemyEntry = data[`${enemySlot}_entry`].map(p => ({ …p }))

const myPokemon  = myEntry[myActiveIdx]
const enePokemon = enemyEntry[eneActiveIdx]
const move       = moves[moveName]

// 선공 판정
// priority: true면 선공 무시하고 항상 먼저 행동
if (move.priority) {
addLog(`★ ${myPokemon.name}은(는) 재빠르게 선공했다!`)
} else {
const myRoll  = myPokemon.speed  + Math.floor(Math.random() * 10) + 1
const eneRoll = enePokemon.speed + Math.floor(Math.random() * 10) + 1
if (myRoll >= eneRoll) {
addLog(`${myPokemon.name}이(가) 선공!`)
} else {
addLog(`${enePokemon.name}이(가) 선공!`)
}
}

// 데미지 계산 (임시: 고정 40 - 상대 방어×5, 최솟값 1)
const damage = Math.max(1, 40 - (enePokemon.defense ?? 0) * 5)
enePokemon.hp = Math.max(0, enePokemon.hp - damage)

addLog(`${myPokemon.name}의 ${moveName}! → ${enePokemon.name}에게 ${damage} 데미지`)

if (enePokemon.hp <= 0) {
addLog(`${enePokemon.name}은(는) 쓰러졌다!`)
}

await updateDoc(roomRef, {
[`${enemySlot}_entry`]: enemyEntry
})
}

// 포켓몬 교체
async function switchPokemon(newIdx) {
await updateDoc(roomRef, {
[`${mySlot}_active_idx`]: newIdx
})
}
