import { db } from "../firebase.js";
import { auth } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

async function carregarHistorico(usuarioEmail) {
    const container = document.getElementById("listaHistorico");

    try {
        // Consulta pelo e-mail real do usuário autenticado
        const historicoRef = collection(db, "historico_usuario");
        const q = query(historicoRef, where("usuarioEmail", "==", usuarioEmail));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `<p class="carregando">Você ainda não possui nenhum bilhete registrado.</p>`;
            return;
        }

        let documentos = [];
        querySnapshot.forEach((docSnap) => {
            documentos.push(docSnap.data());
        });

        // Ordena por data decrescente (mais recentes primeiro)
        documentos.sort((a, b) => {
            const dataA = a.data?.seconds ? a.data.seconds : 0;
            const dataB = b.data?.seconds ? b.data.seconds : 0;
            return dataB - dataA;
        });

        container.innerHTML = "";
        let indexBilhete = documentos.length;

        documentos.forEach(aposta => {
            const dataObjeto = aposta.data?.seconds ? new Date(aposta.data.seconds * 1000) : new Date();
            const dataFormatada = dataObjeto.toLocaleDateString('pt-BR') + " às " + dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            let conteudoCard = `
                <div class="card-historico-bilhete">
                    <div class="cabecalho-bilhete">
                        <span class="numero-bilhete">BILHETE #${indexBilhete}</span>
                        <span class="data-bilhete">${dataFormatada}</span>
                    </div>
                    <div class="lista-palpites">
            `;

            if (aposta.palpites && Array.isArray(aposta.palpites)) {
                aposta.palpites.forEach(palpite => {
                    conteudoCard += `
                        <div class="palpite-linha">
                            <div class="times-palpite">
                                <span class="time-a">${palpite.timeCasa}</span> 
                                <span class="separador">×</span> 
                                <span class="time-b">${palpite.timeVisitante}</span>
                            </div>
                            <div class="placar-palpite">${palpite.placar}</div>
                        </div>
                    `;
                });
            }

            conteudoCard += `
                    </div>
                </div>
            `;

            container.innerHTML += conteudoCard;
            indexBilhete--;
        });

    } catch (erro) {
        console.error("Erro ao carregar histórico: ", erro);
        container.innerHTML = `<p class="carregando" style="color: #ff4d4d;">Erro ao carregar os dados.</p>`;
    }
}

// Aguarda o Firebase confirmar quem está logado antes de consultar o histórico
onAuthStateChanged(auth, (usuario) => {
    const container = document.getElementById("listaHistorico");

    if (!usuario) {
        container.innerHTML = `<p class="carregando" style="color: #ff4d4d;">Usuário não identificado. Faça login.</p>`;
        return;
    }

    carregarHistorico(usuario.email);
});