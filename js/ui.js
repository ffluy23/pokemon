import { moves } from "./moves.js"
import { playerUseMove } from "./battle.js"

export function renderMoves(moveList){

  const buttons = document.querySelectorAll(".moveBtn")

  moveList.forEach((moveName,index)=>{

    const btn = buttons[index]

    btn.innerText = moveName

    btn.onclick = ()=>{

      const move = moves[moveName]

      playerUseMove(move)

    }

  })

}
