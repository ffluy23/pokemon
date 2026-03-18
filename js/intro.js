// intro.js

import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const BGM_LIST = [
  "https://stupid-turquoise-moc8mdlzqh.edgeone.app/PerituneMaterial_Rapid3.mp3",
  "https://glad-gold-vahxrzr1mi.edgeone.app/戦いの旅路を征く.mp3",
  "https://curly-indigo-f4dhznoudl.edgeone.app/PerituneMaterial_Rapid4.mp3"
]

export let bgmAudio = null

export function fadeBgmOut(duration = 2000) {
  if (!bgmAudio) return
  const step = bgmAudio.volume / (duration / 50)
  const timer = setInterval(() => {
    if (bgmAudio.volume > step) {
      bgmAudio.volume = Math.max(0, bgmAudio.volume - step)
    } else {
      bgmAudio.volume = 0
      bgmAudio.pause()
      clearInterval(timer)
    }
  }, 50)
}

const overlay     = document.getElementById("intro-overlay")
const touchScreen = document.getElementById("touch-screen")
const readyStatus = document.getElementById("touch-ready-status")
const vsIntro     = document.getElementById("vs-intro")
const roomRef     = doc(db, "rooms", ROOM_ID)

let myUid        = null
let touched      = false
let introDone    = false   // 인트로 5초 연출이 끝났는지
let bothReady    = false   // 상대방도 ready인지

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  const roomSnap = await getDoc(roomRef)
  const room = roomSnap.data()
  const isPlayer = room?.player1_uid === myUid || room?.player2_uid === myUid

  if (!isPlayer) {
    skipIntro()
    return
  }

  bindTouch()
  listenReady()
})

function bindTouch() {
  const handler = () => {
    if (touched) return
    touched = true
    document.removeEventListener("click",      handler)
    document.removeEventListener("touchstart", handler)
    onTouched()
  }
  document.addEventListener("click",      handler)
  document.addEventListener("touchstart", handler)
}

async function onTouched() {
  // 1) BGM — 터치 컨텍스트 안에서 즉시 재생
  const chosen = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)]
  bgmAudio = new Audio(chosen)
  bgmAudio.loop   = true
  bgmAudio.volume = 0.7
  bgmAudio.play().catch(() => {})

  // 2) VS 인트로 즉시 재생
  const snap = await getDoc(roomRef)
  const room = snap.data()
  playVsIntro(room)   // await 안 함 — 인트로 재생하면서 아래도 동시에 진행

  // 3) Firestore에 내 ready 마킹
  const field = room?.player1_uid === myUid ? "intro_ready_p1" : "intro_ready_p2"
  await updateDoc(roomRef, { [field]: true })
}

// 상대방 ready 감지 (인트로 끝난 후 배틀 시작 타이밍에 사용)
function listenReady() {
  onSnapshot(roomRef, (snap) => {
    const room = snap.data()
    if (!room) return

    const r1 = !!room.intro_ready_p1
    const r2 = !!room.intro_ready_p2

    bothReady = r1 && r2

    // 인트로 연출이 이미 끝난 상태에서 상대방 ready 도착 → 바로 배틀 시작
    if (bothReady && introDone) {
      startBattle()
    }
  })
}

async function playVsIntro(room) {
  const p1 = (room.player1_name ?? "PLAYER1").toUpperCase()
  const p2 = (room.player2_name ?? "PLAYER2").toUpperCase()
  document.getElementById("vs-name-left").textContent  = p1
  document.getElementById("vs-name-right").textContent = p2

  touchScreen.style.display = "none"
  vsIntro.classList.add("show")

  // display 전환 후 한 프레임 대기 (애니메이션 트리거용)
  await wait(50)

  const flash      = document.getElementById("vs-flash")
  const burst      = document.getElementById("vs-burst")
  const vsLeft     = document.getElementById("vs-left")
  const vsRight    = document.getElementById("vs-right")
  const vsText     = document.getElementById("vs-text")
  const innerLeft  = document.getElementById("vs-inner-left")
  const innerRight = document.getElementById("vs-inner-right")

  flash.classList.add("show")
  await wait(100); vsLeft.classList.add("show")
  await wait(100); vsRight.classList.add("show")
  await wait(250)
  vsText.classList.add("show")
  flash.classList.add("show")
  burst.classList.add("show")
  vsIntro.classList.add("vs-shake")
  await wait(450)
  innerLeft.classList.add("drift-left")
  innerRight.classList.add("drift-right")

  // 5초 연출 대기
  await wait(5000)
  introDone = true

  // 이미 상대방도 ready → 바로 배틀 시작
  if (bothReady) {
    startBattle()
  } else {
    // 상대방 아직 안 눌렀음 → 대기 메시지 표시
    vsIntro.style.opacity = "0.3"
    readyStatus.style.color = "white"
    readyStatus.style.fontSize = "clamp(1rem, 3vw, 1.4rem)"
    readyStatus.style.position = "absolute"
    readyStatus.style.bottom = "10vh"
    readyStatus.style.width = "100%"
    readyStatus.style.textAlign = "center"
    readyStatus.innerText = "상대방을 기다리는 중..."
    // listenReady의 onSnapshot이 상대 ready 감지하면 startBattle() 호출
  }
}

function startBattle() {
  if (overlay.classList.contains("fade-out")) return  // 중복 방지
  overlay.classList.add("fade-out")
  document.getElementById("battle-screen").classList.add("visible")
  setTimeout(() => {
    overlay.classList.add("hidden")
    updateDoc(roomRef, { intro_ready_p1: false, intro_ready_p2: false }).catch(() => {})
  }, 800)
}

function skipIntro() {
  overlay.classList.add("hidden")
  document.getElementById("battle-screen").classList.add("visible")
}
