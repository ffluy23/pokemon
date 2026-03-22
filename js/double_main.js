// js/double_main.js
import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  doc, updateDoc,
  collection, getDocs, orderBy, query, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

// ── 방 입장
window.enterRoom = async function(roomNumber) {
  const user = auth.currentUser
  await updateDoc(doc(db, "users", user.uid), { room: roomNumber })
  location.href = `double/doublebattleroom${roomNumber}.html`
}

// ── 게임 기록 불러오기
// double/doublebattleroom1~3 각 방의 games 서브컬렉션에서 최근 20개씩
async function loadGameLogs() {
  const list  = document.getElementById("game-log-list")
  const empty = document.getElementById("game-log-empty")
  const rooms = ["doublebattleroom1", "doublebattleroom2", "doublebattleroom3"]
  const allGames = []

  for (const roomId of rooms) {
    try {
      const gamesRef = collection(db, "double", roomId, "games")
      const q = query(gamesRef, orderBy("createdAt", "desc"), limit(20))
      const snap = await getDocs(q)
      snap.forEach(d => allGames.push({ roomId, gameId: d.id, ...d.data() }))
    } catch (e) {
      // 해당 방에 games 없으면 스킵
    }
  }

  allGames.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

  if (allGames.length === 0) {
    if (empty) empty.innerText = "아직 게임 기록 없음"
    return
  }

  list.innerHTML = ""
  allGames.forEach(game => {
    // 더블배틀: p1+p2 (팀A) vs p3+p4 (팀B) 표시
    const teamA  = [game.p1, game.p2].filter(Boolean).join(" & ") || "???"
    const teamB  = [game.p3, game.p4].filter(Boolean).join(" & ") || "???"
    const date   = game.createdAt
      ? new Date(game.createdAt).toLocaleString("ko-KR", {
          month: "numeric", day: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : ""
    const winner = game.winner ?? null

    const item = document.createElement("div")
    item.className = "game-log-item"
    item.innerHTML = `
      <span class="game-log-vs">
        🔵 ${teamA} vs 🔴 ${teamB}
        ${winner ? `　<span style="color:#fbb917;font-size:11px;">🏆 ${winner}</span>` : ""}
      </span>
      <span class="game-log-meta">${game.roomId} · ${date}</span>
    `
    item.onclick = () => openLogModal(game)
    list.appendChild(item)
  })
}

// ── 로그 모달 열기
function openLogModal(game) {
  const modal = document.getElementById("log-modal")
  const title = document.getElementById("log-modal-title")
  const body  = document.getElementById("log-modal-body")

  const teamA = [game.p1, game.p2].filter(Boolean).join(" & ") || "???"
  const teamB = [game.p3, game.p4].filter(Boolean).join(" & ") || "???"
  title.innerText = `${teamA} vs ${teamB}`
  body.innerHTML  = ""

  const logs = (game.logs ?? []).slice().sort((a, b) => a.ts - b.ts)
  if (logs.length === 0) {
    body.innerHTML = "<p style='color:#555'>로그 없음</p>"
  } else {
    logs.forEach(l => {
      const p = document.createElement("p")
      p.textContent = l.text
      body.appendChild(p)
    })
  }
  modal.classList.add("open")
}

// ── 모달 닫기
const closeBtn = document.getElementById("log-modal-close")
const logModal = document.getElementById("log-modal")
if (closeBtn) closeBtn.onclick = () => logModal.classList.remove("open")
if (logModal) logModal.onclick = e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open") }

// ── 로그인 상태 확인 후 로드
onAuthStateChanged(auth, user => {
  if (user) loadGameLogs()
})
