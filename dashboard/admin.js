import { db, auth } from "../firebase.js";
import { 
  doc, getDoc, setDoc, collection, getDocs, onSnapshot, runTransaction,
  addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

let contadorJogos = 0;
let jogosAtuaisSalvos = [];
let rodadaSelecionadaGlobal = "";
let desvinculoSnapshot = null;

// NOVO: cache para histórico
let historicoCache = []; // array of { id, usuario, dataRaw, dataParsed, rodada, palpites, resultado, rawDoc }
let historicoGrupos = []; // resultado agrupado usado para renderizar (cada grupo representa um conjunto usuario+rodada+data)

// FORMULÁRIO DE LOGIN ADMINISTRATIVO (agora via Firebase Auth real)
const formLogin = document.getElementById("formLoginAdmin");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const senha = document.getElementById("loginSenha").value.trim();

    try {
      await signInWithEmailAndPassword(auth, email, senha);

      // Confere se o UID logado está registrado e ativo em /administradores/{email}
      const docSnap = await getDoc(doc(db, "administradores", email));
      if (docSnap.exists() && docSnap.data().ativo === true) {
        window.Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Acesso liberado!' }).then(() => {
          location.reload();
        });
      } else {
        await signOut(auth);
        window.Swal.fire({ icon: 'error', title: 'Erro', text: 'Usuário não é administrador ativo.' });
      }
    } catch (err) {
      console.error(err);
      window.Swal.fire({ icon: 'error', title: 'Erro', text: 'Credenciais inválidas!' });
    }
  });
}

// EXECUTA VERIFICAÇÃO DE SESSÃO (agora baseada no Firebase Auth, não em localStorage)
onAuthStateChanged(auth, async (user) => {
  const telaLogin = document.getElementById("telaLogin");
  const conteudoPainel = document.getElementById("conteudoPainel");

  if (user) {
    const docSnap = await getDoc(doc(db, "administradores", user.email.toLowerCase()));
    if (docSnap.exists() && docSnap.data().ativo === true) {
      if (telaLogin) telaLogin.style.display = "none";
      if (conteudoPainel) conteudoPainel.style.display = "block";
      inicializarPainel();
    } else {
      await signOut(auth);
    }
  } else {
    if (telaLogin) telaLogin.style.display = "block";
    if (conteudoPainel) conteudoPainel.style.display = "none";
  }
});

// Botão de logout (se existir #btnLogoutAdmin no seu HTML)
const btnLogout = document.getElementById("btnLogoutAdmin");
if (btnLogout) {
  btnLogout.addEventListener("click", () => signOut(auth));
}

function inicializarPainel() {
  const inputConfig = document.getElementById("idRodadaConfig");
  if (inputConfig) {
    const idInicial = inputConfig.value.trim() || "rodada_01";
    carregarDadosRodadaConfiguracao(idInicial);

    inputConfig.addEventListener("change", (e) => {
      carregarDadosRodadaConfiguracao(e.target.value.trim());
    });
  }

  carregarListaDeRodadasSelector();

  const btnAdicionar = document.getElementById("btnAdicionarJogo");
  if (btnAdicionar) btnAdicionar.addEventListener("click", adicionarNovoCardJogo);

  const btnSalvar = document.getElementById("btnSalvarRodada");
  if (btnSalvar) btnSalvar.addEventListener("click", salvarConfiguracaoRodada);

  const btnApurar = document.getElementById("btnDispararApuracao");
  if (btnApurar) btnApurar.addEventListener("click", dispararApuracao);

  const seletor = document.getElementById("seletorRodadaApuracao");
  if (seletor) {
    seletor.addEventListener("change", (e) => {
      alternarRodadaApuracao(e.target.value);
    });
  }

  // Inicializar Histórico: carregar once and wire up UI
  carregarHistorico();

  const btnPesquisar = document.getElementById("btnPesquisarHistorico");
  if (btnPesquisar) btnPesquisar.addEventListener("click", filtrarHistorico);

  const btnLimpar = document.getElementById("btnLimparFiltrosHistorico");
  if (btnLimpar) btnLimpar.addEventListener("click", limparFiltros);

  const btnExportar = document.getElementById("btnExportarPDFHistorico");
  if (btnExportar) btnExportar.addEventListener("click", gerarPDFHistorico);

  // ===== NOVO: Aba 🏠 Gerenciar Index =====
  carregarConfigIndex();
  carregarGanhadoresAdmin();

  const btnSalvarConfigIndex = document.getElementById("btnSalvarConfigIndex");
  if (btnSalvarConfigIndex) btnSalvarConfigIndex.addEventListener("click", salvarConfigIndex);

  const formGanhador = document.getElementById("formGanhador");
  if (formGanhador) {
    formGanhador.addEventListener("submit", (e) => {
      e.preventDefault();
      salvarGanhador();
    });
  }

  const btnCancelarEdicaoGanhador = document.getElementById("btnCancelarEdicaoGanhador");
  if (btnCancelarEdicaoGanhador) btnCancelarEdicaoGanhador.addEventListener("click", cancelarEdicaoGanhador);
}

async function carregarListaDeRodadasSelector() {
  const seletor = document.getElementById("seletorRodadaApuracao");
  if (!seletor) return;

  try {
    const querySnapshot = await getDocs(collection(db, "rodadas"));
    seletor.innerHTML = '<option value="">-- Selecione uma Rodada para Apurar --</option>';
    querySnapshot.forEach((docSnap) => {
      seletor.innerHTML += `<option value="${docSnap.id}">${docSnap.id.toUpperCase()}</option>`;
    });
  } catch (error) {
    console.error(error);
  }
}

