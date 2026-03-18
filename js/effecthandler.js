// effecthandler.js
//
// 상태이상 (status): 포켓몬에 하나만 존재 가능, 상태이상끼리 중첩 불가
//   - "poison"    독
//   - "burn"      화상
//   - "paralysis" 마비
//   - "frozen"    얼음
//
// 상태변화 (volatile): 포켓몬에 하나만 존재 가능, 상태변화끼리 중첩 불가
//   - confusion   혼란 (pokemon.confusion = 남은 턴 수)
//   - flinch      풀죽음 (pokemon.flinch = true)
//
// 상태이상 + 상태변화는 동시에 존재 가능
//
// 날씨 (weather): room 단위로 존재
//   - "쾌청" / "비" / "모래바람" / "싸라기눈"
//   - 구현은 기반 구조만 제공 (실제 날씨 효과는 추후 추가)

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

export function statusName(status) {
  const map = {
    poison:    "독",
    burn:      "화상",
    paralysis: "마비",
    frozen:    "얼음",
  }
  return map[status] ?? status
}

export function josa(word, type) {
  if (!word) return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xAC00 || code > 0xD7A3) {
    return type === "은는" ? "은" : type === "이가" ? "이" : type === "을를" ? "을" : type === "과와" ? "과" : "으로"
  }
  const hasFinal = (code - 0xAC00) % 28 !== 0
  if (type === "은는") return hasFinal ? "은" : "는"
  if (type === "이가") return hasFinal ? "이" : "가"
  if (type === "을를") return hasFinal ? "을" : "를"
  if (type === "과와") return hasFinal ? "과" : "와"
  if (type === "으로") return hasFinal ? "으로" : "로"
  return ""
}

// ──────────────────────────────────────────────
// 상태이상 부여
// 상태이상은 중첩 불가 (이미 있으면 부여 안 됨)
// 반환: 로그 메시지 배열
// ──────────────────────────────────────────────
export function applyStatus(pokemon, status) {
  if (pokemon.status) return []  // 이미 상태이상 있음
  if (pokemon.hp <= 0) return [] // 기절 포켓몬에게 부여 불가
  pokemon.status = status
  return [`${pokemon.name}${josa(pokemon.name, "은는")} ${statusName(status)} 상태가 됐다!`]
}

// ──────────────────────────────────────────────
// 상태변화 부여
// 상태변화는 중첩 불가 (이미 있으면 부여 안 됨)
// volatile: "혼란" | "풀죽음"
// 반환: 로그 메시지 배열
// ──────────────────────────────────────────────
export function applyVolatile(pokemon, volatile) {
  if (pokemon.hp <= 0) return []

  if (volatile === "혼란") {
    if ((pokemon.confusion ?? 0) > 0) return [] // 이미 혼란 상태
    pokemon.confusion = Math.floor(Math.random() * 3) + 1 // 1~3턴
    return [`${pokemon.name}${josa(pokemon.name, "은는")} 혼란에 빠졌다!`]
  }

  if (volatile === "풀죽음") {
    if (pokemon.flinch) return [] // 이미 풀죽음 상태
    pokemon.flinch = true
    return [`${pokemon.name}${josa(pokemon.name, "은는")} 풀이 죽었다!`]
  }

  return []
}

// ──────────────────────────────────────────────
// 부가효과 적용 (기술 명중 후 호출)
// moveEffect: moves.js의 effect 필드
// 상태이상과 상태변화 독립적으로 판정
// 반환: 로그 메시지 배열
// ──────────────────────────────────────────────
export function applyMoveEffect(moveEffect, attacker, defender) {
  if (!moveEffect) return []
  if (defender.hp <= 0) return []

  const msgs = []

  // 상태이상 부여 (독립 확률 판정)
  if (moveEffect.status && Math.random() < moveEffect.chance) {
    msgs.push(...applyStatus(defender, moveEffect.status))
  }

  // 상태변화 부여 (독립 확률 판정)
  if (moveEffect.volatile && Math.random() < moveEffect.chance) {
    msgs.push(...applyVolatile(defender, moveEffect.volatile))
  }

  return msgs
}

