import { auth, db } from “./firebase.js”
import { onAuthStateChanged } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js”
import { doc, getDoc, updateDoc, onSnapshot } from “https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js”

const roomRef = doc(db, “rooms”, ROOM_ID)
let mySlot = null
let myUid = null

onAuthStateChanged(auth, async (user) => {
if (!user) return
myUid = user.uid
await joinRoom()
listenRoom()
setupButtons()
})

async function joinRoom() {
const userDoc = await getDoc(doc(db, “users”, myUid))
const nickname = userDoc.data().nickname
const roomSnap = await getDoc(roomRef)
const room = roomSnap.data()

if (room.player1_uid === myUid) { mySlot = “player1”; return }
if (room.player2_uid === myUid) { mySlot = “player2”; return }

if (!room.player1_uid) {
await updateDoc(roomRef, { player1_uid: myUid, player1_name: nickname })
mySlot = “player1”
} else if (!room.player2_uid) {
await updateDoc(roomRef, { player2_uid: myUid, player2_name: nickname })
mySlot = “player2”
}
}

function listenRoom() {
onSnapshot(roomRef, async (snap) => {
const room = snap.data()

```
document.getElementById("player1").innerText = "Player1: " + (room.player1_name ?? "대기...")
document.getElementById("player2").innerText = "Player2: " + (room.player2_name ?? "대기...")

if (room.player1_ready && room.player2_ready && !room.game_started) {
  const firestoreSlot = mySlot === "player1" ? "p1" : "p2"
  const userSnap = await getDoc(doc(db, "users", myUid))
  const myEntry = userSnap.data()?.entry ?? []

  const myEntryWithMax = myEntry.map(pkmn => ({ ...pkmn, maxHp: pkmn.hp }))

  await updateDoc(roomRef, {
    [`${firestoreSlot}_entry`]: myEntryWithMax,
    [`${firestoreSlot}_active_idx`]: 0,
  })

  if (mySlot === "player1") {
    await updateDoc(roomRef, { game_started: true })
  }
}

if (room.game_started) {
  const roomNumber = ROOM_ID.replace("battleroom", "")
  location.href = `../games/battleroom${roomNumber}.html`
}
```

})
}

function setupButtons() {
document.getElementById(“readyBtn”).onclick = async () => {
if (mySlot === “player1”) await updateDoc(roomRef, { player1_ready: true })
if (mySlot === “player2”) await updateDoc(roomRef, { player2_ready: true })
}
document.getElementById(“leaveBtn”).onclick = leaveRoom
}

async function leaveRoom() {
if (mySlot === “player1”) {
await updateDoc(roomRef, { player1_uid: null, player1_name: null, player1_ready: false })
}
if (mySlot === “player2”) {
await updateDoc(roomRef, { player2_uid: null, player2_name: null, player2_ready: false })
}
location.href = “../main.html”
}
