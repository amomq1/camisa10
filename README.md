# ⚽ Camisa10

Sistema completo de Bolão Esportivo desenvolvido para gerenciamento de palpites, ranking de participantes e administração de rodadas.

O projeto foi desenvolvido utilizando HTML, CSS e JavaScript no frontend, Firebase para autenticação e banco de dados, Node.js no backend e integração com Mercado Pago para pagamentos via Pix.

---

## 📸 Demonstração

**Site:** *apostecamisa10.netlify.app*

**Backend:** https://camisa10-backend.onrender.com

---

# 🚀 Tecnologias

- HTML5
- CSS3
- JavaScript (ES6)
- Firebase Authentication
- Firebase Firestore
- Firebase Admin SDK
- Node.js
- Express
- Mercado Pago API
- Netlify
- Render
- Git
- GitHub

---

# ✨ Funcionalidades

### 👤 Usuários

- Cadastro
- Login
- Recuperação de conta
- Perfil do usuário

### ⚽ Palpites

- Cadastro de múltiplos bilhetes
- Entre 3 e 4 jogos por bilhete
- Validação automática
- Histórico de apostas

### 🏆 Ranking

- Ranking geral
- Pontuação acumulada
- Tendências
- Placares exatos

### 📊 Dashboard Administrativo

- Gerenciamento das rodadas
- Cadastro de partidas
- Alteração de escudos
- Alteração de banners
- Configuração de campeonatos
- Apuração dos resultados
- Histórico das rodadas

### 💰 Pagamentos

- Integração com Mercado Pago
- Pagamento via Pix
- Confirmação automática

---

# 🏗 Arquitetura

```
               GitHub
                  │
      ┌───────────┴───────────┐
      │                       │
   Netlify                 Render
 Frontend                 Backend
      │                       │
      └───────────┬───────────┘
                  │
            Firebase
       Authentication
          Firestore
                  │
            Mercado Pago
```

---

# 📂 Estrutura

```
camisa10/

dashboard/
historico/
login/
pag_palpites/
img/
info/

index.html
firebase.js
style.css
```

---

# 🔐 Segurança

O projeto utiliza:

- Firebase Authentication
- Firestore Security Rules
- Backend separado
- Variáveis de ambiente no Render
- Firebase Admin SDK
- Tokens privados protegidos

Nenhuma credencial sensível é armazenada no repositório.

---

# ⚙ Como executar

## Frontend

Basta publicar os arquivos em um servidor estático como:

- Netlify
- Vercel
- GitHub Pages

---

## Backend

É necessário configurar as variáveis de ambiente:

```
FIREBASE_SERVICE_ACCOUNT

MERCADO_PAGO_ACCESS_TOKEN

MERCADO_PAGO_COLLECTOR_ID

APP_URL
```

Depois executar:

```bash
npm install
npm start
```

---

# 📌 Objetivo

O Camisa10 foi criado para oferecer uma plataforma completa de bolão esportivo, permitindo que os participantes realizem palpites, acompanhem o ranking em tempo real e participem de competições organizadas de forma simples e segura.

---

# 👨‍💻 Desenvolvedor

**Amom Queiroz**

Tecnólogo em Análise e Desenvolvimento de Sistemas.

GitHub:
https://github.com/amomq1

---

## 📄 Licença

Projeto desenvolvido para fins de estudo, aprendizado e portfólio.
