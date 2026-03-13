import { db, auth } from "./firebase.js"

import {
doc,
onSnapshot,
getDoc,
updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

import {
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"

const roomRef = doc(db,"rooms",ROOM_ID)

let mySlot=null
let myPrefix=null
let enemyPrefix=null



onAuthStateChanged(auth, async (user)=>{

if(!user) return

const snap = await getDoc(roomRef)
const room = snap.data()

if(room.player1_uid === user.uid){

mySlot="player1"
myPrefix="p1"
enemyPrefix="p2"

}else{

mySlot="player2"
myPrefix="p2"
enemyPrefix="p1"

}

setupControls()

listenBattle()

})



function listenBattle(){

onSnapshot(roomRef,(snap)=>{

const room=snap.data()
if(!room) return

updatePlayerUI("player1",room)
updatePlayerUI("player2",room)

})

}



function updatePlayerUI(slot,room){

const prefix = slot==="player1" ? "p1" : "p2"

const entry = room[`${prefix}_entry`]
const idx = room[`${prefix}_active_idx`] ?? 0

if(!entry) return

const active = entry[idx]

document.getElementById(`${slot}_name`).innerText =
room[`${slot}_name`] ?? "대기..."

document.getElementById(`${slot}_active_name`).innerText =
active.name

document.getElementById(`${slot}_hp`).innerText =
active.hp



// 벤치 표시

const benchArea=document.getElementById(`${prefix}-bench`)
benchArea.innerHTML=""

entry.forEach((p,i)=>{

if(i===idx) return

const div=document.createElement("div")
div.innerText=p.name+" ("+p.hp+")"

benchArea.appendChild(div)

})

}



function setupControls(){

document.getElementById("attackBtn").onclick=attack

}



async function attack(){

const snap = await getDoc(roomRef)
const room = snap.data()

const enemyEntry = JSON.parse(
JSON.stringify(room[`${enemyPrefix}_entry`])
)

const enemyIdx = room[`${enemyPrefix}_active_idx`]

enemyEntry[enemyIdx].hp -= 20

if(enemyEntry[enemyIdx].hp < 0){
enemyEntry[enemyIdx].hp = 0
}

await updateDoc(roomRef,{
[`${enemyPrefix}_entry`]:enemyEntry
})

}



export async function switchPokemon(newIdx){

await updateDoc(roomRef,{
[`${myPrefix}_active_idx`]:newIdx
})

}