async function carregarDadosRodadaConfiguracao(idRodada) {
  if (!idRodada) return;

  try {
    const docSnap = await getDoc(doc(db, "rodadas", idRodada));
    const container = document.getElementById("containerJogos");
    if (!container) return;

    container.innerHTML = "";
    contadorJogos = 0;

    if (docSnap.exists()) {
      const dados = docSnap.data();

      if (document.getElementById("nomeRodada"))
        document.getElementById("nomeRodada").value = dados.nome || "";

      if (document.getElementById("bannerUrl"))
        document.getElementById("bannerUrl").value = dados.bannerUrl || "";

      if (document.getElementById("horarioLimite"))
        document.getElementById("horarioLimite").value = dados.horarioLimite || "";

      if (dados.jogos && Array.isArray(dados.jogos)) {
        dados.jogos.forEach((jogo, i) => {
          criarCardJogoHTML(
            jogo.timeCasa,
            jogo.escudoCasa,
            jogo.timeVisitante,
            jogo.escudoVisitante,
            jogo.campeonato,
            jogo.data,
            jogo.horario,
            i + 1
          );
        });
      }
    } else {
      if (document.getElementById("nomeRodada"))
        document.getElementById("nomeRodada").value = "";

      if (document.getElementById("bannerUrl"))
        document.getElementById("bannerUrl").value = "";

      if (document.getElementById("horarioLimite"))
        document.getElementById("horarioLimite").value = "";
    }
  } catch (err) {
    console.error(err);
  }
}

function alternarRodadaApuracao(idRodada) {
  rodadaSelecionadaGlobal = idRodada;
  const containerForm = document.getElementById("formularioPlacaresOficiais");
  const tbody = document.getElementById("corpoTabelaAcumulado");

  if (!idRodada) {
    if (containerForm) containerForm.innerHTML = '<div class="text-center py-4 text-muted">Selecione uma rodada para carregar os confrontos...</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Selecione uma rodada para visualizar a conferência...</td></tr>';
    return;
  }

  if (desvinculoSnapshot) desvinculoSnapshot();

  getDoc(doc(db, "rodadas", idRodada)).then((docSnap) => {
    if (docSnap.exists()) {
      jogosAtuaisSalvos = docSnap.data().jogos || [];
      montarFormularioApuracao(jogosAtuaisSalvos);
    }
  });

  desvinculoSnapshot = onSnapshot(doc(db, "apuracao_rodada", idRodada), async (docSnap) => {
    if (docSnap.exists()) {
      const dados = docSnap.data();
      
      // Mapeia as chaves (UIDs) e busca os nomes correspondentes na coleção usuarios
      const promessas = Object.keys(dados)
        .filter(chave => typeof dados[chave] === 'object')
        .map(async (chave) => {
          let nomeExibicao = chave;
          try {
            const userSnap = await getDoc(doc(db, "usuarios", chave));
            if (userSnap.exists() && userSnap.data().usuario) {
              nomeExibicao = userSnap.data().usuario;
            }
          } catch (e) { console.error(e); }
          
          return { usuario: nomeExibicao, ...dados[chave] };
        });

      const listaParticipantes = await Promise.all(promessas);
      renderizarTabelaAcumulado(listaParticipantes);
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-warning">Nenhum palpite enviado nesta rodada ainda.</td></tr>';
    }
  });
}

function montarFormularioApuracao(jogos) {
  const container = document.getElementById("formularioPlacaresOficiais");
  if (!container) return;
  container.innerHTML = "";

  jogos.forEach((jogo, i) => {
    container.innerHTML += `
      <div class="card p-3 mb-3 bg-dark text-white border-secondary card-jogo-item">
        <h6 class="text-white fw-bold mb-3">${jogo.timeCasa} x ${jogo.timeVisitante}</h6>
        <div class="row">
          <div class="col">
            <label class="form-label small text-muted">Gols Real ${jogo.timeCasa}</label>
            <input type="number" min="0" id="gols_j${i + 1}_casa" class="form-control text-white bg-dark border-secondary" required>
          </div>
          <div class="col">
            <label class="form-label small text-muted">Gols Real ${jogo.timeVisitante}</label>
            <input type="number" min="0" id="gols_j${i + 1}_vis" class="form-control text-white bg-dark border-secondary" required>
          </div>
        </div>
      </div>
    `;
  });
}

function adicionarNovoCardJogo() {
  contadorJogos++;
  criarCardJogoHTML("", "", "", "", "", "", "", contadorJogos);
}

function criarCardJogoHTML(timeC, escC, timeV, escV, camp, dataTexto, horarioTexto, numJogo) {
  const container = document.getElementById("containerJogos");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "card-admin mb-3 p-3 position-relative card-jogo-item border-secondary text-white";
  div.innerHTML = `
    <span class="position-absolute top-0 start-0 translate-middle badge rounded-pill bg-danger">Jogo ${numJogo}</span>
    <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-2" onclick="this.parentElement.remove()"></button>
    <div class="row g-2">
      <div class="col-md-2">
        <label class="form-label small text-muted">Campeonato</label>
        <input type="text" class="form-control form-control-sm campeonato" value="${camp || ''}" placeholder="Ex: Brasileirão">
      </div>
      <div class="col-md-2">
        <label class="form-label small text-muted">Data do Jogo</label>
        <input type="text" class="form-control form-control-sm data-jogo" value="${dataTexto || ''}" placeholder="Ex: Sábado, 12/07">
      </div>
      <div class="col-md-2">
        <label class="form-label small text-muted">Horário</label>
        <input type="text" class="form-control form-control-sm horario-jogo" value="${horarioTexto || ''}" placeholder="Ex: 16:00">
      </div>
      <div class="col-md-3 col-6">
        <label class="form-label small text-muted">Time Casa</label>
        <input type="text" class="form-control form-control-sm time-casa" value="${timeC || ''}">
        <input type="text" class="form-control form-control-sm escudo-casa mt-1" value="${escC || ''}" placeholder="Link Escudo">
      </div>
      <div class="col-md-3 col-6">
        <label class="form-label small text-muted">Time Fora</label>
        <input type="text" class="form-control form-control-sm time-fora" value="${timeV || ''}">
        <input type="text" class="form-control form-control-sm escudo-fora mt-1" value="${escV || ''}" placeholder="Link Escudo">
      </div>
    </div>
  `;
  container.appendChild(div);
}

