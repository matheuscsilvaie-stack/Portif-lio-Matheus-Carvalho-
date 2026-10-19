# MatheusFlow

O painel pode rodar localmente com SQLite ou ser publicado sem mensalidade com o serviço web gratuito do Render e um banco PostgreSQL gratuito no Neon. A configuração do serviço está em `../render.yaml`.

## Uso local

Configure o acesso administrativo uma vez. O usuário padrão é `adm`; digite a senha desejada quando o terminal solicitar. A senha é armazenada como hash no arquivo local ignorado pelo Git:

```sh
python3 server.py --configure-admin
```

Depois inicie o servidor:

```sh
python3 server.py
```

No Windows, tente `py server.py`. Acesse **http://127.0.0.1:3000**. O servidor local fica restrito a este computador e grava os chamados em `serviceflow.db`. Para encerrar, pressione `Ctrl+C`.

No formulário de configuração, use o usuário `adm` e a senha administrativa escolhida. Uma senha de seis dígitos é fraca; para guardar dados reais de clientes, escolha uma senha longa e exclusiva.

## Publicar gratuitamente com login privado

O servidor web fica no plano gratuito do Render; o PostgreSQL fica no plano gratuito do Neon. O banco mantém os dados, mas o servidor Render gratuito dorme após 15 minutos sem acesso e pode levar cerca de um minuto para acordar. O Neon também pausa o banco quando está ocioso. Os planos gratuitos têm limites e não incluem o mesmo nível de disponibilidade e recuperação de dados de um serviço pago. Consulte os [limites do Render](https://render.com/docs/free) e do [Neon](https://neon.com/docs/introduction/plans).

1. Crie um projeto gratuito no Neon e copie a connection string PostgreSQL (de preferência a opção pooled). Ela contém credenciais; não a compartilhe nem a coloque no GitHub.
2. No Render, crie um Blueprint a partir do repositório GitHub e use `render.yaml` na raiz. Escolha apenas o plano **Free** para o serviço web.
3. Nos campos secretos do serviço, defina `DATABASE_URL` com a connection string do Neon.
4. Gere o hash da senha localmente, sem enviá-la pelo chat:

   ```sh
   cd Documentos/ServiceFlow
   python3 server.py --hash-password
   ```

5. Defina `APP_USERNAME`, `APP_PASSWORD_HASH` e `SESSION_SECRET` nas variáveis privadas do Render. Para obter valores compatíveis com a senha administrativa, execute `python3 server.py --configure-admin` localmente e copie os valores de `.env` diretamente para o painel Render; não os envie pelo chat nem os commite no GitHub. Mantenha `COOKIE_SECURE=true` no Render.
6. Abra o endereço HTTPS do serviço Render e entre com usuário e senha. O primeiro acesso pode demorar enquanto o serviço e o banco acordam.

O login usa uma senha derivada com scrypt e sessões assinadas em cookie HttpOnly. A API e a página de chamados exigem sessão. Nunca coloque senhas, `SESSION_SECRET`, `DATABASE_URL` ou `serviceflow.db` no GitHub. Faça backup periódico do PostgreSQL. Para dados importantes de clientes, considere um plano com backups e disponibilidade adequados.

O SQLite local não é enviado ao GitHub nem migrado automaticamente para o PostgreSQL hospedado.
