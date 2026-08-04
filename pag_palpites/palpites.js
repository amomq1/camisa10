import { db } from "../firebase.js";
// ADICIONE ESTA LINHA LOGO ABAIXO DO IMPORT DO "db":
import { auth } from "../firebase.js"; 

import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// VARIÁVEIS GLOBAIS DE CONTROLE
let listaDeJogosAtuais = [];
let bilhetes = [];
let horarioLimiteRodada = null;
let rodadaBloqueada = false;
let idRodadaAtivaGlobal = "rodada_01"; // Fallback padrão
let unsubscribePagamento = null; // Controle do listener de pagamento

// 1. DESCOBRE A RODADA ATIVA E CARREGA OS JOGOS DINAMICAMENTE
async function carregarRodadaAtiva() {
  try {
    // Busca qual rodada o administrador ativou
    const configSnap = await getDoc(doc(db, "configuracoes", "rodada_atual"));
    if (configSnap.exists()) {
      idRodadaAtivaGlobal = configSnap.data().id_ativa || "rodada_01";
    }

    // Carrega os dados/jogos da rodada descoberta
    const docRef = doc(db, "rodadas", idRodadaAtivaGlobal);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const dadosRodada = docSnap.data();
      const bannerImg = document.getElementById("bannerRodada");
      if (bannerImg && dadosRodada.bannerUrl) {
        bannerImg.src = dadosRodada.bannerUrl;
      }

      listaDeJogosAtuais = dadosRodada.jogos || [];
      horarioLimiteRodada = dadosRodada.horarioLimite;

      verificarHorarioLimite();
      setInterval(verificarHorarioLimite, 10000);

      if (rodadaBloqueada) return;
      renderizarJogos();
    }
  } catch (error) {
    console.error("Erro ao carregar dados do Firestore: ", error);
  }
}

// Recebe uma data no formato "DD/MM/AAAA" e retorna "HOJE", "AMANHÃ"
// ou a própria data caso seja em outro dia
function formatarDataJogo(dataStr) {
  if (!dataStr || typeof dataStr !== "string") return dataStr;

  const partes = dataStr.split("/");
  if (partes.length !== 3) return dataStr;

  const [dia, mes, ano] = partes.map(Number);
  const dataJogo = new Date(ano, mes - 1, dia);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  dataJogo.setHours(0, 0, 0, 0);

  if (dataJogo.getTime() === hoje.getTime()) return "HOJE";
  if (dataJogo.getTime() === amanha.getTime()) return "AMANHÃ";

  return dataStr;
}

function renderizarJogos() {
  const container = document.getElementById("listaJogos");
  if (!container) return;
  container.innerHTML = "";
  
  listaDeJogosAtuais.forEach((jogo, index) => {
    container.innerHTML += `
      <div class="jogo-card">
        <div class="header-info">${formatarDataJogo(jogo.data)} às ${jogo.horario} | ${jogo.campeonato}</div>
        <div class="placar">
          <div class="time"><img src="${jogo.escudoCasa || jogo.escudo1 || ''}"><div>${jogo.timeCasa}</div></div>
          <input type="number" id="g1_${index}">
          <span>X</span>
          <input type="number" id="g2_${index}">
          <div class="time"><img src="${jogo.escudoVisitante || jogo.escudo2 || ''}"><div>${jogo.timeVisitante}</div></div>
        </div>
      </div>
    `;
  });
}

function verificarHorarioLimite() {
  if (!horarioLimiteRodada || rodadaBloqueada) return;
  const agora = new Date();
  const limite = new Date(horarioLimiteRodada);
  const limiteComDesconto = new Date(limite.getTime() - 1 * 60 * 1000);

  if (agora >= limiteComDesconto) {
    rodadaBloqueada = true;
    bloquearInterfaceApostas();
  }
}

