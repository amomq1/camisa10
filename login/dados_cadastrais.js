import { auth, db } from "../firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// ==========================
// FUNÇÕES DE VALIDAÇÃO (CADASTRO)
// ==========================

function validarUsuario(input) {
    // REGRA 3: Limpeza automática de espaços no início e no final enquanto digita
    let valorOriginal = input.value;
    
    // Se o usuário digitou espaços na extremidade, removemos e atualizamos o campo
    if (valorOriginal.startsWith(' ') || valorOriginal.endsWith(' ')) {
        input.value = valorOriginal.trim();
    }

    const valor = input.value;
    let mensagemErro = "";

    // Regex que valida apenas letras (sem ç), números, pontos, underlines e hifens
    // Se houver qualquer caractere inválido ou se contiver ".com"
    const regexPermitidos = /^[a-zA-Z0-9._-]+$/;

    if (valor.length > 0) {
        if (valor.includes(".com")) {
            mensagemErro = ".com não é permitido no nome de usuário.";
        } else if (!regexPermitidos.test(valor)) {
            // Identifica o erro de forma amigável baseado no que o usuário digitou
            if (/[À-ÿçÇ]/.test(valor)) {
                mensagemErro = "Acentos não são permitidos.";
            } else if (/\s/.test(valor)) {
                mensagemErro = "Espaços não são permitidos.";
            } else if (valor.includes("@")) {
                mensagemErro = "O caractere @ não é permitido.";
            } else {
                mensagemErro = "Apenas letras, números, '.', '_' e '-' são permitidos.";
            }
        }
    }

    // FEEDBACK VISUAL
    let elementoErro = document.getElementById("erro-cadUsuario");
    
    if (mensagemErro) {
        input.style.borderColor = "red"; // Adiciona borda vermelha
        
        // Cria o elemento de erro dinamicamente se não existir
        if (!elementoErro) {
            elementoErro = document.createElement("p");
            elementoErro.id = "erro-cadUsuario";
            elementoErro.style.color = "red";
            elementoErro.style.fontSize = "12px";
            elementoErro.style.marginTop = "5px";
            elementoErro.style.textAlign = "left";
            input.parentNode.insertBefore(elementoErro, input.nextSibling);
        }
        elementoErro.textContent = mensagemErro;
        return false;
    } else {
        // Remove automaticamente o erro quando o valor voltar a ser válido
        input.style.borderColor = "";
        if (elementoErro) {
            elementoErro.remove();
        }
        return true;
    }
}
// CADASTRO
async function cadastrar() {
    const inputUsuario = document.getElementById("cadUsuario");
    
    // REGRA 3 (Garantia final): Garante a limpeza de espaços antes da submissão final
    inputUsuario.value = inputUsuario.value.trim();

    // VALIDAÇÃO FINAL: Verifica todas as regras antes de enviar
    const usuarioValido = validarUsuario(inputUsuario);
    if (!usuarioValido) {
        return; // Impede o envio do formulário
    }

    const usuario = inputUsuario.value;
    const senha = document.getElementById("cadSenha").value;
    const instagram = document.getElementById("cadInstagram").value.trim();
    const telefone = document.getElementById("cadTelefone").value.trim();

    // Validação dos campos obrigatórios
    if (!usuario || !senha || !telefone) {
        window.Swal.fire({
            icon: "warning",
            title: "Campos obrigatórios",
            text: "Preencha Usuário, Senha e Telefone para continuar."
        });
        return;
    }

    // Validação da caixinha de termos (obrigatória)
    const checkboxTermos = document.getElementById("cadTermos");
    if (!checkboxTermos || !checkboxTermos.checked) {
        window.Swal.fire({
            icon: "warning",
            title: "Termos não aceitos",
            text: "Você precisa confirmar que possui 18 anos ou mais e aceitar os termos para se cadastrar."
        });
        return;
    }

    const email = usuario + "@camisa10.app";

    try {
        await createUserWithEmailAndPassword(auth, email, senha);

        await setDoc(doc(db, "usuarios", usuario), {
            usuario: usuario,
            instagram: instagram,
            telefone: telefone
        });
        
        inputUsuario.value = "";
        document.getElementById("cadSenha").value = "";
        document.getElementById("cadInstagram").value = "";
        document.getElementById("cadTelefone").value = "";
        checkboxTermos.checked = false;

        window.location.href = "./login.html";

    } catch (erro) {
        if (erro.code === "auth/email-already-in-use") {
            window.Swal.fire({
                icon: "error",
                title: "Erro",
                text: "Este usuário já está cadastrado."
            });
        } else {
            console.error(erro);
            window.Swal.fire({
                icon: "error",
                title: "Erro",
                text: "Erro ao cadastrar."
            });
        }
    }
}