// ──────────────────────────────────────────────
// 행동 전 상태이상/상태변화 체크
// 행동 불가 여부 반환
// result: { blocked: bool, msgs: string[], statusCleared: bool }
// ──────────────────────────────────────────────
export function checkPreActionStatus(pokemon) {
  const msgs = []

  // ── 풀죽음 (최우선)
  if (pokemon.flinch) {
    pokemon.flinch = false
    msgs.push(`${pokemon.name}${josa(pokemon.name, "은는")} 풀이 죽어서 움직일 수 없다!`)
    return { blocked: true, msgs, statusCleared: false }
  }

  // ── 마비 (25% 행동 불가)
  if (pokemon.status === "paralysis") {
    if (Math.random() < 0.25) {
      msgs.push(`${pokemon.name}${josa(pokemon.name, "은는")} 마비 때문에 움직일 수 없다!`)
      return { blocked: true, msgs, statusCleared: false }
    }
  }

  // ── 얼음 (20% 해제, 해제 시 행동 가능 / 미해제 시 행동 불가)
  if (pokemon.status === "frozen") {
    if (Math.random() < 0.20) {
      pokemon.status = null
      msgs.push(`${pokemon.name}${josa(pokemon.name, "은는")} 얼음 상태에서 회복됐다!`)
      // 해제 시 행동 가능 → blocked: false로 흘러내림
      return { blocked: false, msgs, statusCleared: true }
    } else {
      msgs.push(`${pokemon.name}${josa(pokemon.name, "은는")} 꽁꽁 얼어서 움직일 수 없다!`)
      return { blocked: true, msgs, statusCleared: false }
    }
  }

  return { blocked: false, msgs, statusCleared: false }
}

// ──────────────────────────────────────────────
// 혼란 체크 (행동 전, 상태이상 체크 이후 호출)
// 자해 시 기술 취소
// result: { selfHit: bool, damage: number, msgs: string[], fainted: bool }
// ──────────────────────────────────────────────
export function checkConfusion(pokemon) {
  // 혼란 없으면 패스
  if ((pokemon.confusion ?? 0) <= 0) {
    pokemon.confusion = 0
    return { selfHit: false, damage: 0, msgs: [], fainted: false }
  }

  // 혼란 턴 차감
  pokemon.confusion--

  // 혼란 해제됐으면 패스
  if (pokemon.confusion <= 0) {
    pokemon.confusion = 0
    return { selfHit: false, damage: 0, msgs: [], fainted: false }
  }

  // 33.3% 확률로 자해
  if (Math.random() < 1 / 3) {
    const damage = (pokemon.attack ?? 3) * 2
    pokemon.hp = Math.max(0, pokemon.hp - damage)
    const msgs = [`${pokemon.name}${josa(pokemon.name, "은는")} 혼란으로 자기 자신을 공격했다! (${damage} 데미지)`]
    const fainted = pokemon.hp <= 0
    if (fainted) msgs.push(`${pokemon.name}${josa(pokemon.name, "은는")} 쓰러졌다!`)
    return { selfHit: true, damage, msgs, fainted }
  }

  return { selfHit: false, damage: 0, msgs: [], fainted: false }
}

// ──────────────────────────────────────────────
// 턴 종료 시 독/화상 데미지
// 양측 행동이 모두 끝난 라운드 종료 시 호출
// entries: [myEntry, enemyEntry] 형태로 전달
// 반환: { msgs: string[], anyFainted: bool }
// ──────────────────────────────────────────────
export function applyEndOfTurnDamage(entries) {
  const msgs = []
  let anyFainted = false

  for (const entry of entries) {
    for (const pkmn of entry) {
      if (pkmn.hp <= 0) continue
      if (pkmn.status !== "poison" && pkmn.status !== "burn") continue

      const dmg = Math.max(1, Math.floor((pkmn.maxHp ?? pkmn.hp) / 16))
      pkmn.hp = Math.max(0, pkmn.hp - dmg)
      msgs.push(`${pkmn.name}${josa(pkmn.name, "은는")} ${statusName(pkmn.status)} 때문에 ${dmg} 데미지를 입었다!`)
      if (pkmn.hp <= 0) {
        msgs.push(`${pkmn.name}${josa(pkmn.name, "은는")} 쓰러졌다!`)
        anyFainted = true
      }
    }
  }

  return { msgs, anyFainted }
}

// ──────────────────────────────────────────────
// 날씨 적용 (기술 사용 시)
// room의 weather 필드를 업데이트할 값을 반환
// 반환: { weather: string | null, msgs: string[] }
// ──────────────────────────────────────────────
export function applyWeatherEffect(moveEffect) {
  if (!moveEffect?.weather) return { weather: null, msgs: [] }

  const weatherName = moveEffect.weather
  return {
    weather: weatherName,
    msgs: [`날씨가 ${weatherName}(으)로 바뀌었다!`]
  }
}

// ──────────────────────────────────────────────
// 스피드 페널티 계산 (명중 판정에서 사용)
// 마비: -1, 얼음: -3
// ──────────────────────────────────────────────
export function getStatusSpdPenalty(pokemon) {
  if (pokemon.status === "paralysis") return 1
  if (pokemon.status === "frozen") return 3
  return 0
}
