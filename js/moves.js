// 기술 사전
// power: 기본 위력 (고정 40, 날씨기술은 0)
// type: 기술 타입
// alwaysHit: true = 명중 판정 없이 반드시 명중
// effect: 부가효과 (없으면 null)
//   - chance: 발동 확률 (0.0~1.0)
//   - status: 상태이상 (독/화상/마비/잠듦/얼음)
//   - volatile: 상태변화 (혼란/풀죽음)
//   - weather: 날씨 변화

export const moves = {
  // 노말
  "전광석화":       { power: 40, type: "노말", alwaysHit: false, effect: null },
  "스위프트":       { power: 40, type: "노말", alwaysHit: true,  effect: null },
  "몸통박치기":     { power: 40, type: "노말", alwaysHit: false, effect: { chance: 0.3, volatile: "풀죽음" } },
  "하이퍼보이스":   { power: 40, type: "노말", alwaysHit: false, effect: null },
  "극대화포":       { power: 40, type: "노말", alwaysHit: false, effect: null },

  // 불
  "화염방사":       { power: 40, type: "불", alwaysHit: false, effect: { chance: 0.1, status: "화상" } },
  "불꽃엄니":       { power: 40, type: "불", alwaysHit: false, effect: { chance: 0.1, status: "화상" } },
  "열풍":           { power: 40, type: "불", alwaysHit: false, effect: { chance: 0.1, status: "화상" } },
  "불대문자":       { power: 40, type: "불", alwaysHit: false, effect: null },
  "불꽃세례":       { power: 40, type: "불", alwaysHit: false, effect: { chance: 0.1, status: "화상" } },

  // 물
  "거품광선":       { power: 40, type: "물", alwaysHit: false, effect: null },
  "파도타기":       { power: 40, type: "물", alwaysHit: false, effect: null },
  "물대포":         { power: 40, type: "물", alwaysHit: false, effect: null },
  "하이드로펌프":   { power: 40, type: "물", alwaysHit: false, effect: null },
  "아쿠아제트":     { power: 40, type: "물", alwaysHit: false, effect: null },

  // 전기
  "번개펀치":       { power: 40, type: "전기", alwaysHit: false, effect: { chance: 0.1, status: "마비" } },
  "10만볼트":       { power: 40, type: "전기", alwaysHit: false, effect: { chance: 0.3, status: "마비" } },
  "방전":           { power: 40, type: "전기", alwaysHit: false, effect: { chance: 0.3, volatile: "풀죽음" } },
  "번개":           { power: 40, type: "전기", alwaysHit: false, effect: { chance: 0.3, status: "마비" } },
  "전기쇼크":       { power: 40, type: "전기", alwaysHit: false, effect: { chance: 0.1, status: "마비" } },

  // 풀
  "에너지볼":       { power: 40, type: "풀", alwaysHit: false, effect: null },
  "솔라빔":         { power: 40, type: "풀", alwaysHit: false, effect: null },
  "잎날가르기":     { power: 40, type: "풀", alwaysHit: false, effect: null },
  "씨폭탄":         { power: 40, type: "풀", alwaysHit: false, effect: null },

  // 얼음
  "눈보라":         { power: 40, type: "얼음", alwaysHit: false, effect: { chance: 0.1, status: "얼음" } },
  "냉동빔":         { power: 40, type: "얼음", alwaysHit: false, effect: { chance: 0.1, status: "얼음" } },
  "아이스펀치":     { power: 40, type: "얼음", alwaysHit: false, effect: { chance: 0.1, status: "얼음" } },
  "얼음엄니":       { power: 40, type: "얼음", alwaysHit: false, effect: { chance: 0.1, status: "얼음" } },
  "아이스해머":     { power: 40, type: "얼음", alwaysHit: false, effect: { chance: 0.1, status: "얼음" } },

  // 격투
  "인파이트":       { power: 40, type: "격투", alwaysHit: false, effect: null },
  "파동탄":         { power: 40, type: "격투", alwaysHit: true,  effect: null },
  "발뒤꿈치떨어뜨리기": { power: 40, type: "격투", alwaysHit: false, effect: null },

  // 독
  "독침붕":         { power: 40, type: "독", alwaysHit: false, effect: { chance: 0.3, status: "독" } },
  "헤이즈":         { power: 40, type: "독", alwaysHit: false, effect: { chance: 0.2, status: "독" } },

  // 땅
  "지진":           { power: 40, type: "땅", alwaysHit: false, effect: null },
  "땅가르기":       { power: 40, type: "땅", alwaysHit: false, effect: null },

  // 바위
  "스톤에지":       { power: 40, type: "바위", alwaysHit: false, effect: null },
  "록블라스트":     { power: 40, type: "바위", alwaysHit: false, effect: null },

  // 비행
  "에어슬래시":     { power: 40, type: "비행", alwaysHit: false, effect: { chance: 0.3, volatile: "풀죽음" } },
  "열풍비행":       { power: 40, type: "비행", alwaysHit: false, effect: { chance: 0.1, status: "화상" } },

  // 에스퍼
  "사이코키네시스": { power: 40, type: "에스퍼", alwaysHit: false, effect: null },
  "미래예지":       { power: 40, type: "에스퍼", alwaysHit: false, effect: null },

  // 벌레
  "버그버즈":       { power: 40, type: "벌레", alwaysHit: false, effect: null },
  "시저크로스":     { power: 40, type: "벌레", alwaysHit: false, effect: null },

  // 고스트
  "섀도볼":         { power: 40, type: "고스트", alwaysHit: false, effect: null },
  "나이트헤드":     { power: 40, type: "고스트", alwaysHit: true,  effect: null },
  "섀도스니크":     { power: 40, type: "고스트", alwaysHit: false, effect: null },

  // 드래곤
  "드래곤크루":     { power: 40, type: "드래곤", alwaysHit: false, effect: null },
  "역린":           { power: 40, type: "드래곤", alwaysHit: false, effect: { chance: 0.2, volatile: "혼란" } },

  // 악
  "악의파동":       { power: 40, type: "악", alwaysHit: false, effect: { chance: 0.2, volatile: "풀죽음" } },
  "암타":           { power: 40, type: "악", alwaysHit: false, effect: null },

  // 강철
  "아이언헤드":     { power: 40, type: "강철", alwaysHit: false, effect: { chance: 0.3, volatile: "풀죽음" } },
  "메탈크로":       { power: 40, type: "강철", alwaysHit: false, effect: null },
  "불릿펀치":       { power: 40, type: "강철", alwaysHit: false, effect: null },
  "플래시캐논":     { power: 40, type: "강철", alwaysHit: true,  effect: null },

  // 페어리
  "문포스":         { power: 40, type: "페어리", alwaysHit: false, effect: null },
  "매지컬샤인":     { power: 40, type: "페어리", alwaysHit: true,  effect: null },

  // 날씨
  "맑게개다":       { power: 0, type: "불",   alwaysHit: false, effect: { chance: 1.0, weather: "쾌청" } },
  "비바라기":       { power: 0, type: "물",   alwaysHit: false, effect: { chance: 1.0, weather: "비" } },
  "모래바람":       { power: 0, type: "바위", alwaysHit: false, effect: { chance: 1.0, weather: "모래바람" } },
  "싸라기눈":       { power: 0, type: "얼음", alwaysHit: false, effect: { chance: 1.0, weather: "싸라기눈" } },
}
