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
let introStarted = false

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
  // 터치 컨텍스트 안에서 BGM 재생 → 크롬 자동재생 정책 우회
  const chosen = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)]
  bgmAudio = new Audio(chosen)
  bgmAudio.loop   = true
  bgmAudio.volume = 0.7
  bgmAudio.play().catch(() => {})

  // Firestore에 내 ready 마킹
  const snap  = await getDoc(roomRef)
  const room  = snap.data()
  const field = room?.player1_uid === myUid ? "intro_ready_p1" : "intro_ready_p2"
  await updateDoc(roomRef, { [field]: true })
}

function listenReady() {
  onSnapshot(roomRef, async (snap) => {
    const room = snap.data()
    if (!room) return

    const r1 = !!room.intro_ready_p1
    const r2 = !!room.intro_ready_p2

    // 상태 텍스트
    if      (!r1 && !r2) readyStatus.innerText = ""
    else if (!r1 || !r2) readyStatus.innerText = "상대방을 기다리는 중..."

    // 둘 다 ready → VS 인트로 재생 (각 클라이언트에서 독립 실행)
    if (r1 && r2 && !introStarted) {
      introStarted = true
      playVsIntro(room)
    }
  })
}

async function playVsIntro(room) {
  // 이름 세팅
  const p1 = (room.player1_name ?? "PLAYER1").toUpperCase()
  const p2 = (room.player2_name ?? "PLAYER2").toUpperCase()
  document.getElementById("vs-name-left").textContent  = p1
  document.getElementById("vs-name-right").textContent = p2

  // 터치 화면 숨기고 VS 인트로 표시
  touchScreen.style.display = "none"
  vsIntro.classList.add("show")

  // ── 한 프레임 기다린 뒤 애니메이션 시작 (display:none → block 직후 바로 class 추가하면 transition 무시됨)
  await wait(50)

  const flash      = document.getElementById("vs-flash")
  const burst      = document.getElementById("vs-burst")
  const vsLeft     = document.getElementById("vs-left")
  const vsRight    = document.getElementById("vs-right")
  const vsText     = document.getElementById("vs-text")
  const innerLeft  = document.getElementById("vs-inner-left")
  const innerRight = document.getElementById("vs-inner-right")

  // 원본 intro.html 타이밍 그대로
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

  // 5초 후 배틀로 전환
  await wait(5000)
  endIntro()
}

function endIntro() {
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
