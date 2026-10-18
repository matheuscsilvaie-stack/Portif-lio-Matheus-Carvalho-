# Portfólio — Matheus Silva

Portfólio pessoal desenvolvido em HTML, CSS e JavaScript.

## Conteúdo

- Página principal: `index.html`
- Cópia de origem: `portfolio.html`
- Projeto MatheusFlow: `Documentos/ServiceFlow/`
- Projeto MindFlow e outros materiais nas pastas correspondentes.

## MatheusFlow

Aplicação web para registrar clientes e chamados, acompanhar status e visualizar indicadores. O projeto inclui API em Python, persistência local SQLite, autenticação privada e configuração de hospedagem com PostgreSQL no Render.

Para usar localmente, abra um terminal na pasta `Documentos/ServiceFlow` e execute:

```sh
python3 server.py
```

No Windows, use `py server.py`. Depois acesse http://127.0.0.1:3000. Os chamados locais ficam no arquivo `serviceflow.db`.

A configuração de hospedagem está em `render.yaml`; os passos e variáveis de segurança estão em [Documentos/ServiceFlow/README.md](Documentos/ServiceFlow/README.md). O link do portfólio será direcionado ao painel hospedado quando o serviço privado estiver publicado. GitHub Pages não executa a API Python.

Não publique `serviceflow.db`, senhas, hashes, `SESSION_SECRET` ou `DATABASE_URL` no GitHub.
