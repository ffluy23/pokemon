import { auth, db } from "./firebase.js"

import {
doc,
getDoc,
updateDoc,
onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const roomRef = doc(db,"rooms",ROOM_ID)

let mySlot=null

async function joinRoom(){

const user = auth.currentUser

const userDoc = await getDoc(doc(db,"users",user.uid))
const nickname = userDoc.data().nickname

const roomSnap = await getDoc(roomRef)
const room = roomSnap.data()

if(!room.player1_uid){

await updateDoc(roomRef,{
player1_uid:user.uid,
player1_name:nickname
})

mySlot="player1"

}else if(!room.player2_uid){

await updateDoc(roomRef,{
player2_uid:user.uid,
player2_name:nickname
})

mySlot="player2"

}

}

joinRoom()

onSnapshot(roomRef,(snap)=>{

const room=snap.data()

document.getElementById("player1").innerText =
"Player1: "+(room.player1_name ?? "대기...")

document.getElementById("player2").innerText =
"Player2: "+(room.player2_name ?? "대기...")

if(room.player1_ready && room.player2_ready && !room.game_started){

updateDoc(roomRef,{
game_started:true
})

}

if(room.game_started){

const roomNumber=ROOM_ID.replace("battleroom","")

location.href=`../games/battleroom${roomNumber}.html`

}

})

document.getElementById("readyBtn").onclick=async()=>{

if(mySlot==="player1"){

await updateDoc(roomRef,{
player1_ready:true
})

}

if(mySlot==="player2"){

await updateDoc(roomRef,{
player2_ready:true
})

}

}

document.getElementById("leaveBtn").onclick=async()=>{

const user = auth.currentUser

if(mySlot==="player1"){

await updateDoc(roomRef,{
player1_uid:null,
player1_name:null,
player1_ready:false
})

}

if(mySlot==="player2"){

await updateDoc(roomRef,{
player2_uid:null,
player2_name:null,
player2_ready:false
})

}

location.href="../main.html"

}
