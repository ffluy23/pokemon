export const typeChart = {

  불: {
    풀: 1.8,
    얼음: 1.8,
    물: 0.8,
    불: 0.8
  },

  물: {
    불: 1.8,
    풀: 0.8
  },

  전기: {
    물: 1.8,
    풀: 0.8
  }

};

export function getTypeMultiplier(moveType, targetTypes){

  let multiplier = 1;

  targetTypes.forEach(type => {

    if(typeChart[moveType] && typeChart[moveType][type]){
      multiplier *= typeChart[moveType][type];
    }

  });

  return multiplier;

}
