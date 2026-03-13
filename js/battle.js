import { auth, db } from “./firebase.js”
import { onAuthStateChanged } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js”
import { doc, getDoc, updateDoc, onSnapshot } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js”

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
```

})
}

function updateActiveUI(slot, data, prefix) {
const activeIdx = data[`${slot}_active_idx`]
const pokemon = data[`${slot}_entry`][activeIdx]
if (!pokemon) return

document.getElementById(`${prefix}-active-name`).innerText = pokemon.name
document.getElementById(`${prefix}-active-hp`).innerText =
`HP: ${pokemon.hp} / ${pokemon.maxHp}`
}

function updateBenchButtons(data) {
const benchContainer = document.getElementById(“bench-container”)
benchContainer.innerHTML = “”

const myEntry = data[`${mySlot}_entry`]
const activeIdx = data[`${mySlot}_active_idx`]

myEntry.forEach((pkmn, idx) => {
if (idx === activeIdx) return

```
const btn = document.createElement("button")

if (pkmn.hp <= 0) {
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

async function switchPokemon(newIdx) {
await updateDoc(roomRef, {
[`${mySlot}_active_idx`]: newIdx
})
}
