// 기술 사전
// power: 기본 위력 (고정 40)
// type: 기술 타입
// effect: 부가효과 (없으면 null)
//   - chance: 발동 확률 (0.0 ~ 1.0)
//   - status: 상태이상 (독/화상/마비/잠듦/얼음) → 중첩 X
//   - volatile: 상태변화 (혼란/풀죽음) → 중첩 O
//   - weather: 날씨 변화 (쾌청/비/모래바람/싸라기눈/안개)

export const moves = {

// ─── 불 ───
“화염방사”: {
power: 40,
type: “불”,
effect: { chance: 0.1, status: “화상” }
},
“불꽃엄니”: {
power: 40,
type: “불”,
effect: { chance: 0.1, status: “화상” }
},
“열풍”: {
power: 40,
type: “불”,
effect: { chance: 0.1, status: “화상” }
},
“불대문자”: {
power: 40,
type: “불”,
effect: null
},

// ─── 물 ───
“거품광선”: {
power: 40,
type: “물”,
effect: null
},
“파도타기”: {
power: 40,
type: “물”,
effect: null
},
“물대포”: {
power: 40,
type: “물”,
effect: null
},
“하이드로펌프”: {
power: 40,
type: “물”,
effect: null
},

// ─── 전기 ───
“번개펀치”: {
power: 40,
type: “전기”,
effect: { chance: 0.1, status: “마비” }
},
“10만볼트”: {
power: 40,
type: “전기”,
effect: { chance: 0.3, status: “마비” }
},
“방전”: {
power: 40,
type: “전기”,
effect: { chance: 0.3, volatile: “풀죽음” }
},
“번개”: {
power: 40,
type: “전기”,
effect: { chance: 0.3, status: “마비” }
},

// ─── 풀 ───
“에너지볼”: {
power: 40,
type: “풀”,
effect: null
},
“솔라빔”: {
power: 40,
type: “풀”,
effect: null
},
“잎날가르기”: {
power: 40,
type: “풀”,
effect: null
},
“씨폭탄”: {
power: 40,
type: “풀”,
effect: null
},

// ─── 얼음 ───
“눈보라”: {
power: 40,
type: “얼음”,
effect: { chance: 0.1, status: “얼음” }
},
“냉동빔”: {
power: 40,
type: “얼음”,
effect: { chance: 0.1, status: “얼음” }
},
“아이스펀치”: {
power: 40,
type: “얼음”,
effect: { chance: 0.1, status: “얼음” }
},
“얼음엄니”: {
power: 40,
type: “얼음”,
effect: { chance: 0.1, status: “얼음” }
},

// ─── 노말 ───
“몸통박치기”: {
power: 40,
type: “노말”,
effect: { chance: 0.3, volatile: “풀죽음” }
},
“더블슬랩”: {
power: 40,
type: “노말”,
effect: null
},
“하이퍼보이스”: {
power: 40,
type: “노말”,
effect: null
},
“극대화포”: {
power: 40,
type: “노말”,
effect: null
},

// ─── 격투 ───
“인파이트”: {
power: 40,
type: “격투”,
effect: null
},
“파동탄”: {
power: 40,
type: “격투”,
effect: null
},
“발뒤꿈치떨어뜨리기”: {
power: 40,
type: “격투”,
effect: null
},

// ─── 독 ───
“독침붕”: {
power: 40,
type: “독”,
effect: { chance: 0.3, status: “독” }
},
“헤이즈”: {
power: 40,
type: “독”,
effect: { chance: 0.2, status: “독” }
},

// ─── 땅 ───
“지진”: {
power: 40,
type: “땅”,
effect: null
},
“땅가르기”: {
power: 40,
type: “땅”,
effect: null
},

// ─── 바위 ───
“스톤에지”: {
power: 40,
type: “바위”,
effect: null
},
“록블라스트”: {
power: 40,
type: “바위”,
effect: null
},

// ─── 비행 ───
“에어슬래시”: {
power: 40,
type: “비행”,
effect: { chance: 0.3, volatile: “풀죽음” }
},
“열풍”: {
power: 40,
type: “비행”,
effect: { chance: 0.1, status: “화상” }
},

// ─── 에스퍼 ───
“사이코키네시스”: {
power: 40,
type: “에스퍼”,
effect: null
},
“미래예지”: {
power: 40,
type: “에스퍼”,
effect: null
},

// ─── 벌레 ───
“버그버즈”: {
power: 40,
type: “벌레”,
effect: null
},
“시저크로스”: {
power: 40,
type: “벌레”,
effect: null
},

// ─── 고스트 ───
“섀도볼”: {
power: 40,
type: “고스트”,
effect: null
},
“나이트헤드”: {
power: 40,
type: “고스트”,
effect: null
},

// ─── 드래곤 ───
“드래곤크루”: {
power: 40,
type: “드래곤”,
effect: null
},
“역린”: {
power: 40,
type: “드래곤”,
effect: { chance: 0.2, volatile: “혼란” }
},

// ─── 악 ───
“악의파동”: {
power: 40,
type: “악”,
effect: { chance: 0.2, volatile: “풀죽음” }
},
“암타”: {
power: 40,
type: “악”,
effect: null
},

// ─── 강철 ───
“아이언헤드”: {
power: 40,
type: “강철”,
effect: { chance: 0.3, volatile: “풀죽음” }
},
“메탈크로”: {
power: 40,
type: “강철”,
effect: null
},

// ─── 페어리 ───
“문포스”: {
power: 40,
type: “페어리”,
effect: null
},
“매지컬샤인”: {
power: 40,
type: “페어리”,
effect: null
},

// ─── 날씨 기술 ───
“맑게개다”: {
power: 0,
type: “불”,
effect: { chance: 1.0, weather: “쾌청” }
},
“비바라기”: {
power: 0,
type: “물”,
effect: { chance: 1.0, weather: “비” }
},
“모래바람”: {
power: 0,
type: “바위”,
effect: { chance: 1.0, weather: “모래바람” }
},
“싸라기눈”: {
power: 0,
type: “얼음”,
effect: { chance: 1.0, weather: “싸라기눈” }
},

}