function bloquearInterfaceApostas() {
  const container = document.getElementById("listaJogos");
  const btnAdicionar = document.querySelector("button[onclick='adicionarBilhete()']");
  if (btnAdicionar) btnAdicionar.disabled = true;

  if (container) {
    container.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; background: #1a1a1a; border: 2px solid #00ff66; border-radius: 8px; margin: 20px 0; color: #fff;">
      <h2 style="font-size: 24px; margin-bottom: 10px;">⚽ Apostas Encerradas!</h2>
      <p style="font-size: 16px; color: #ccc;">O limite para palpites desta rodada expirou.</p>
      <p style="font-size: 14px; margin-top: 15px; color: #00ff66; font-weight: bold;">Aguarde a liberação dos próximos jogos.</p>
    </div>
  `;
  }
}

function adicionarBilhete() {
  verificarHorarioLimite();
  if (rodadaBloqueada) {
    window.Swal.fire({ icon: 'error', title: 'Tempo Esgotado', text: 'Rodada encerrada!' });
    return;
  }

  const usuarioLogado = localStorage.getItem("usuarioLogado") || "Anônimo";
  const palpitesDoBilhete = [];

  for (let index = 0; index < listaDeJogosAtuais.length; index++) {
    const jogo = listaDeJogosAtuais[index];
    const inputCasa = document.getElementById(`g1_${index}`);
    const inputVisitante = document.getElementById(`g2_${index}`);

    const golsCasa = inputCasa.value.trim();
    const golsVisitante = inputVisitante.value.trim();

    if (golsCasa === "" || golsVisitante === "") {
      window.Swal.fire({
        icon: "warning",
        title: "Preencha todos os palpites",
        text: "Você precisa informar o placar de todas as partidas."
      });
      return;
    }

    palpitesDoBilhete.push({
      id: index,
      timeCasa: jogo.timeCasa,
      timeVisitante: jogo.timeVisitante,
      placar: `${golsCasa} x ${golsVisitante}`,
      validacao: "❌ Não Apurado"
    });
  }

  bilhetes.push({ nome: usuarioLogado, palpites: palpitesDoBilhete });

  listaDeJogosAtuais.forEach((_, index) => {
    const inputCasa = document.getElementById(`g1_${index}`);
    const inputVisitante = document.getElementById(`g2_${index}`);
    if (inputCasa) inputCasa.value = "";
    if (inputVisitante) inputVisitante.value = "";
  });

  atualizarPrancheta();
  window.Swal.fire({ icon: 'success', title: 'Adicionado!', timer: 1000, showConfirmButton: false });
}

function togglePrancheta() {
  const prancheta = document.getElementById("minhaPrancheta");
  if (prancheta) prancheta.classList.toggle("aberta");
}

function atualizarPrancheta() {
  const lista = document.getElementById("itensPrancheta");
  const contador = document.getElementById("contador");
  const badgeFinalizar = document.getElementById("badgeFinalizar");
  const totalBilhetes = bilhetes.length;

  if (contador) contador.textContent = totalBilhetes;

  const resumoQtd = document.getElementById("resumoQtd");
  const resumoTotal = document.getElementById("resumoTotal");
  const valorBilhete = 1;

  if (resumoQtd) resumoQtd.textContent = totalBilhetes;
  if (resumoTotal) resumoTotal.textContent = `R$ ${(totalBilhetes * valorBilhete).toFixed(2).replace(".", ",")}`;
  
  if (badgeFinalizar) badgeFinalizar.style.display = totalBilhetes > 0 ? "block" : "none";
  if (!lista) return;
  lista.innerHTML = "";

  bilhetes.forEach((bilhete, indexBilhete) => {
    let conteudoBilhete = `
      <div class="card-bilhete">
        <div class="card-cabecalho">
          <div class="info-principal">
            <div class="bilhete-numero">#${indexBilhete + 1}</div>
            <div class="cliente-nome">${bilhete.nome}</div>
          </div>
          <button class="btn-remover" onclick="removerBilhete(${indexBilhete})">×</button>
        </div>
        <div class="lista-palpites">
    `;

    bilhete.palpites.forEach(palpite => {
      conteudoBilhete += `
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

    conteudoBilhete += `</div></div>`;
    lista.innerHTML += conteudoBilhete;
  });
}

function removerBilhete(index) {
  bilhetes.splice(index, 1);
  atualizarPrancheta(); 
}