// LOGIN
async function login() {
    const usuario = document.getElementById("loginUsuario").value.trim();
    const senha = document.getElementById("loginSenha").value;

    const email = usuario + "@camisa10.app";

    try {
        await signInWithEmailAndPassword(auth, email, senha);

        const docSnap = await getDoc(doc(db, "usuarios", usuario));

        if (docSnap.exists()) {
            localStorage.setItem("usuarioLogado", usuario);
            window.location.href = "../index.html";
        } else {
            await auth.signOut();
            // LOGIN: Modal customizado para Usuário não encontrado
            window.Swal.fire({
                icon: "error",
                title: "Erro de Autenticação",
                text: "Usuário não encontrado."
            });
        }

    } catch (erro) {
        console.error(erro);
        let mensagemErro = "Não foi possível realizar o login.";

        // LOGIN: Captura e trata os retornos do Firebase com mensagens amigáveis em Modais
        if (erro.code === "auth/wrong-password" || erro.code === "auth/invalid-credential") {
            mensagemErro = "Senha incorreta.";
        } else if (erro.code === "auth/user-not-found") {
            mensagemErro = "Usuário não encontrado.";
        } else if (erro.code === "auth/invalid-email") {
            mensagemErro = "Credenciais inválidas.";
        }

        window.Swal.fire({
            icon: "error",
            title: "Erro de Autenticação",
            text: mensagemErro
        });
    }
}

// Mapeia os escopos modulares para o acesso inline do HTML onclick
window.cadastrar = cadastrar;
window.login = login;

// ==========================
// LÓGICA DO OLHINHO (MOSTRAR/ESCONDER SENHA)
// ==========================
function configurarOlhinho(idIcone, idInput) {
    const icone = document.getElementById(idIcone);
    const input = document.getElementById(idInput);

    if (icone && input) {
        icone.addEventListener("click", () => {
            if (input.type === "password") {
                input.type = "text";
                icone.classList.remove("fa-eye-slash");
                icone.classList.add("fa-eye");
            } else {
                input.type = "password";
                icone.classList.remove("fa-eye");
                icone.classList.add("fa-eye-slash");
            }
        });
    }
}

// ==========================
// LÓGICA DO MODAL DE TERMOS
// ==========================
function configurarModalTermos() {
    const botaoAbrir = document.getElementById("abrirTermos");
    const modal = document.getElementById("modalTermos");
    const botaoFecharX = document.getElementById("fecharTermos");
    const botaoFecharBaixo = document.getElementById("fecharTermosBtn");

    if (!modal) return;

    const abrirModal = () => modal.classList.add("ativo");
    const fecharModal = () => modal.classList.remove("ativo");

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrirModal);
    if (botaoFecharX) botaoFecharX.addEventListener("click", fecharModal);
    if (botaoFecharBaixo) botaoFecharBaixo.addEventListener("click", fecharModal);

    // Fecha o modal ao clicar fora da caixa de conteúdo
    modal.addEventListener("click", (evento) => {
        if (evento.target === modal) {
            fecharModal();
        }
    });
}

// Executa a configuração assim que a página carrega e liga os listeners de digitação
document.addEventListener("DOMContentLoaded", () => {
    configurarOlhinho("toggleSenhaLogin", "loginSenha");
    configurarOlhinho("toggleSenhaCad", "cadSenha");
    configurarModalTermos();

    // Adiciona a validação em tempo real no campo de Usuário do Cadastro
    const inputUsuario = document.getElementById("cadUsuario");
    if (inputUsuario) {
        inputUsuario.addEventListener("input", () => validarUsuario(inputUsuario));
    }
});