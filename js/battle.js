async function test(){

  const userRef = doc(db,"users","uid123")
  const userSnap = await getDoc(userRef)

  const entry = userSnap.data().entry

  console.log(entry)

  await setDoc(doc(db,"rooms","battleroom1"),{
    player1_entry: entry
  },{merge:true})

}
