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



/* -----------------------------
users entry → rooms 복사
----------------------------- */

export async function copyEntry(uid, playerSlot){

 const userRef = doc(db,"users",uid)
 const userSnap = await getDoc(userRef)

 const entryMap = userSnap.data().entry

 // map → array 변환
 const entry = Object.values(entryMap)

 await setDoc(roomRef,{
  [playerSlot+"_entry"]: entry
 },{merge:true})

}



/* -----------------------------
UI 렌더링
----------------------------- */

function render(data){

 if(!data) return

 const p1 = data.player1_entry
 const p2 = data.player2_entry

 if(p1){

  document.getElementById("player1_name").innerText = data.player1_name

  document.getElementById("p1_active_name").innerText = p1[0].name
  document.getElementById("p1_active_hp").innerText = "HP: "+p1[0].hp

  document.getElementById("p1_bench1").innerText =
   p1[1].name+" ("+p1[1].hp+")"

  document.getElementById("p1_bench2").innerText =
   p1[2].name+" ("+p1[2].hp+")"
 }

 if(p2){

  document.getElementById("player2_name").innerText = data.player2_name

  document.getElementById("p2_active_name").innerText = p2[0].name
  document.getElementById("p2_active_hp").innerText = "HP: "+p2[0].hp

  document.getElementById("p2_bench1").innerText =
   p2[1].name+" ("+p2[1].hp+")"

  document.getElementById("p2_bench2").innerText =
   p2[2].name+" ("+p2[2].hp+")"
 }

}



/* -----------------------------
포켓몬 교체
----------------------------- */

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



/* -----------------------------
데미지
----------------------------- */

export async function damage(player, amount){

 const snap = await getDoc(roomRef)
 const data = snap.data()

 let entry = data[player+"_entry"]

 entry[0].hp -= amount

 if(entry[0].hp < 0) entry[0].hp = 0

 await updateDoc(roomRef,{
  [player+"_entry"]: entry
 })

}



/* -----------------------------
버튼 이벤트
----------------------------- */

function bindButtons(){

 const b1 = document.getElementById("p1_bench1")
 const b2 = document.getElementById("p1_bench2")

 if(b1) b1.onclick = ()=>switchPokemon("player1",1)
 if(b2) b2.onclick = ()=>switchPokemon("player1",2)

 const b3 = document.getElementById("p2_bench1")
 const b4 = document.getElementById("p2_bench2")

 if(b3) b3.onclick = ()=>switchPokemon("player2",1)
 if(b4) b4.onclick = ()=>switchPokemon("player2",2)

}



/* -----------------------------
실시간 업데이트
----------------------------- */

onSnapshot(roomRef,(snap)=>{

 const data = snap.data()

 render(data)

})



/* -----------------------------
초기 실행
----------------------------- */

bindButtons()
