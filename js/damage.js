import { getTypeMultiplier } from "./typeChart.js";

function rollDice(){
  return Math.floor(Math.random() * 10) + 1;
}

export function calculateDamage(attacker, defender, move){

  const dice = rollDice();

  const typeEffect = getTypeMultiplier(move.type, defender.type);

  const stab = attacker.type.includes(move.type) ? 1.3 : 1;

  let damage =
    (40 + attacker.attack * 4 + dice) *
    typeEffect *
    stab -
    defender.defense * 5;

  damage = Math.floor(damage);

  if(damage < 0) damage = 0;

  return damage;

}
