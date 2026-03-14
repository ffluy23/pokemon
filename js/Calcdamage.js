import { getTypeMultiplier, getStab } from "./typeChart.js"

// 명중 판정
// 공격자 스피드 + 1d10 > 방어자 스피드 + 3 이면 명중
export function calcHit(attackerSpeed, defenderSpeed) {
  const roll = attackerSpeed + d10()
  return roll > defenderSpeed + 3
}

// 최종 데미지 계산
// 공식: ((40 + 공격력×4 + 1d10) × 타입상성 × 자속보정) - (상대 방어력×5)
// 최솟값 0
export function calcDamage(attacker, move, defender, weather) {
  const typeMultiplier = getTypeMultiplier(move.type, defender.type)

  // 무효면 바로 0 반환
  if (typeMultiplier === 0) return { damage: 0, multiplier: 0 }

  const stab     = getStab(move.type, attacker.type)
  const dice     = d10()
  const base     = move.power + attacker.attack * 4 + dice
  const weatherMult = getWeatherDamageBoost(move.type, weather)

  const raw = Math.floor(base * typeMultiplier * stab * weatherMult)
  const final = Math.max(0, raw - defender.defense * 5)

  return {
    damage: final,
    multiplier: typeMultiplier,  // UI에서 "효과가 굉장했다!" 표시용
    dice                         // 디버그용
  }
}

// 날씨에 따른 데미지 보정
// 쾌청: 불 ×1.3 / 물 ×0.7
// 비:   물 ×1.3 / 불 ×0.7
// 모래바람/싸라기눈/안개: 데미지 보정 없음
function getWeatherDamageBoost(moveType, weather) {
  if (weather === "쾌청") {
    if (moveType === "불") return 1.3
    if (moveType === "물") return 0.7
  }
  if (weather === "비") {
    if (moveType === "물") return 1.3
    if (moveType === "불") return 0.7
  }
  return 1
}
