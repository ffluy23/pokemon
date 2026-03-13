// battle.js
// PvP battle engine (rules fully applied)

import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { db } from "./firebase.js"
import { moves } from "./moves.js"
import { getTypeMultiplier } from "./typeChart.js"

let roomId
let roomData

let player
let enemy

let playerKey
let enemyKey


function rollDice(){
    return Math.floor(Math.random()*10)+1
}


function calcHP(defense){
    return 120 + defense * 15
}


function checkFirstTurn(p1,p2){

    const r1 = p1.speed + rollDice()
    const r2 = p2.speed + rollDice()

    if(r1 > r2){
        return "p1"
    }else{
        return "p2"
    }

}


function checkHit(attacker,defender){

    const roll = attacker.speed + rollDice()
    const target = defender.speed + 3

    return roll > target

}


function getSTAB(attacker,move){

    if(attacker.type.includes(move.type)){
        return 1.3
    }

    return 1

}


function calcDamage(attacker,defender,move){

    const dice = rollDice()

    const base = 40 + attacker.attack*4 + dice

    const type = getTypeMultiplier(move.type,defender.type)

    const stab = getSTAB(attacker,move)

    let damage = (base * type * stab) - defender.defense*5

    damage = Math.floor(damage)

    if(damage < 0){
        damage = 0
    }

    return damage

}


function executeAttack(attacker,defender,moveName){

    const move = moves[moveName]

    if(!checkHit(attacker,defender)){
        return
    }

    const damage = calcDamage(attacker,defender,move)

    defender.hp -= damage

    if(defender.hp < 0){
        defender.hp = 0
    }

}


function renderPlayerUI(){

    document.getElementById("player_name").innerText = player.nickname
    document.getElementById("pokemon_name").innerText = player.name
    document.getElementById("pokemon_type").innerText = player.type.join(",")

    const buttons = document.querySelectorAll(".moveBtn")

    player.moves.forEach((moveName,index)=>{

        const btn = buttons[index]

        btn.innerText = moveName

        btn.onclick = () => {

            chooseMove(moveName)

        }

    })

}


async function chooseMove(moveName){

    const ref = doc(db,"rooms",roomId)

    const field = playerKey + "_move"

    await updateDoc(ref,{
        [field]: moveName
    })

}


async function processTurn(){

    const ref = doc(db,"rooms",roomId)

    const snap = await getDoc(ref)

    const data = snap.data()

    const p1Move = data.player1_move
    const p2Move = data.player2_move

    if(!p1Move || !p2Move){
        return
    }

    let p1 = data.player1_entry
    let p2 = data.player2_entry


    const first = checkFirstTurn(p1,p2)


    if(first === "p1"){

        executeAttack(p1,p2,p1Move)

        if(p2.hp > 0){
            executeAttack(p2,p1,p2Move)
        }

    }else{

        executeAttack(p2,p1,p2Move)

        if(p1.hp > 0){
            executeAttack(p1,p2,p1Move)
        }

    }


    await updateDoc(ref,{
        player1_entry: p1,
        player2_entry: p2,
        player1_move: null,
        player2_move: null
    })

}


export async function loadBattle(id){

    roomId = id

    const ref = doc(db,"rooms",roomId)

    const snap = await getDoc(ref)

    roomData = snap.data()

    const uid = localStorage.getItem("uid")


    if(roomData.player1_uid === uid){

        player = roomData.player1_entry
        enemy = roomData.player2_entry

        playerKey = "player1"
        enemyKey = "player2"

    }else{

        player = roomData.player2_entry
        enemy = roomData.player1_entry

        playerKey = "player2"
        enemyKey = "player1"

    }


    player.hp = calcHP(player.defense)
    enemy.hp = calcHP(enemy.defense)


    renderPlayerUI()


    setInterval(processTurn,1000)

}