async function salvarConfiguracaoRodada() {
  const container = document.getElementById("containerJogos");
  const inputConfig = document.getElementById("idRodadaConfig");

  if (!inputConfig) return;

  const idRodada = inputConfig.value.trim();

  if (!idRodada) {
    window.Swal.fire({
      icon: "warning",
      title: "Erro",
      text: "Insira o ID da rodada!"
    });
    return;
  }

  const itens = container.querySelectorAll(".card-jogo-item");
  const arrayJogos = [];

  itens.forEach((bloco) => {
    arrayJogos.push({
      timeCasa: bloco.querySelector(".time-casa").value.trim(),
      escudoCasa: bloco.querySelector(".escudo-casa").value.trim(),
      timeVisitante: bloco.querySelector(".time-fora").value.trim(),
      escudoVisitante: bloco.querySelector(".escudo-fora").value.trim(),
      campeonato: bloco.querySelector(".campeonato").value.trim(),
      data: bloco.querySelector(".data-jogo").value.trim(),
      horario: bloco.querySelector(".horario-jogo").value.trim()
    });
  });

  try {
    await setDoc(doc(db, "rodadas", idRodada), {
      nome: document.getElementById("nomeRodada").value.trim(),
      bannerUrl: document.getElementById("bannerUrl").value.trim(),
      horarioLimite: document.getElementById("horarioLimite").value,
      status: "ativa",
      jogos: arrayJogos
    });

    await setDoc(doc(db, "configuracoes", "rodada_atual"), {
      id_ativa: idRodada
    });

    window.Swal.fire({
      icon: "success",
      title: "Salvo com Sucesso!"
    });

    carregarListaDeRodadasSelector();

  } catch (err) {
    console.error(err);

    window.Swal.fire({
      icon: "error",
      title: "Erro",
      text: "Falha ao salvar configurações."
    });
  }
}

