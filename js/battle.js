import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
import {
getFirestore,
doc,
getDoc,
updateDoc,
onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const firebaseConfig = {
  // firebase config
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

let roomRef
let myPlayer = "player1"   // 테스트용

export async function loadBattle(roomId){

roomRef = doc(db,"battleroom",roomId)

await initBattle()

const attackBtn = document.getElementById("attackBtn")
attackBtn.onclick = attack

onSnapshot(roomRef,(snap)=>{

const data = snap.data()

document.getElementById("p1_name").innerText = data.player1_name
document.getElementById("p2_name").innerText = data.player2_name

document.getElementById("p1_hp").innerText = data.player1_hp
document.getElementById("p2_hp").innerText = data.player2_hp

document.getElementById("turnText").innerText = "현재 턴 : " + data.turn

if(data.turn === myPlayer){
attackBtn.disabled = false
}else{
attackBtn.disabled = true
}

})

}

async function initBattle(){

const snap = await getDoc(roomRef)
const data = snap.data()

if(data.player1_hp && data.player2_hp) return

const p1Ref = doc(db,"users",data.player1_uid)
const p2Ref = doc(db,"users",data.player2_uid)

const p1Snap = await getDoc(p1Ref)
const p2Snap = await getDoc(p2Ref)

const p1hp = p1Snap.data().entry[0].hp
const p2hp = p2Snap.data().entry[0].hp

await updateDoc(roomRef,{
player1_hp:p1hp,
player2_hp:p2hp,
turn:"player1"
})

}

async function attack(){

const snap = await getDoc(roomRef)
const data = snap.data()

if(data.turn !== myPlayer) return

let damage = Math.floor(Math.random()*10)+5

let updateData = {}

if(myPlayer === "player1"){

updateData.player2_hp = data.player2_hp - damage
updateData.turn = "player2"

}else{

updateData.player1_hp = data.player1_hp - damage
updateData.turn = "player1"

}

await updateDoc(roomRef,updateData)

}
