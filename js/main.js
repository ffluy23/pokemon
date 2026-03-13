import { auth, db } from "./firebase.js"

import {
signInWithEmailAndPassword,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"

import {
doc,
updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"


const loginBtn = document.getElementById("loginBtn")

if(loginBtn){

loginBtn.onclick = async () => {

const email = document.getElementById("email").value
const password = document.getElementById("password").value

await signInWithEmailAndPassword(auth,email,password)

location.href="main.html"

}

}

window.enterRoom = async function(roomNumber){

const user = auth.currentUser

await updateDoc(doc(db,"users",user.uid),{
room: roomNumber
})

location.href=`pages/battleroom${roomNumber}.html`

}
