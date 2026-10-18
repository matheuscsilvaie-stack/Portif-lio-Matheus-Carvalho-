# Portfólio — Matheus Silva

Portfólio pessoal desenvolvido em HTML, CSS e JavaScript.

## Conteúdo

- Página principal: `index.html`
- Cópia de origem: `portfolio.html`
- Projeto MatheusFlow: `Documentos/ServiceFlow/`
- Projeto MindFlow e outros materiais nas pastas correspondentes.

## MatheusFlow

Aplicação local para registrar clientes e chamados, acompanhar status e visualizar indicadores. A interface usa HTML, CSS e JavaScript; a API é feita em Python e os dados são armazenados em SQLite no arquivo `Documentos/ServiceFlow/serviceflow.db`.

Para iniciar, abra um terminal na pasta `Documentos/ServiceFlow` e execute:

```sh
python3 server.py
```

No Windows, use `py server.py` caso `python3` não esteja disponível. Depois acesse http://127.0.0.1:3000. A demonstração hospedada no GitHub Pages não executa a API; consulte o README do projeto para rodá-lo localmente.

Faça backup do arquivo `serviceflow.db` para preservar os chamados. Não publique esse arquivo se contiver dados de clientes.
