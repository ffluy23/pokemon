function listenBattle() {
    onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
        if (!snapshot.exists()) {
            console.error("문서가 존재하지 않아! ID를 확인해봐.");
            return;
        }

        const data = snapshot.data();
        console.log("전체 데이터:", data); // 컨솔에 찍어서 구조 확인용

        // 1. 플레이어 이름 표시
        document.getElementById("p1-name").innerText = data.player1_name || "Unknown";
        document.getElementById("p2-name").innerText = data.player2_name || "Unknown";

        // 2. Player 1의 현재 포켓몬 (p1_entry 배열의 p1_active_idx번째 요소)
        const p1ActiveIdx = data.p1_active_idx; // 보통 0
        const p1Pokemon = data.p1_entry[p1ActiveIdx]; // 여기서 0번 Map에 접근

        if (p1Pokemon) {
            document.getElementById("p1-active-name").innerText = p1Pokemon.name; // name(string)
            document.getElementById("p1-hp-bar").value = p1Pokemon.hp; // hp(number)
            document.getElementById("p1-hp-text").innerText = `${p1Pokemon.hp} / 100`;
        }

        // 3. 대기 중인 포켓몬들 (나머지 1, 2번)
        // 0~2번 중 active_idx가 아닌 애들을 찾아서 버튼에 넣기
        let benchBtnIdx = 1;
        data.p1_entry.forEach((pkmn, idx) => {
            if (idx !== p1ActiveIdx) {
                const btn = document.getElementById(`btn-pkmn-${benchBtnIdx}`);
                if (btn) {
                    btn.innerText = `${pkmn.name} (HP: ${pkmn.hp})`;
                    // 버튼 클릭 시 해당 인덱스(idx)로 교체되도록 셋팅
                    btn.onclick = () => switchPokemon(idx);
                }
                benchBtnIdx++;
            }
        });

        // 4. Player 2 (상대방) 정보도 동일하게 업데이트
        const p2ActiveIdx = data.p2_active_idx;
        const p2Pokemon = data.p2_entry[p2ActiveIdx];
        if (p2Pokemon) {
            document.getElementById("p2-active-name").innerText = p2Pokemon.name;
            document.getElementById("p2-hp-bar").value = p2Pokemon.hp;
            document.getElementById("p2-hp-text").innerText = `${p2Pokemon.hp} / 100`;
        }
    });
}
