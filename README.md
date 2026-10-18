# Portfólio — Matheus Silva

Portfólio pessoal desenvolvido em HTML, CSS e JavaScript.

## Conteúdo

- Página principal: `index.html`
- Cópia de origem: `portfolio.html`
- Projeto MatheusFlow: `Documentos/ServiceFlow/`
- Projeto MindFlow e outros materiais nas pastas correspondentes.

## MatheusFlow

Aplicação web para registrar clientes e chamados, acompanhar status e visualizar indicadores. O projeto inclui API em Python, persistência local SQLite, autenticação privada e configuração para publicação gratuita no Render com banco PostgreSQL no Neon.

Para usar localmente, abra um terminal na pasta `Documentos/ServiceFlow` e execute:

```sh
python3 server.py
```

No Windows, use `py server.py`. Depois acesse http://127.0.0.1:3000. Os chamados locais ficam no arquivo `serviceflow.db`.

A configuração de hospedagem e os passos de publicação estão em [Documentos/ServiceFlow/README.md](Documentos/ServiceFlow/README.md). O plano gratuito pode colocar o servidor e o banco em pausa quando estão sem uso; o primeiro acesso pode demorar. Os limites do Render e do Neon não oferecem as mesmas garantias de disponibilidade e backup de planos pagos.

Não publique `serviceflow.db`, senhas, hashes, `SESSION_SECRET` ou `DATABASE_URL` no GitHub.
