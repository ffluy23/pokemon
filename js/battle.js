import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { db } from "./firebase.js"
import { moves } from "./moves.js"
import { getTypeMultiplier } from "./typeChart.js"

let roomId

let playerData
let enemyData

let playerPokemon
let enemyPokemon

let playerField
let enemyField

let playerKey
let enemyKey


function rollDice(){
    return Math.floor(Math.random()*10)+1
}


function checkFirstTurn(p1,p2){

    const r1 = p1.speed + rollDice()
    const r2 = p2.speed + rollDice()

    return r1 > r2 ? "p1" : "p2"

}


function checkHit(attacker,defender){

    const roll = attacker.speed + rollDice()
    const target = defender.speed + 3

    return roll > target

}


function getSTAB(attacker,move){

    return attacker.type.includes(move.type) ? 1.3 : 1

}


function calcDamage(attacker,defender,move){

    const dice = rollDice()

    const base = 40 + attacker.attack*4 + dice

    const type = getTypeMultiplier(move.type,defender.type)

    const stab = getSTAB(attacker,move)

    let damage = (base * type * stab) - defender.defense*5

    damage = Math.floor(damage)

    if(damage < 0) damage = 0

    return damage

}


function executeAttack(attacker,defender,moveName){

    const move = moves[moveName]

    if(!move) return

    if(!checkHit(attacker,defender)) return

    const damage = calcDamage(attacker,defender,move)

    defender.hp -= damage

    if(defender.hp < 0) defender.hp = 0

}


function renderPlayerUI(){

    document.getElementById("player_name").innerText = playerData.nickname
    document.getElementById("pokemon_name").innerText = playerPokemon.name
    document.getElementById("pokemon_type").innerText = playerPokemon.type.join(",")

    const buttons = document.querySelectorAll(".moveBtn")

    buttons.forEach((btn,index)=>{

        const moveName = playerPokemon.moves[index]

        if(!moveName){
            btn.innerText = "-"
            return
        }

        btn.innerText = moveName

        btn.onclick = ()=>{
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

    const roomRef = doc(db,"rooms",roomId)
    const roomSnap = await getDoc(roomRef)

    const room = roomSnap.data()

    if(!room.player1_move || !room.player2_move) return


    const p1Ref = doc(db,"users",room.player1_uid)
    const p2Ref = doc(db,"users",room.player2_uid)

    const p1Snap = await getDoc(p1Ref)
    const p2Snap = await getDoc(p2Ref)

    const p1Data = p1Snap.data()
    const p2Data = p2Snap.data()

    const p1 = p1Data.entry[room.player1_field]
    const p2 = p2Data.entry[room.player2_field]


    const first = checkFirstTurn(p1,p2)

    if(first === "p1"){

        executeAttack(p1,p2,room.player1_move)

        if(p2.hp > 0){
            executeAttack(p2,p1,room.player2_move)
        }

    }else{

        executeAttack(p2,p1,room.player2_move)

        if(p1.hp > 0){
            executeAttack(p1,p2,room.player1_move)
        }

    }


    await updateDoc(p1Ref,{ entry:p1Data.entry })
    await updateDoc(p2Ref,{ entry:p2Data.entry })

    await updateDoc(roomRef,{
        player1_move:null,
        player2_move:null
    })

}


export async function loadBattle(id){

    roomId = id

    const roomRef = doc(db,"rooms",roomId)
    const roomSnap = await getDoc(roomRef)

    const room = roomSnap.data()

    const uid = localStorage.getItem("uid")

    const p1Ref = doc(db,"users",room.player1_uid)
    const p2Ref = doc(db,"users",room.player2_uid)

    const p1Snap = await getDoc(p1Ref)
    const p2Snap = await getDoc(p2Ref)

    const p1 = p1Snap.data()
    const p2 = p2Snap.data()


    if(uid === room.player1_uid){

        playerData = p1
        enemyData = p2

        playerField = room.player1_field
        enemyField = room.player2_field

        playerKey = "player1"
        enemyKey = "player2"

    }else{

        playerData = p2
        enemyData = p1

        playerField = room.player2_field
        enemyField = room.player1_field

        playerKey = "player2"
        enemyKey = "player1"

    }


    playerPokemon = playerData.entry[playerField]
    enemyPokemon = enemyData.entry[enemyField]


    renderPlayerUI()

    setInterval(processTurn,1000)

}
