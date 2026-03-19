// intro.js

import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

const BGM_LIST = [
  "https://stupid-turquoise-moc8mdlzqh.edgeone.app/PerituneMaterial_Rapid3.mp3",
  "https://glad-gold-vahxrzr1mi.edgeone.app/戦いの旅路を征く.mp3",
  "https://curly-indigo-f4dhznoudl.edgeone.app/PerituneMaterial_Rapid4.mp3"
]

const BG_LIST = [
  "https://foolish-rose-9l9aoow1vy.edgeone.app/배경1%20(1).jpg",
  "https://old-olive-m53ztzpdmh.edgeone.app/배경2%20(1).jpg",
  "https://driving-moccasin-bfvl5nk24u.edgeone.app/배경3%20(1).jpg",
  "https://yielding-green-qv9brnrm3e.edgeone.app/배경4.jpg",
  "https://tricky-gold-ws4fc7rxqb.edgeone.app/배경5.jpg",
  "https://geographical-black-tvekomtcvt.edgeone.app/배경6.jpg"
]

export let bgmAudio = null
let bgApplied = false

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

function applyBackground(url) {
  document.body.style.backgroundImage = `url('${url}')`
  document.body.style.backgroundSize = "cover"
  document.body.style.backgroundPosition = "center"
  document.body.style.backgroundRepeat = "no-repeat"
}

const overlay     = document.getElementById("intro-overlay")
const touchScreen = document.getElementById("touch-screen")
const readyStatus = document.getElementById("touch-ready-status")
const vsScreen    = document.getElementById("vs-screen")
const roomRef     = doc(db, "rooms", ROOM_ID)

const isSpectatorParam = new URLSearchParams(location.search).get("spectator") === "true"

let myUid     = null
let mySlot    = null
let touched   = false
let introDone = false   // 내 인트로 5초가 끝났는지
let bothReady = false   // 상대방도 ready인지

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  if (isSpectatorParam) {
    skipIntro()
    return
  }

  const snap = await getDoc(roomRef)
  const room = snap.data()
  mySlot = room?.player1_uid === myUid ? "p1" : "p2"

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
  // BGM — 터치 컨텍스트 안에서 재생
  const chosen = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)]
  bgmAudio = new Audio(chosen)
  bgmAudio.loop   = true
  bgmAudio.volume = 0.7
  bgmAudio.play().catch(() => {})

  const snap = await getDoc(roomRef)
  const room = snap.data()

  // 배경 처리
  if (!bgApplied) {
    if (mySlot === "p1") {
      const bgUrl = BG_LIST[Math.floor(Math.random() * BG_LIST.length)]
      await updateDoc(roomRef, { background: bgUrl })
      applyBackground(bgUrl)
      bgApplied = true
    } else if (room?.background) {
      applyBackground(room.background)
      bgApplied = true
    }
  }

  // VS 인트로 재생
  playVsIntro(room)

  // Firestore에 내 ready 마킹
  const field = mySlot === "p1" ? "intro_ready_p1" : "intro_ready_p2"
  await updateDoc(roomRef, { [field]: true })
}

function listenReady() {
  onSnapshot(roomRef, (snap) => {
    const room = snap.data()
    if (!room) return

    // p2가 터치 전 p1이 배경 저장했을 경우 대비
    if (room.background && !bgApplied) {
      bgApplied = true
      applyBackground(room.background)
    }

    const r1 = !!room.intro_ready_p1
    const r2 = !!room.intro_ready_p2
    bothReady = r1 && r2

    if (touched && (!r1 || !r2)) readyStatus.innerText = "상대방을 기다리는 중..."

    // 내 인트로가 끝난 상태에서 상대방 ready가 뒤늦게 도착한 경우
    if (bothReady && introDone) startBattle()
  })
}

async function playVsIntro(room) {
  document.getElementById("vs-name-left").textContent  = (room.player1_name ?? "PLAYER1").toUpperCase()
  document.getElementById("vs-name-right").textContent = (room.player2_name ?? "PLAYER2").toUpperCase()

  touchScreen.style.display = "none"
  vsScreen.classList.add("show")

  await wait(50)

  const flash      = document.getElementById("vs-flash")
  const burst      = document.getElementById("vs-burst")
  const vsLeft     = document.getElementById("vs-left")
  const vsRight    = document.getElementById("vs-right")
  const vsLabel    = document.getElementById("vs-label")
  const innerLeft  = document.getElementById("vs-inner-left")
  const innerRight = document.getElementById("vs-inner-right")

  flash.classList.add("show")
  await wait(100); vsLeft.classList.add("show")
  await wait(100); vsRight.classList.add("show")
  await wait(250)
  vsLabel.classList.add("show")
  flash.classList.add("show")
  burst.classList.add("show")
  vsScreen.classList.add("vs-shake")
  await wait(450)
  innerLeft.classList.add("drift-left")
  innerRight.classList.add("drift-right")

  // 5초 인트로 대기
  await wait(5000)
  introDone = true

  if (bothReady) {
    // 상대방도 이미 ready → 바로 배틀 시작
    startBattle()
  } else {
    // 상대방 아직 대기 중 → 희미하게 + 메시지 표시
    // listenReady의 onSnapshot이 상대 ready 감지하면 startBattle() 호출
    vsScreen.style.opacity = "0.3"
    readyStatus.style.cssText = "color:white; font-size:clamp(1rem,3vw,1.4rem); position:absolute; bottom:10vh; width:100%; text-align:center; z-index:10;"
    readyStatus.innerText = "상대방을 기다리는 중..."
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