async function dispararApuracao() {
  if (!rodadaSelecionadaGlobal) {
    window.Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Selecione a rodada antes de apurar!' });
    return;
  }

  const resultadosOficiais = [];
  for (let i = 1; i <= jogosAtuaisSalvos.length; i++) {
    const gc = document.getElementById(`gols_j${i}_casa`);
    const gv = document.getElementById(`gols_j${i}_vis`);
    if (gc && gv) {
      if (gc.value === "" || gv.value === "") {
        window.Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha todos os placares oficiais!' });
        return;
      }
      resultadosOficiais.push({ id: i - 1, golsCasa: parseInt(gc.value), golsVisitante: parseInt(gv.value) });
    }
  }

  try {
    window.Swal.showLoading();
    const docRodadaRef = doc(db, "apuracao_rodada", rodadaSelecionadaGlobal);
    const docRodadaSnap = await getDoc(docRodadaRef);

    if (!docRodadaSnap.exists()) {
      window.Swal.fire({ icon: 'info', title: 'Info', text: 'Nenhum bilhete nesta rodada ainda.' });
      return;
    }

    const mapaRodadaCompleto = docRodadaSnap.data();
    const chavesUsuarios = Object.keys(mapaRodadaCompleto);

    // 1. EXECUTA O SEU CÁLCULO ORIGINAL DA RODADA ISOLADA
    chavesUsuarios.forEach((usuario) => {
      const dadosUser = mapaRodadaCompleto[usuario];
      if (!dadosUser.bilhetes || !Array.isArray(dadosUser.bilhetes)) return;

      let totalPlacaresExatos = 0;
      let totalTendencias = 0;

      dadosUser.bilhetes.forEach((bilhete) => {
        if (bilhete.palpites && Array.isArray(bilhete.palpites)) {
          bilhete.palpites.forEach((palpite) => {
            const jogoReal = resultadosOficiais.find(r => r.id === palpite.id);
            if (jogoReal) {
              const gcReal = jogoReal.golsCasa;
              const gvReal = jogoReal.golsVisitante;
              const [gcPalpite, gvPalpite] = palpite.placar.split("x").map(n => parseInt(n.trim()));

              if (gcReal === gcPalpite && gvReal === gvPalpite) {
                palpite.validacao = "✔️";
                totalPlacaresExatos++;
              } else {
                const ganhouCasaReal = gcReal > gvReal;
                const ganhouCasaPalpite = gcPalpite > gvPalpite;
                const empateReal = gcReal === gvReal;
                const empatePalpite = gcPalpite === gvPalpite;

                if ((ganhouCasaReal && ganhouCasaPalpite) || 
                    (!ganhouCasaReal && !ganhouCasaPalpite && !empateReal && !empatePalpite) || 
                    (empateReal && empatePalpite)) {
                  palpite.validacao = "🟡";
                  totalTendencias++;
                } else {
                  palpite.validacao = "❌";
                }
              }
            }
          });
        }
      });

      dadosUser.placaresExatos = totalPlacaresExatos;
      dadosUser.tendencias = totalTendencias;
      dadosUser.pontos = (totalPlacaresExatos * 10) + (totalTendencias * 5);
    });

    // Salva os resultados calculados da rodada atual
    await setDoc(docRodadaRef, mapaRodadaCompleto);

    // =========================================================================
    // NOVO: ATUALIZAÇÃO AUTOMÁTICA E ATÔMICA DO RANKING GERAL (BLINDADA)
    // =========================================================================
    
    // Lista tratada para a transação do Ranking Geral
    const usuariosParaRanking = chavesUsuarios
      .filter(chave => typeof mapaRodadaCompleto[chave] === 'object' && mapaRodadaCompleto[chave] !== null)
      .map(chave => ({
        idUsuario: chave,
        pontos: Number(mapaRodadaCompleto[chave].pontos || 0),
        placaresExatos: Number(mapaRodadaCompleto[chave].placaresExatos || 0),
        tendencias: Number(mapaRodadaCompleto[chave].tendencias || 0)
      }));

    const controleRef = doc(db, "ranking", "_controle_rodadas");

    // Executa a transação atômica
    await runTransaction(db, async (transaction) => {
      // LEITURA 1: Verifica duplicidade da rodada corrente
      const controleSnap = await transaction.get(controleRef);
      let rodadasProcessadas = [];
      
      if (controleSnap.exists()) {
        rodadasProcessadas = controleSnap.data().processadas || [];
      }

      if (rodadasProcessadas.includes(rodadaSelecionadaGlobal)) {
        throw new Error(`A rodada "${rodadaSelecionadaGlobal.toUpperCase()}" já foi acumulada no Ranking Geral anteriormente!`);
      }

      // LEITURA 2: Captura os saldos atuais de todos os jogadores de uma só vez
      const leiturasUsuarios = [];
      for (const user of usuariosParaRanking) {
        const userRef = doc(db, "ranking", user.idUsuario);
        leiturasUsuarios.push({
          ref: userRef,
          novosDados: user,
          snap: await transaction.get(userRef)
        });
      }

      // ESCRITA 1: Executa os incrementos matemáticos cumulativos
      for (const item of leiturasUsuarios) {
        if (item.snap.exists()) {
          const dadosAtuais = item.snap.data();
          transaction.update(item.ref, {
            pontos: Number(dadosAtuais.pontos || 0) + item.novosDados.pontos,
            placaresExatos: Number(dadosAtuais.placaresExatos || 0) + item.novosDados.placaresExatos,
            tendencias: Number(dadosAtuais.tendencias || 0) + item.novosDados.tendencias
          });
        } else {
          transaction.set(item.ref, {
            pontos: item.novosDados.pontos,
            placaresExatos: item.novosDados.placaresExatos,
            tendencias: item.novosDados.tendencias
          });
        }
      }

      // ESCRITA 2: Registra o ID da rodada como liquidada e bloqueada
      rodadasProcessadas.push(rodadaSelecionadaGlobal);
      if (!controleSnap.exists()) {
        transaction.set(controleRef, { processadas: rodadasProcessadas });
      } else {
        transaction.update(controleRef, { processadas: rodadasProcessadas });
      }
    });

    window.Swal.fire({ 
      icon: 'success', 
      title: 'Sucesso Total!', 
      text: `A ${rodadaSelecionadaGlobal.toUpperCase()} foi apurada e os pontos foram somados com segurança ao Ranking Geral!` 
    });

  } catch (error) {
    console.error(error);
    window.Swal.fire({ 
      icon: 'error', 
      title: 'Aviso de Processamento', 
      text: error.message || "Erro desconhecido ao processar o ranking." 
    });
  }
}

function renderizarTabelaAcumulado(participantes) {
  const tbody = document.getElementById("corpoTabelaAcumulado");
  if (!tbody) return;
  tbody.innerHTML = "";

  participantes.sort((a, b) => (b.pontos || 0) - (a.pontos || 0));

  participantes.forEach((p) => {
    const tr = document.createElement("tr");
    tr.className = "linha-clicavel";
    tr.innerHTML = `
      <td><span class="text-white fw-medium"><i class="fas fa-user me-2 text-muted"></i>${p.usuario}</span></td>
      <td class="text-center"><span class="badge bg-success">${p.placaresExatos || 0} P.E</span></td>
      <td class="text-center"><span class="badge bg-secondary">${p.tendencias || 0} T</span></td>
      <td class="text-center text-success fw-bold">${p.pontos || 0} pts</td>
    `;
    tr.addEventListener("click", () => exibirModalBilhetes(p));
    tbody.appendChild(tr);
  });
}

function exibirModalBilhetes(dadosUsuario) {
  const titulo = document.getElementById("modalTituloUser");
  const corpo = document.getElementById("modalCorpoBilhetes");

  if (titulo) titulo.innerText = `Bilhetes de: ${dadosUsuario.usuario}`;
  if (!corpo) return;
  corpo.innerHTML = "";

  let htmlModal = "";

  // CORREÇÃO: Renderiza caixas separadas visualmente para CADA bilhete da prancheta
  dadosUsuario.bilhetes.forEach((bilhete, idx) => {
    htmlModal += `
      <div class="p-3 mb-4 border border-secondary rounded bg-dark">
          <div class="d-flex justify-content-between border-bottom border-secondary pb-2 mb-2">
              <span class="text-warning fw-bold">BILHETE #${idx + 1}</span>
          </div>
    `;

    if (bilhete.palpites && Array.isArray(bilhete.palpites)) {
      bilhete.palpites.forEach((palpite) => {
        htmlModal += `
            <div class="d-flex justify-content-between align-items-center border-bottom border-light border-opacity-10 py-2">
                <div class="text-white text-uppercase small">
                    ${palpite.timeCasa} <span class="text-muted">x</span> ${palpite.timeVisitante}
                </div>
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-warning">[ ${palpite.placar} ]</span>
                    <span class="fw-bold fs-5">${palpite.validacao || "❌"}</span>
                </div>
            </div>
        `;
      });
    }

    htmlModal += `</div>`;
  });

  corpo.innerHTML = htmlModal;

  const modalBootstrap = new window.bootstrap.Modal(document.getElementById('modalBilhetesUser'));
  modalBootstrap.show();
}

