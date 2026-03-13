import { auth, db } from "./firebase.js"
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db, "rooms", ROOM_ID)
let mySlot = null
let myUid = null

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  mySlot = room.player1_uid === myUid ? "p1" : "p2"

  setupControls()
  listenRoom()
})

function listenRoom() {
  onSnapshot(roomRef, (snap) => {
    const data = snap.data()
    if (!data) return
    if (!data.p1_entry || !data.p2_entry) return

    const enemySlot = mySlot === "p1" ? "p2" : "p1"

    // 플레이어 이름
    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

    // 내 포켓몬 / 상대 포켓몬 UI
    updateActiveUI(mySlot, data, "my")
    updateActiveUI(enemySlot, data, "enemy")

    // 교체 버튼
    updateBenchButtons(data)
  })
}

// 현재 싸우는 포켓몬 이름/HP 표시
function updateActiveUI(slot, data, prefix) {
  const activeIdx = data[`${slot}_active_idx`]
  const pokemon = data[`${slot}_entry`][activeIdx]
  if (!pokemon) return

  document.getElementById(`${prefix}-active-name`).innerText = pokemon.name
  document.getElementById(`${prefix}-active-hp`).innerText = `HP: ${pokemon.hp} / 100`
}

// 교체 버튼 렌더링 (동적 생성)
function updateBenchButtons(data) {
  const benchContainer = document.getElementById("bench-container")
  benchContainer.innerHTML = ""

  const myEntry = data[`${mySlot}_entry`]
  const activeIdx = data[`${mySlot}_active_idx`]

  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return  // 현재 싸우는 포켓몬 제외
    if (pkmn.hp <= 0) return       // 기절한 포켓몬 제외

    const btn = document.createElement("button")
    btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`
    btn.onclick = () => switchPokemon(idx)
    benchContainer.appendChild(btn)
  })
}

// 교체 실행
async function switchPokemon(newIdx) {
  await updateDoc(roomRef, {
    [`${mySlot}_active_idx`]: newIdx
  })
}

function setupControls() {
  const enemySlot = mySlot === "p1" ? "p2" : "p1"

  document.getElementById("attackBtn").onclick = async () => {
    const snap = await getDoc(roomRef)
    const data = snap.data()

    const enemyEntry = [...data[`${enemySlot}_entry`]]
    const enemyActiveIdx = data[`${enemySlot}_active_idx`]

    enemyEntry[enemyActiveIdx] = {
      ...enemyEntry[enemyActiveIdx],
      hp: Math.max(0, enemyEntry[enemyActiveIdx].hp - 20)
    }

    await updateDoc(roomRef, {
      [`${enemySlot}_entry`]: enemyEntry
    })
  }
}
