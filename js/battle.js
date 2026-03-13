import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// 🔹 Firebase 설정 (자기 config 넣기)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_ID",
  appId: "YOUR_APP_ID"
};


// 🔹 Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// 🔹 현재 battleroom 이름 가져오기
// battleroom1.html → battleroom1
const roomId = location.pathname
  .split("/")
  .pop()
  .replace(".html", "");


// 🔹 rooms 문서 참조
const roomRef = doc(db, "rooms", roomId);


// 🔹 Firestore 데이터 실시간 감지
onSnapshot(roomRef, (snapshot) => {

  const data = snapshot.data();

  if (!data) return;

  // player1
  document.getElementById("player1_name").innerText =
    data.player1_name ?? "Waiting...";

  document.getElementById("player1_hp").innerText =
    data.player1_hp ?? "-";


  // player2
  document.getElementById("player2_name").innerText =
    data.player2_name ?? "Waiting...";

  document.getElementById("player2_hp").innerText =
    data.player2_hp ?? "-";

});