/* ============================
   NOVO MÓDULO: Histórico de Bilhetes
   ============================ */

/**
 * Carrega todos os documentos da coleção "historico_usuario" uma única vez,
 * popula o select de usuários e mantém os dados em `historicoCache`.
 * Não altera estrutura de documentos.
 */
async function carregarHistorico() {
  try {
    const snapshot = await getDocs(collection(db, "historico_usuario"));
    historicoCache = [];

    snapshot.forEach((docSnap) => {
      const raw = docSnap.data();
      const id = docSnap.id;

      // Parse robusto de data
      let parsedDate = null;
      const rawDate = raw.data ?? raw.dataHora ?? raw.timestamp ?? raw.createdAt ?? raw.date;
      if (rawDate) {
        if (typeof rawDate === "object" && rawDate.seconds) {
          parsedDate = new Date(rawDate.seconds * 1000);
        } else {
          parsedDate = new Date(String(rawDate));
        }
      } else {
        parsedDate = new Date();
      }

      // Lê diretamente o campo interno 'usuario' enviado pelo backend
      historicoCache.push({
        id,
        usuario: raw.usuario || raw.user || "Desconhecido",
        dataRaw: rawDate,
        dataParsed: parsedDate,
        rodada: raw.rodada || "",
        palpites: Array.isArray(raw.palpites) ? raw.palpites : [],
        resultado: raw.resultado ?? null,
        rawDoc: raw
      });
    });

    // Ordena do mais recente para o mais antigo
    historicoCache.sort((a, b) => b.dataParsed - a.dataParsed);

    // Preenche select de usuários e renderiza a lista na tabela
    carregarUsuarios();
    filtrarHistorico();
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
    const tbody = document.getElementById("tbodyHistorico");
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-warning">Erro ao carregar histórico.</td></tr>';
  }
}

/**
 * Carrega todos os usuários distintos da coleção historico_usuario e popula o select.
 * A primeira opção será "Todos os usuários".
 */
function carregarUsuarios() {
  const select = document.getElementById("selectUsuarioHistorico");
  if (!select) return;

  const usuariosSet = new Set();
  historicoCache.forEach((item) => {
    if (item.usuario) usuariosSet.add(item.usuario);
  });

  const usuarios = Array.from(usuariosSet).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

  select.innerHTML = `<option value="">Todos os usuários</option>`;
  usuarios.forEach((u) => {
    select.innerHTML += `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`;
  });
}

/**
 * Aplica os filtros selecionados (usuario + intervalo de datas) sobre historicoCache,
 * agrupa os resultados APENAS por usuário (independente da rodada) para apresentar
 * a "Quantidade de Bilhetes" total do usuário e renderiza a tabela.
 */
