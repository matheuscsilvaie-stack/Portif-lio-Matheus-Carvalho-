# Portfólio — Matheus Carvalho do Nascimento Silva

Portfólio profissional voltado para a área de Tecnologia da Informação, desenvolvido em
HTML, CSS e JavaScript puros (sem frameworks).

🔗 Site: (adicione aqui o link do GitHub Pages depois de publicar)

## Sobre o projeto

Site pessoal com apresentação, conhecimentos técnicos (SAP, ABAP, bancos de dados, IA e
UX/UI), trajetória profissional — incluindo experiência internacional na Irlanda —,
formação em Análise e Desenvolvimento de Sistemas (ADS) e canais de contato. A seção de
projetos está preparada para ser preenchida futuramente, conforme novos projetos acadêmicos
e pessoais forem desenvolvidos.

## Tecnologias utilizadas

- **HTML5** — estrutura semântica e acessível
- **CSS3** — design system em variáveis (dark mode, tipografia, layout responsivo)
- **JavaScript (vanilla)** — menu mobile, destaque de navegação, animações de entrada e
  cópia rápida de e-mail/telefone
- **Google Fonts** — Space Grotesk, Inter e JetBrains Mono

Nenhuma dependência externa além das fontes; o projeto roda apenas com um navegador.

## Estrutura de arquivos

```
portfolio/
├── index.html      # estrutura e conteúdo do site
├── style.css        # design system e estilos
├── script.js        # interações (menu, scroll, cópia de contato)
└── README.md         # este arquivo
```

## Como executar localmente

1. Baixe ou clone este repositório.
2. Dê duplo clique no arquivo `index.html` — ou abra-o pelo navegador
   (`Arquivo > Abrir` / `Ctrl+O`).

Não é necessário nenhum servidor, build ou instalação de dependências.

Se preferir usar um servidor local simples (opcional, útil para testar em diferentes
dispositivos na mesma rede):

```bash
# Python 3
python -m http.server 8000

# depois acesse http://localhost:8000
```

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub chamado `matheus-carvalho-portfolio`.
2. No terminal, dentro da pasta do projeto, inicialize o repositório e envie os arquivos:

   ```bash
   git init
   git add .
   git commit -m "Primeira versão do portfólio"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/matheus-carvalho-portfolio.git
   git push -u origin main
   ```

   Substitua `SEU-USUARIO` pelo seu nome de usuário do GitHub.

3. No GitHub, acesse o repositório e vá em **Settings > Pages**.
4. Em **Build and deployment > Source**, selecione **Deploy from a branch**.
5. Em **Branch**, selecione `main` e a pasta `/ (root)`. Clique em **Save**.
6. Aguarde alguns instantes — o GitHub mostrará o link público do site, algo como:

   ```
   https://SEU-USUARIO.github.io/matheus-carvalho-portfolio/
   ```

7. Sempre que quiser atualizar o site, basta editar os arquivos, e depois:

   ```bash
   git add .
   git commit -m "Atualiza portfólio"
   git push
   ```

   O GitHub Pages atualiza automaticamente em poucos minutos.

## Projeto em destaque: MatheusFlow

Sistema pessoal para cadastrar clientes, registrar chamados de serviço e acompanhar seus status.
O protótipo está em `matheusflow/index.html` e utiliza HTML, CSS e JavaScript, com dados
armazenados localmente no navegador. O esquema inicial para PostgreSQL está em
`matheusflow/serviceflow.sql`; a API Node.js é uma etapa futura.

Use dados fictícios ao demonstrar o protótipo. A interface ainda não conecta ao banco SQL.

