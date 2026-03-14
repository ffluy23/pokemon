// ─────────────────────────────────────────────
// 상태이상 (status)  - 중첩 X, 하나만 가능
//   독 / 화상 / 마비 / 잠듦 / 얼음
//
// 상태변화 (volatile) - 중첩 O, 상태이상과 동시 가능
//   혼란 / 풀죽음
//
// 날씨 (weather) - 필드 전체에 적용
//   쾌청 / 비 / 모래바람 / 싸라기눈 / 안개
// ─────────────────────────────────────────────

// ── 상태이상 부여 시도
// pokemon.status 가 비어있을 때만 적용 (중첩 X)
// 반환값: 실제로 부여됐으면 true
export function tryApplyStatus(pokemon, effect) {
  if (!effect?.status)          return false
  if (pokemon.status)           return false  // 이미 상태이상 있으면 스킵
  if (Math.random() > effect.chance) return false

  pokemon.status = effect.status
  return true
}

// ── 상태변화 부여 시도
// volatile 배열에 추가 (중첩 O)
// 반환값: 실제로 부여됐으면 true
export function tryApplyVolatile(pokemon, effect) {
  if (!effect?.volatile)             return false
  if (Math.random() > effect.chance) return false

  if (!pokemon.volatile) pokemon.volatile = []
  if (pokemon.volatile.includes(effect.volatile)) return false  // 이미 있으면 스킵

  pokemon.volatile.push(effect.volatile)
  return true
}

// ── 턴 시작 시 상태이상 처리
// 반환값: { blocked: bool, damage: number, message: string }
export function processTurnStatus(pokemon) {
  const result = { blocked: false, damage: 0, message: "" }
  if (!pokemon.status) return result

  switch (pokemon.status) {
    case "독":
      result.damage  = Math.floor(pokemon.maxHp * 0.1)  // 최대 HP 10% 지속 피해
      result.message = `${pokemon.name}은(는) 독 데미지를 받았다!`
      break

    case "화상":
      result.damage  = Math.floor(pokemon.maxHp * 0.07) // 최대 HP 7% 지속 피해
      result.message = `${pokemon.name}은(는) 화상 데미지를 받았다!`
      break

    case "마비":
      if (Math.random() < 0.25) {                        // 30% 확률로 행동불능
        result.blocked = true
        result.message = `${pokemon.name}은(는) 몸이 저려서 움직일 수 없다!`
      }
      break

    case "잠듦":
      result.blocked = true
      result.message = `${pokemon.name}은(는) 잠들어 있다!`
      // 매 턴 33% 확률로 깨어남
      if (Math.random() < 0.33) {
        pokemon.status = null
        result.blocked = false
        result.message = `${pokemon.name}은(는) 잠에서 깨어났다!`
      }
      break

    case "얼음":
      result.blocked = true
      result.message = `${pokemon.name}은(는) 얼어붙어 있다!`
      // 매 턴 20% 확률로 녹음
      if (Math.random() < 0.2) {
        pokemon.status = null
        result.blocked = false
        result.message = `${pokemon.name}은(는) 얼음이 녹았다!`
      }
      break
  }

  pokemon.hp = Math.max(0, pokemon.hp - result.damage)
  return result
}

// ── 턴 시작 시 상태변화 처리
// 반환값: { blocked: bool, message: string }
export function processTurnVolatile(pokemon) {
  const result = { blocked: false, message: "" }
  if (!pokemon.volatile || pokemon.volatile.length === 0) return result

  // 풀죽음: 1턴만 지속, 행동불능
  if (pokemon.volatile.includes("풀죽음")) {
    result.blocked = true
    result.message = `${pokemon.name}은(는) 풀이 죽어 있다!`
    // 다음 턴엔 자동 해제
    pokemon.volatile = pokemon.volatile.filter(v => v !== "풀죽음")
  }

  // 혼란: 매 턴 50% 확률로 자해 (자해 데미지 = 최대HP 6%)
  if (pokemon.volatile.includes("혼란")) {
    if (Math.random() < 0.5) {
      const selfDmg = Math.floor(pokemon.maxHp * 0.06)
      pokemon.hp = Math.max(0, pokemon.hp - selfDmg)
      result.blocked = true
      result.message += ` ${pokemon.name}은(는) 영문도 모른채 자신을 공격했다! (${selfDmg} 데미지)`
    }
    // 매 턴 25% 확률로 혼란 해제
    if (Math.random() < 0.25) {
      pokemon.volatile = pokemon.volatile.filter(v => v !== "혼란")
      result.message += ` ${pokemon.name}은(는) 혼란이 풀렸다!`
    }
  }

  return result
}

// ── 턴 종료 시 날씨 효과 처리
// 반환값: { damage: number, message: string }[]  (피해 대상별)
export function processWeather(weather, p1Pokemon, p2Pokemon) {
  const results = []
  if (!weather) return results

  switch (weather) {
    case "모래바람":
      // 바위/땅/강철 타입은 면역
      for (const pkmn of [p1Pokemon, p2Pokemon]) {
        if (!["바위", "땅", "강철"].includes(pkmn.type)) {
          const dmg = Math.floor(pkmn.maxHp * 0.07)
          pkmn.hp = Math.max(0, pkmn.hp - dmg)
          results.push({ name: pkmn.name, damage: dmg, message: `${pkmn.name}은(는) 모래바람 데미지를 받았다!` })
        }
      }
      break

    case "싸라기눈":
      // 얼음 타입은 면역
      for (const pkmn of [p1Pokemon, p2Pokemon]) {
        if (pkmn.type !== "얼음") {
          const dmg = Math.floor(pkmn.maxHp * 0.07)
          pkmn.hp = Math.max(0, pkmn.hp - dmg)
          results.push({ name: pkmn.name, damage: dmg, message: `${pkmn.name}은(는) 싸라기눈 데미지를 받았다!` })
        }
      }
      break

    case "쾌청":
    case "비":
    case "안개":
      // 데미지 없음 (데미지 보정은 calcDamage.js에서 처리)
      break
  }

  return results
}

// ── 안개 명중률 보정
// 안개일 때 명중 판정에 -2 보정
export function getFogAccuracyPenalty(weather) {
  return weather === "안개" ? -2 : 0
}

// ── 날씨 변경
export function applyWeather(effect, currentWeather) {
  if (!effect?.weather) return currentWeather
  if (Math.random() > effect.chance) return currentWeather
  return effect.weather
}

// ── 상태이상 한글 라벨
export function getStatusLabel(status) {
  const labels = {
    독: "🟣 독",
    화상: "🔴 화상",
    마비: "🟡 마비",
    잠듦: "💤 잠듦",
    얼음: "🔵 얼음"
  }
  return labels[status] ?? ""
}

// ── 날씨 한글 라벨
export function getWeatherLabel(weather) {
  const labels = {
    쾌청: "☀️ 쾌청",
    비: "🌧️ 비",
    모래바람: "🌪️ 모래바람",
    싸라기눈: "❄️ 싸라기눈",
    안개: "🌫️ 안개"
  }
  return labels[weather] ?? ""
}
