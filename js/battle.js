import { db, auth } from "./firebase.js"
import {
doc,
onSnapshot,
updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

export function loadBattle(roomId){

const roomRef = doc(db,"room",roomId)

const p1Name = document.getElementById("p1_name")
const p2Name = document.getElementById("p2_name")
const turnDisplay = document.getElementById("turn_display")
const attackBtn = document.getElementById("attackBtn")

let myUid = auth.currentUser.uid

onSnapshot(roomRef,(snap)=>{

const data = snap.data()

p1Name.innerText = data.player1_name
p2Name.innerText = data.player2_name

// 현재 턴 표시
if(data.turn == data.player1_uid){
turnDisplay.innerText = data.player1_name + " 턴"
}else{
turnDisplay.innerText = data.player2_name + " 턴"
}

// 내 턴이면 공격 버튼 표시
if(data.turn == myUid){
attackBtn.style.display = "block"
}else{
attackBtn.style.display = "none"
}

})

attackBtn.onclick = async ()=>{

const snap = await roomRef.get()
const data = snap.data()

let nextTurn

if(data.turn == data.player1_uid){
nextTurn = data.player2_uid
}else{
nextTurn = data.player1_uid
}

// 턴 넘기기
await updateDoc(roomRef,{
turn: nextTurn
})

}

}
