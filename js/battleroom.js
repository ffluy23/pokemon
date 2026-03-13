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

const roomRef = doc(db,"rooms",ROOM_ID)

let mySlot=null
let myUid=null

onAuthStateChanged(auth, async (user)=>{

if(!user) return

myUid=user.uid

await joinRoom()

listenRoom()

setupButtons()

})

async function joinRoom(){

const userDoc = await getDoc(doc(db,"users",myUid))
const nickname=userDoc.data().nickname

const roomSnap = await getDoc(roomRef)
const room=roomSnap.data()

if(room.player1_uid === myUid){
mySlot="player1"
return
}

if(room.player2_uid === myUid){
mySlot="player2"
return
}

if(!room.player1_uid){

await updateDoc(roomRef,{
player1_uid:myUid,
player1_name:nickname
})

mySlot="player1"

}else if(!room.player2_uid){

await updateDoc(roomRef,{
player2_uid:myUid,
player2_name:nickname
})

mySlot="player2"

}

}

function listenRoom() {
  onSnapshot(roomRef, async (snap) => { // async 추가
    const room = snap.data();
    if (!room) return;

    // UI 업데이트 로직 (생략)
    document.getElementById("player1").innerText = "Player1: " + (room.player1_name ?? "대기...");
    document.getElementById("player2").innerText = "Player2: " + (room.player2_name ?? "대기...");

    // 양쪽 모두 레디했고, 아직 게임이 시작되지 않았을 때
    if (room.player1_ready && room.player2_ready && !room.game_started) {
      
      // 1. 각 유저의 entry 데이터를 가져오기
      const p1Doc = await getDoc(doc(db, "users", room.player1_uid));
      const p2Doc = await getDoc(doc(db, "users", room.player2_uid));

      const p1Entry = p1Doc.exists() ? p1Doc.data().entry : [];
      const p2Entry = p2Doc.exists() ? p2Doc.data().entry : [];

      // 2. 방 데이터에 유저 데이터 복사 및 게임 시작 처리
      await updateDoc(roomRef, {
        player1_entry: p1Entry, // 유저1의 entry 배열(map 포함) 통째로 복사
        player2_entry: p2Entry, // 유저2의 entry 배열(map 포함) 통째로 복사
        game_started: true
      });
    }

    // 게임 시작 시 페이지 이동
    if (room.game_started) {
      const roomNumber = ROOM_ID.replace("battleroom", "");
      location.href = `../games/battleroom${roomNumber}.html`;
    }
  });
}


function setupButtons(){

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

document.getElementById("leaveBtn").onclick=leaveRoom

}

async function leaveRoom(){

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
