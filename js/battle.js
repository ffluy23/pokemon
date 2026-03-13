import { 
doc, 
getDoc, 
setDoc, 
updateDoc, 
onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

import { db } from "./firebase.js"


const roomId = "battleroom1"
const roomRef = doc(db,"rooms",roomId)



/* -------------------------
유저 entry 복사
------------------------- */

async function copyEntryToRoom(uid, playerSlot){

  const userRef = doc(db,"users",uid)
  const userSnap = await getDoc(userRef)

  const entry = userSnap.data().entry

  await updateDoc(roomRef,{
    [playerSlot+"_entry"]: entry
  })
}



/* -------------------------
UI 업데이트
------------------------- */

function renderBattle(data){

  document.getElementById("player1_name").innerText = data.player1_name
  document.getElementById("player2_name").innerText = data.player2_name


  const p1 = data.player1_entry
  const p2 = data.player2_entry


  // player1 active
  document.getElementById("p1_active_name").innerText = p1[0].name
  document.getElementById("p1_active_hp").innerText = "HP : " + p1[0].hp

  document.getElementById("p1_bench1").innerText =
    p1[1].name + " (" + p1[1].hp + ")"

  document.getElementById("p1_bench2").innerText =
    p1[2].name + " (" + p1[2].hp + ")"


  // player2 active
  document.getElementById("p2_active_name").innerText = p2[0].name
  document.getElementById("p2_active_hp").innerText = "HP : " + p2[0].hp

  document.getElementById("p2_bench1").innerText =
    p2[1].name + " (" + p2[1].hp + ")"

  document.getElementById("p2_bench2").innerText =
    p2[2].name + " (" + p2[2].hp + ")"
}



/* -------------------------
교체
------------------------- */

async function switchPokemon(player,index){

  const snap = await getDoc(roomRef)
  const data = snap.data()

  let entry = data[player+"_entry"]

  let temp = entry[0]
  entry[0] = entry[index]
  entry[index] = temp

  await updateDoc(roomRef,{
    [player+"_entry"]: entry
  })
}



/* -------------------------
버튼 이벤트
------------------------- */

document.getElementById("p1_bench1").onclick = ()=>{
  switchPokemon("player1",1)
}

document.getElementById("p1_bench2").onclick = ()=>{
  switchPokemon("player1",2)
}



/* -------------------------
실시간 업데이트
------------------------- */

onSnapshot(roomRef,(docSnap)=>{

  const data = docSnap.data()

  renderBattle(data)

})