function filtrarHistorico() {
  const select = document.getElementById("selectUsuarioHistorico");
  const dataInicial = document.getElementById("dataInicialHistorico");
  const dataFinal = document.getElementById("dataFinalHistorico");
  const tbody = document.getElementById("tbodyHistorico");
  if (!tbody) return;

  const usuarioFiltro = select ? select.value : "";
  
  const dataIniVal = dataInicial && dataInicial.value ? new Date(dataInicial.value + "T00:00:00") : null;
  const dataFimVal = dataFinal && dataFinal.value ? new Date(dataFinal.value + "T23:59:59") : null;

  let filtrados = historicoCache.filter((item) => {
    // Filtro de usuário
    if (usuarioFiltro && item.usuario !== usuarioFiltro) return false;

    // Filtro de data inicial
    if (dataIniVal && item.dataParsed < dataIniVal) return false;

    // Filtro de data final
    if (dataFimVal && item.dataParsed > dataFimVal) return false;

    return true;
  });

  // Agrupar estritamente por USUÁRIO
  const map = new Map();
  filtrados.forEach((item) => {
    const key = item.usuario; // Chave única é apenas o nome do usuário

    if (!map.has(key)) {
      map.set(key, {
        usuario: item.usuario,
        docs: [item],
        latestDate: item.dataParsed
      });
    } else {
      const g = map.get(key);
      g.docs.push(item);
      if (item.dataParsed > g.latestDate) g.latestDate = item.dataParsed;
    }
  });

  historicoGrupos = Array.from(map.values()).sort((a, b) => b.latestDate - a.latestDate);

  if (historicoGrupos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum registro encontrado para os filtros aplicados.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  historicoGrupos.forEach((g, idx) => {
    const dataStr = formatDate(g.latestDate);
    const horaStr = formatTime(g.latestDate);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-white">${escapeHtml(g.usuario)}</td>
      <td class="text-center">${g.docs.length}</td>
      <td>${dataStr}</td>
      <td>${horaStr}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-light" data-idx="${idx}"><i class="fas fa-eye"></i> Visualizar</button>
      </td>
    `;
    const btn = tr.querySelector("button");
    if (btn) btn.addEventListener("click", () => abrirModalHistorico(idx));
    tbody.appendChild(tr);
  });
}

/**
 * Abre um modal exibindo todos os bilhetes do usuário selecionado
 */
function abrirModalHistorico(idx) {
  const grupo = historicoGrupos[idx];
  if (!grupo) return;

  const titulo = document.getElementById("modalTituloHistorico");
  const corpo = document.getElementById("modalCorpoHistorico");
  if (titulo) titulo.innerText = `Histórico - ${grupo.usuario}`;
  if (!corpo) return;

  let html = '';
  html += `<div class="mb-3"><strong>Usuário:</strong> ${escapeHtml(grupo.usuario)}</div>`;

  grupo.docs.forEach((docItem, idxDoc) => {
    html += `
      <div class="p-3 mb-3 border border-secondary rounded bg-dark">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div><span class="text-warning fw-bold">BILHETE #${idxDoc + 1}</span></div>
          <div class="text-muted small">${formatDate(docItem.dataParsed)} ${formatTime(docItem.dataParsed)}</div>
        </div>
    `;

    if (Array.isArray(docItem.palpites) && docItem.palpites.length > 0) {
      docItem.palpites.forEach((palpite) => {
        const placar = palpite.placar || (palpite.golsCasa !== undefined && palpite.golsVisitante !== undefined ? `${palpite.golsCasa}x${palpite.golsVisitante}` : "-");
        const timeCasa = palpite.timeCasa || palpite.casa || "";
        const timeVisitante = palpite.timeVisitante || palpite.visitante || "";
        
        html += `
          <div class="d-flex justify-content-between align-items-center border-bottom border-light border-opacity-10 py-2">
            <div class="text-white small text-uppercase">${escapeHtml(timeCasa)} <span class="text-muted">x</span> ${escapeHtml(timeVisitante)}</div>
            <div class="d-flex align-items-center gap-3">
              <span class="fw-bold text-warning">Palpite: ${escapeHtml(String(placar))}</span>
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="text-muted small">Sem palpites registrados neste bilhete.</div>`;
    }

    if (docItem.resultado) {
      html += `<div class="mt-2 text-muted small"><strong>Resultado oficial:</strong> ${escapeHtml(String(docItem.resultado))}</div>`;
    }

    html += `</div>`;
  });

  corpo.innerHTML = html;

  const modalBootstrap = new window.bootstrap.Modal(document.getElementById('modalHistoricoDetalhes'));
  modalBootstrap.show();
}

/**
 * Gera um PDF A4 com o histórico atual (respeitando filtros aplicados).
 * Utiliza jsPDF + autoTable. Inclui logo, título, data de emissão, filtros e lista de bilhetes.
 */
async function gerarPDFHistorico() {
  try {
    // Use the grouped results currently displayed
    const grupos = historicoGrupos.slice(); // copy

    // Setup jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 40;

    // Carregar logo em dataURL se possível
    let logoDataUrl = null;
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = "../img/logo_site_camisa_10.png";
      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = () => res(); // continue without logo on error
      });
      if (img && img.complete && img.naturalWidth) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL("image/png");
      }
    } catch (err) {
      console.warn("Logo não pôde ser carregada para PDF:", err);
    }

    // Header: logo + title
    if (logoDataUrl) {
      const imgProps = doc.getImageProperties(logoDataUrl);
      const imgWidth = 80;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      doc.addImage(logoDataUrl, 'PNG', margin, y, imgWidth, imgHeight);
    }

    doc.setFontSize(16);
    doc.setTextColor(10, 10, 10);
    doc.text("Histórico Administrativo de Bilhetes", margin + (logoDataUrl ? 100 : 0), y + 20);
    y += 50;

    doc.setFontSize(10);
    const hojeStr = new Date().toLocaleString('pt-BR');
    const usuarioFiltro = (document.getElementById("selectUsuarioHistorico") && document.getElementById("selectUsuarioHistorico").value) || "";
    const dataIni = document.getElementById("dataInicialHistorico") && document.getElementById("dataInicialHistorico").value ? document.getElementById("dataInicialHistorico").value : "";
    const dataFim = document.getElementById("dataFinalHistorico") && document.getElementById("dataFinalHistorico").value ? document.getElementById("dataFinalHistorico").value : "";

    doc.text(`Data de emissão: ${hojeStr}`, margin, y);
    doc.text(`Usuário: ${usuarioFiltro || "Todos"}`, margin + 250, y);
    y += 18;
    doc.text(`Período pesquisado: ${dataIni || "-"} até ${dataFim || "-"}`, margin, y);
    y += 18;

    // Agora listamos os bilhetes; usaremos autoTable para layout da listagem (mas com custom rows para palpites)
    // Para cada grupo vamos adicionar um bloco com os bilhetes
    for (let gIndex = 0; gIndex < grupos.length; gIndex++) {
      const g = grupos[gIndex];

      // Se y estiver perto do bottom, adicionar página
      if (y > doc.internal.pageSize.getHeight() - 120) {
        addFooter(doc);
        doc.addPage();
        y = 40;
      }

      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text(`${g.usuario} — Rodada: ${g.rodada || "-"}`, margin, y);
      y += 14;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Data (último bilhete): ${formatDate(g.latestDate)} ${formatTime(g.latestDate)} — Bilhetes: ${g.docs.length}`, margin, y);
      y += 12;

      // Para cada bilhete/Documento dentro do grupo, adicionar seu conteúdo
      for (let d = 0; d < g.docs.length; d++) {
        const docItem = g.docs[d];

        // Verificar espaço e pular página se necessário
        if (y > doc.internal.pageSize.getHeight() - 120) {
          addFooter(doc);
          doc.addPage();
          y = 40;
        }

        doc.setDrawColor(160);
        doc.setFillColor(245);
        // Título do bilhete
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text(`BILHETE #${d + 1} — ${formatDate(docItem.dataParsed)} ${formatTime(docItem.dataParsed)}`, margin + 6, y);
        y += 12;

        // Palpites list
        if (Array.isArray(docItem.palpites) && docItem.palpites.length > 0) {
          for (let p = 0; p < docItem.palpites.length; p++) {
            const pal = docItem.palpites[p];
            const timeCasa = pal.timeCasa || pal.casa || "";
            const timeVis = pal.timeVisitante || pal.visitante || "";
            const placar = pal.placar || (pal.golsCasa !== undefined && pal.golsVisitante !== undefined ? `${pal.golsCasa}x${pal.golsVisitante}` : "-");
            const validacao = pal.validacao || "";

            // Linha do palpite
            doc.setFontSize(10);
            doc.setTextColor(30);
            const line = `${timeCasa} x ${timeVis} — Palpite: ${placar} ${validacao ? " — " + validacao : ""}`;
            const split = doc.splitTextToSize(line, pageWidth - margin*2 - 20);
            doc.text(split, margin + 12, y);
            y += split.length * 12;
          }
        } else {
          doc.setFontSize(10);
          doc.setTextColor(100);
          doc.text("Sem palpites registrados neste bilhete.", margin + 12, y);
          y += 12;
        }

        if (docItem.resultado) {
          doc.setFontSize(10);
          doc.setTextColor(90);
          doc.text(`Resultado oficial: ${String(docItem.resultado)}`, margin + 12, y);
          y += 12;
        }

        // separator
        doc.setDrawColor(120);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
      }

      y += 6;
    }

    // Footer & page numbers
    addFooter(doc);

    // Save
    doc.save(`historico_bilhetes_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    window.Swal.fire({ icon: "error", title: "Erro", text: "Falha ao gerar PDF." });
  }
}

/**
 * Limpa filtros e recarrega a tabela completa.
 */
function limparFiltros() {
  const select = document.getElementById("selectUsuarioHistorico");
  const dataInicial = document.getElementById("dataInicialHistorico");
  const dataFinal = document.getElementById("dataFinalHistorico");

  if (select) select.value = "";
  if (dataInicial) dataInicial.value = "";
  if (dataFinal) dataFinal.value = "";

  filtrarHistorico();
}

/* ============= auxiliares ============= */

function formatDate(d) {
  if (!d) return "-";
  try {
    return d.toLocaleDateString('pt-BR');
  } catch (e) {
    return String(d);
  }
}
function formatTime(d) {
  if (!d) return "-";
  try {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(d);
  }
}
function escapeHtml(text) {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120);
    const text = `Camisa 10 • Histórico Administrativo`;
    doc.text(text, 40, pageHeight - 30);
    const pageStr = `Página ${i} / ${pageCount}`;
    doc.text(pageStr, pageWidth - 40 - doc.getTextWidth(pageStr), pageHeight - 30);
  }
}

/* ============================
   FIM NOVO MÓDULO
   ============================ */

/* ============================================================
   NOVO MÓDULO: 🏠 Gerenciar Index
   Centraliza no Dashboard: contador de rodadas, banner principal
   e últimos ganhadores exibidos no index.html — tudo via Firestore.
   ============================================================ */

let ganhadorEditandoId = null;

/**
 * Carrega as configurações atuais do index (rodada atual, total de
 * rodadas e URL do banner) a partir de configuracoes/index_site.
 */
async function carregarConfigIndex() {
  try {
    const docSnap = await getDoc(doc(db, "configuracoes", "index_site"));
    if (docSnap.exists()) {
      const dados = docSnap.data();

      if (document.getElementById("rodadaAtualIndex"))
        document.getElementById("rodadaAtualIndex").value = dados.rodadaAtual ?? "";

      if (document.getElementById("totalRodadasIndex"))
        document.getElementById("totalRodadasIndex").value = dados.totalRodadas ?? "";

      if (document.getElementById("bannerUrlIndex"))
        document.getElementById("bannerUrlIndex").value = dados.bannerUrl ?? "";
    }
  } catch (err) {
    console.error("Erro ao carregar configurações do Index:", err);
  }
}

/**
 * Salva rodada atual, total de rodadas e URL do banner em
 * configuracoes/index_site. O index.html lê esse documento em tempo real.
 */
async function salvarConfigIndex() {
  const inputRodadaAtual = document.getElementById("rodadaAtualIndex");
  const inputTotalRodadas = document.getElementById("totalRodadasIndex");
  const inputBannerUrl = document.getElementById("bannerUrlIndex");

  const rodadaAtual = inputRodadaAtual ? parseInt(inputRodadaAtual.value, 10) : null;
  const totalRodadas = inputTotalRodadas ? parseInt(inputTotalRodadas.value, 10) : null;
  const bannerUrl = inputBannerUrl ? inputBannerUrl.value.trim() : "";

  try {
    await setDoc(doc(db, "configuracoes", "index_site"), {
      rodadaAtual: Number.isFinite(rodadaAtual) ? rodadaAtual : 0,
      totalRodadas: Number.isFinite(totalRodadas) ? totalRodadas : 0,
      bannerUrl: bannerUrl
    }, { merge: true });

    window.Swal.fire({ icon: "success", title: "Salvo com Sucesso!", text: "As configurações do Index foram atualizadas." });
  } catch (err) {
    console.error("Erro ao salvar configurações do Index:", err);
    window.Swal.fire({ icon: "error", title: "Erro", text: "Falha ao salvar as configurações do Index." });
  }
}

/**
 * Escuta em tempo real a coleção "ganhadores" e renderiza a tabela
 * de administração na aba 🏠 Gerenciar Index.
 */
function carregarGanhadoresAdmin() {
  const tbody = document.getElementById("tbodyGanhadoresAdmin");
  if (!tbody) return;

  try {
    const q = query(collection(db, "ganhadores"), orderBy("criadoEm", "desc"));
    onSnapshot(q, (querySnapshot) => {
      tbody.innerHTML = "";

      if (querySnapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum ganhador cadastrado ainda.</td></tr>';
        return;
      }

      querySnapshot.forEach((docSnap) => {
        const g = docSnap.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(g.nome || "")}</td>
          <td>${escapeHtml(g.premiacao || "")}</td>
          <td>${escapeHtml(g.descricao || "")}</td>
          <td>${escapeHtml(g.valor || "")}</td>
          <td class="text-center">
            <button type="button" class="btn btn-outline-light btn-sm me-1 btn-editar-ganhador" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-excluir-ganhador" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;
        tr.querySelector(".btn-editar-ganhador").addEventListener("click", () => editarGanhador(docSnap.id, g));
        tr.querySelector(".btn-excluir-ganhador").addEventListener("click", () => excluirGanhador(docSnap.id));
        tbody.appendChild(tr);
      });
    }, (err) => {
      console.error("Erro ao escutar ganhadores:", err);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar ganhadores.</td></tr>';
    });
  } catch (err) {
    console.error("Erro ao carregar ganhadores:", err);
  }
}

/**
 * Cria um novo ganhador ou atualiza um existente (quando
 * ganhadorEditandoId está definido) na coleção "ganhadores".
 */
async function salvarGanhador() {
  const nome = document.getElementById("ganhadorNome").value.trim();
  const premiacao = document.getElementById("ganhadorPremiacao").value.trim();
  const descricao = document.getElementById("ganhadorDescricao").value.trim();
  const valor = document.getElementById("ganhadorValor").value.trim();

  if (!nome || !premiacao) {
    window.Swal.fire({ icon: "warning", title: "Atenção", text: "Preencha ao menos Nome e Premiação." });
    return;
  }

  const dadosGanhador = { nome, premiacao, descricao, valor };

  try {
    if (ganhadorEditandoId) {
      await updateDoc(doc(db, "ganhadores", ganhadorEditandoId), dadosGanhador);
      window.Swal.fire({ icon: "success", title: "Ganhador atualizado!" });
    } else {
      dadosGanhador.criadoEm = serverTimestamp();
      await addDoc(collection(db, "ganhadores"), dadosGanhador);
      window.Swal.fire({ icon: "success", title: "Ganhador adicionado!" });
    }
    cancelarEdicaoGanhador();
  } catch (err) {
    console.error("Erro ao salvar ganhador:", err);
    window.Swal.fire({ icon: "error", title: "Erro", text: "Falha ao salvar o ganhador." });
  }
}

/**
 * Preenche o formulário com os dados de um ganhador para edição.
 */
function editarGanhador(id, dados) {
  ganhadorEditandoId = id;

  document.getElementById("ganhadorEditandoId").value = id;
  document.getElementById("ganhadorNome").value = dados.nome || "";
  document.getElementById("ganhadorPremiacao").value = dados.premiacao || "";
  document.getElementById("ganhadorDescricao").value = dados.descricao || "";
  document.getElementById("ganhadorValor").value = dados.valor || "";

  const btnSalvar = document.getElementById("btnSalvarGanhador");
  if (btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-check"></i>';

  const containerCancelar = document.getElementById("containerCancelarEdicaoGanhador");
  if (containerCancelar) containerCancelar.style.display = "block";
}

/**
 * Cancela a edição em andamento e limpa o formulário de ganhadores.
 */
function cancelarEdicaoGanhador() {
  ganhadorEditandoId = null;

  const form = document.getElementById("formGanhador");
  if (form) form.reset();
  document.getElementById("ganhadorEditandoId").value = "";

  const btnSalvar = document.getElementById("btnSalvarGanhador");
  if (btnSalvar) btnSalvar.innerHTML = '<i class="fas fa-plus"></i>';

  const containerCancelar = document.getElementById("containerCancelarEdicaoGanhador");
  if (containerCancelar) containerCancelar.style.display = "none";
}

/**
 * Remove um ganhador da coleção "ganhadores" após confirmação.
 */
async function excluirGanhador(id) {
  const confirmacao = await window.Swal.fire({
    icon: "warning",
    title: "Excluir ganhador?",
    text: "Esta ação não pode ser desfeita.",
    showCancelButton: true,
    confirmButtonText: "Sim, excluir",
    cancelButtonText: "Cancelar"
  });

  if (!confirmacao.isConfirmed) return;

  try {
    await deleteDoc(doc(db, "ganhadores", id));
    window.Swal.fire({ icon: "success", title: "Ganhador excluído!" });
    if (ganhadorEditandoId === id) cancelarEdicaoGanhador();
  } catch (err) {
    console.error("Erro ao excluir ganhador:", err);
    window.Swal.fire({ icon: "error", title: "Erro", text: "Falha ao excluir o ganhador." });
  }
}

/* ============================
   FIM NOVO MÓDULO: 🏠 Gerenciar Index
   ============================ */