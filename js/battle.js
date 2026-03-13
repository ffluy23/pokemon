import { 
  getFirestore, 
  doc, 
  getDoc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// 이미 초기화된 firebase 사용
const db = getFirestore();
const auth = getAuth();


// 현재 방 이름 (battleroom1.html → battleroom1)
const roomId = location.pathname
  .split("/")
  .pop()
  .replace(".html","");

const roomRef = doc(db,"rooms",roomId);


// users에서 hp 가져오기
async function getUserHP(uid){

  const userRef = doc(db,"users",uid);
  const userSnap = await getDoc(userRef);

  if(!userSnap.exists()) return null;

  return userSnap.data().entry[0].hp;
}


// 방에 hp 복사
async function setHP(){

  const user = auth.currentUser;
  if(!user) return;

  const uid = user.uid;

  const roomSnap = await getDoc(roomRef);
  const room = roomSnap.data();

  const hp = await getUserHP(uid);

  if(uid === room.player1_uid && room.player1_hp === null){

    await updateDoc(roomRef,{
      player1_hp: hp
    });

  }

  if(uid === room.player2_uid && room.player2_hp === null){

    await updateDoc(roomRef,{
      player2_hp: hp
    });

  }

}


// 화면 표시
onSnapshot(roomRef,(snapshot)=>{

  const data = snapshot.data();
  if(!data) return;

  document.getElementById("player1_name").innerText =
    data.player1_name ?? "Waiting";

  document.getElementById("player1_hp").innerText =
    data.player1_hp ?? "-";

  document.getElementById("player2_name").innerText =
    data.player2_name ?? "Waiting";

  document.getElementById("player2_hp").innerText =
    data.player2_hp ?? "-";

});


// 실행
setHP();
