export function renderMoves(moveList){

  const buttons = document.querySelectorAll(".moveBtn")

  if(!moveList){
    console.log("moveList 없음")
    return
  }

  buttons.forEach((btn,index)=>{

    const moveName = moveList[index]

    if(!moveName){
      btn.innerText = "-"
      return
    }

    btn.innerText = moveName

    btn.onclick = ()=>{

      const move = moves[moveName]

      playerUseMove(move)

    }

  })

}
