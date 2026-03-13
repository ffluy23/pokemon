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

    // battleroom.js에서 복사 완료될 때까지 대기
    if (!data.p1_entry || !data.p2_entry) return

    document.getElementById("p1-name").innerText = data.player1_name ?? "대기..."
    document.getElementById("p2-name").innerText = data.player2_name ?? "대기..."

    updatePokemonUI("p1", data)
    updatePokemonUI("p2", data)
    updateBenchButtons(data)
  })
}

function updatePokemonUI(slot, data) {
  const activeIdx = data[`${slot}_active_idx`]
  const activePokemon = data[`${slot}_entry`][activeIdx]
  if (!activePokemon) return

  document.getElementById(`${slot}-active-name`).innerText = activePokemon.name
  document.getElementById(`${slot}-active-hp`).innerText = `${activePokemon.hp} / 100`
}

function updateBenchButtons(data) {
  const myEntry = data[`${mySlot}_entry`]
  const activeIdx = data[`${mySlot}_active_idx`]

  let btnCount = 0
  myEntry.forEach((pkmn, idx) => {
    if (idx === activeIdx) return

    const btn = document.getElementById(`bench-btn-${btnCount}`)
    if (btn) {
      btn.style.display = "inline-block"
      btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`
      btn.onclick = () => switchPokemon(idx)
    }
    btnCount++
  })
}

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
