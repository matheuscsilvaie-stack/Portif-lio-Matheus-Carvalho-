# MatheusFlow

O painel pode rodar localmente com SQLite ou ser hospedado para acesso privado com login e PostgreSQL. A configuração de hospedagem está em `../render.yaml`.

## Uso local

Abra um terminal nesta pasta e execute:

```sh
python3 server.py
```

No Windows, tente `py server.py`. Acesse **http://127.0.0.1:3000**. O servidor local fica restrito a este computador e grava os chamados em `serviceflow.db`. Para encerrar, pressione `Ctrl+C`.

## Preparar a hospedagem privada

O Blueprint do Render cria um servidor web e um banco PostgreSQL gerenciado. Os arquivos persistem no banco remoto; a hospedagem gratuita do Render não é adequada para dados reais. A configuração usa o plano web Starter e PostgreSQL `basic-256mb`; consulte os [preços atuais do Render](https://render.com/pricing) antes de criar os recursos.

1. Conecte sua conta do Render ao repositório GitHub e crie um Blueprint usando `render.yaml` na raiz do repositório.
2. Gere o hash da senha localmente, sem enviá-la pelo chat:

   ```sh
   cd Documentos/ServiceFlow
   python3 server.py --hash-password
   ```

3. Nos campos secretos do serviço, defina `APP_USERNAME`, `APP_PASSWORD_HASH` (o hash exibido) e `SESSION_SECRET` (gere com `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`). Mantenha `COOKIE_SECURE=true`.
4. Abra o endereço HTTPS do serviço Render e entre com usuário e senha.

O login usa uma senha derivada com scrypt e sessões assinadas em cookie HttpOnly. A API e a página de chamados exigem sessão. Nunca coloque senhas, `SESSION_SECRET`, `DATABASE_URL` ou `serviceflow.db` no GitHub. Faça backup periódico do PostgreSQL e use dados reais somente depois de confirmar as credenciais e o acesso privado.

O SQLite local não é enviado ao GitHub nem migrado automaticamente para o PostgreSQL hospedado.