async function enviarTodosOsBilhetes() {
  verificarHorarioLimite();
  if (rodadaBloqueada) {
    window.Swal.fire({ icon: 'error', title: 'Tempo Esgotado', text: 'As apostas já fecharam!' });
    return;
  }
  if (bilhetes.length === 0) return;

  const btnEnviar = document.getElementById("btnEnviarBilhetes");
  if (btnEnviar) {
    btnEnviar.disabled = true;
    btnEnviar.innerText = "GERANDO PIX...";
  }

  try {
    // 1. Busca o usuário logado via sessão ativa do Firebase Auth
    // Importante: certifique-se de que o "auth" esteja importado no topo do seu arquivo
    // do mesmo jeito que fez com o "db": import { auth } from "../firebase.js";
    const usuarioAtual = auth.currentUser;
    if (!usuarioAtual) {
      throw new Error("Você precisa estar autenticado no sistema para realizar pagamentos.");
    }

    // 2. Solicita o ID Token criptografado e assinado pelo Google para evitar fraudes
    const idToken = await usuarioAtual.getIdToken(true);

    // 3. Dispara a criação do Pix de forma segura para o backend na Render
    const response = await fetch("https://camisa10-backend.onrender.com/criar-pix", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}` // Envia as credenciais no cabeçalho seguro
      },
      body: JSON.stringify({
        rodadaId: idRodadaAtivaGlobal,
        bilhetes: bilhetes // Enviamos a lista para o cálculo de integridade no servidor
      })
    });

    if (!response.ok) throw new Error("Não foi possível estabelecer contato com o servidor de pagamentos.");
    const pixData = await response.json();

    // Validação defensiva do retorno do ID do pagamento
    if (!pixData || !pixData.pagamentoId) {
      throw new Error("Resposta de pagamento inválida retornada pelo servidor.");
    }

    // 4. Abre a interface visual do modal passando os dados gerados pela Render
    if (typeof window.abrirModalPix === "function") {
      window.abrirModalPix(pixData);
    } else {
      console.log("Dados do Pix recebidos com sucesso:", pixData);
    }

    // 5. Inicializa a escuta assíncrona do Firestore na coleção correta 'pagamentos'
    escutarPagamento(pixData.pagamentoId, usuarioAtual.email, idRodadaAtivaGlobal);

  } catch (erro) {
    console.error("Falha no fluxo de geração do Pix:", erro);
    window.Swal.fire({ 
      icon: 'error', 
      title: 'Erro de Pagamento', 
      text: erro.message || 'Falha ao processar requisição do Pix.' 
    });
  } finally {
    if (btnEnviar) {
      btnEnviar.disabled = false;
      btnEnviar.innerText = "EFETUAR PAGAMENTO";
    }
  }
}

// 3. ESCUTAR STATUS DE PAGAMENTO VIA FIRESTORE SNAPSHOT
function escutarPagamento(pagamentoId, usuarioEmail, rodadaAtivaGlobal) {
  if (unsubscribePagamento) {
    unsubscribePagamento();
    unsubscribePagamento = null;
  }

  const docPagamentoRef = doc(db, "pagamentos", pagamentoId);

  unsubscribePagamento = onSnapshot(
    docPagamentoRef,
    (snapshot) => {
      if (!snapshot.exists()) return;

      const dados = snapshot.data();

      // PONTO 6: Compara o UID de forma ultra robusta direto com a sessão ativa do Firebase Auth
      // Nota: Garanta que a variável global 'auth' esteja visível/importada se for usá-la rigidamente aqui
      if (dados.usuarioUid !== auth.currentUser.uid || dados.rodadaId !== rodadaAtivaGlobal) {
        return; 
      }

      switch (dados.statusPagamento) {
        case "approved":
          if (unsubscribePagamento) {
            unsubscribePagamento();
            unsubscribePagamento = null;
          }
          
          fecharModalComSucesso(); // Lembrar de declarar esta função caso use modal
          bilhetes = [];
          atualizarPrancheta();
          togglePrancheta();

          window.Swal.fire({
            icon: "success",
            title: "Pagamento Aprovado! 🎉",
            text: "Seus bilhetes foram validados e já estão concorrendo!"
          });
          break;

        case "expired":
          finalizarListenerComErro("Tempo Esgotado", "O link do Pix expirou.");
          break;

        case "cancelled":
          finalizarListenerComErro("Cancelado", "A cobrança foi cancelada.");
          break;

        case "rejected":
          finalizarListenerComErro("Recusado", "A transação foi recusada pelo banco.");
          break;

        case "pending":
        default:
          break;
      }
    },
    (erro) => {
      console.error("Erro no listener:", erro);
      finalizarListenerComErro("Conexão Perdida", "Não foi possível acompanhar o status do pagamento.");
    }
  );
}

// Caso precise da função auxiliar 'finalizarListenerComErro' referenciada no switch:
function finalizarListenerComErro(titulo, mensagem) {
  if (unsubscribePagamento) {
    unsubscribePagamento();
    unsubscribePagamento = null;
  }
  window.Swal.fire({ icon: "error", title: titulo, text: mensagem });
}

// Inicialização
carregarRodadaAtiva();

// ============================================
// MODAL DE PAGAMENTO PIX (QR Code + Copia e Cola)
// ============================================
function abrirModalPix(pixData) {
  // Remove modal antigo se já existir, para não duplicar
  const modalAntigo = document.getElementById("modalPixOverlay");
  if (modalAntigo) modalAntigo.remove();

  const overlay = document.createElement("div");
  overlay.id = "modalPixOverlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.75); display: flex; align-items: center;
    justify-content: center; z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="background:#1a1a1a; border:2px solid #00ff66; border-radius:12px; padding:24px; max-width:340px; width:90%; text-align:center; color:#fff;">
      <h2 style="margin-top:0; font-size:20px;">Pague com Pix</h2>
      <p style="font-size:13px; color:#ccc; margin-bottom:16px;">Escaneie o QR Code ou copie o código abaixo</p>
      
      <img src="data:image/png;base64,${pixData.qrCodeBase64}" 
           style="width:220px; height:220px; background:#fff; padding:8px; border-radius:8px;" />

      <textarea id="pixCopiaColaTexto" readonly 
        style="width:100%; margin-top:16px; padding:8px; border-radius:6px; border:1px solid #444; background:#2a2a2a; color:#fff; font-size:11px; resize:none;"
        rows="3">${pixData.pixCopiaCola}</textarea>

      <button id="btnCopiarPix" 
        style="width:100%; margin-top:10px; padding:10px; background:#00ff66; color:#000; font-weight:bold; border:none; border-radius:6px; cursor:pointer;">
        Copiar Código
      </button>

      <button id="btnFecharModalPix"
        style="width:100%; margin-top:10px; padding:10px; background:transparent; color:#ccc; border:1px solid #555; border-radius:6px; cursor:pointer;">
        Fechar
      </button>

      <p style="font-size:11px; color:#888; margin-top:14px;">Aguardando confirmação do pagamento...</p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Botão de copiar o código Pix
  document.getElementById("btnCopiarPix").addEventListener("click", () => {
    const textoPix = document.getElementById("pixCopiaColaTexto");
    textoPix.select();
    navigator.clipboard.writeText(textoPix.value).then(() => {
      window.Swal.fire({ icon: 'success', title: 'Copiado!', timer: 1000, showConfirmButton: false });
    });
  });

  // Botão de fechar manualmente
  document.getElementById("btnFecharModalPix").addEventListener("click", () => {
    overlay.remove();
  });
}

function fecharModalComSucesso() {
  const overlay = document.getElementById("modalPixOverlay");
  if (overlay) overlay.remove();
}

// Exposição das funções necessárias para o escopo global do navegador
window.togglePrancheta = togglePrancheta;
window.adicionarBilhete = adicionarBilhete;
window.removerBilhete = removerBilhete;
window.enviarTodosOsBilhetes = enviarTodosOsBilhetes;
window.escutarPagamento = escutarPagamento;
window.abrirModalPix = abrirModalPix;
window.fecharModalComSucesso = fecharModalComSucesso;

export { atualizarPrancheta, escutarPagamento };