# MatheusFlow

O ServiceFlow roda localmente com Python e SQLite. Não precisa instalar PostgreSQL, Node.js ou bibliotecas adicionais.

## Iniciar

Abra um terminal nesta pasta e execute:

```sh
python3 server.py
```

No Windows, se `python3` não existir, tente `py server.py`. Depois abra **http://127.0.0.1:3000**. Mantenha o terminal aberto enquanto usa o sistema. Para encerrar, pressione `Ctrl+C`.

Não abra `index.html` diretamente: a página precisa ser servida junto com a API. O servidor só aceita conexões deste computador.

## Dados e cópias de segurança

O banco `serviceflow.db` é criado automaticamente nesta pasta. Chamados, clientes, status e prioridades continuam salvos após fechar o navegador ou reiniciar o computador. Para fazer backup, pare o servidor e copie `serviceflow.db` para um local seguro. Não compartilhe esse arquivo se ele contiver dados de clientes.

O arquivo `serviceflow.sql` contém o esquema PostgreSQL original; o modo usado pelo aplicativo é SQLite, iniciado por `server.py`.
