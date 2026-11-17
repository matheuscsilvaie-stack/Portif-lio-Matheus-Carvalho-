# Urbanix · Cidade Invisível

**Demonstração pública:** [Abrir Urbanix](https://matheuscsilvaie-stack.github.io/Portif-lio-Matheus-Carvalho-/urbanix/)

Plataforma comunitária para registrar problemas urbanos em Santos (SP), localizá-los no mapa e acompanhar o que precisa de atenção. Roda inteira no GitHub Pages, usando o [Supabase](https://supabase.com) como banco de dados, autenticação e armazenamento de fotos.

## O que funciona

- **Contas reais**: cadastro com e-mail, nome de usuário público e senha (mínimo de 8 caracteres), com confirmação por e-mail.
- **Relatos compartilhados**: todo mundo vê os mesmos relatos, em qualquer aparelho. Visitantes podem explorar sem conta; para registrar ou confirmar, é preciso entrar.
- **Fotos** enviadas pelo celular (comprimidas no navegador e guardadas no Supabase Storage).
- **Confirmações**: uma por conta em cada relato; ninguém confirma o próprio relato.
- **Moderação**: admins mudam o status (Aberto → Em andamento → Resolvido) e removem relatos; autores podem excluir os próprios relatos. Relatos resolvidos saem da fila de prioridade e ficam esmaecidos no mapa.
- **Tempo real**: um relato novo aparece para todos sem recarregar a página.
- **Anti-spam**: no máximo 10 relatos por conta a cada 24 horas.
- **Modo demonstração**: se o `config.js` estiver vazio, o app abre com dados fictícios guardados só no navegador (login `adm` / `adm`).

Toda a segurança fica no banco (Row Level Security): mesmo quem mexer no JavaScript pelo navegador não consegue se tornar admin, inflar confirmações, apagar relatos de outras pessoas ou subir fotos na pasta de outra conta.

## Como colocar no ar (cerca de 10 minutos)

### 1. Criar o projeto no Supabase
1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e clique em **New project**. Região sugerida: **South America (São Paulo)**.
2. Quando o projeto terminar de iniciar, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas, as regras de segurança, o bucket de fotos e uma amostra fictícia de 5 relatos (que você pode apagar depois).

### 2. Ligar o site ao banco
1. No Supabase, vá em **Project Settings → API** (ou **Connect**) e copie a **Project URL** e a chave **anon / publishable**.
2. Cole as duas no arquivo [`config.js`](config.js):
   ```js
   window.URBANIX_CONFIG = {
     supabaseUrl: "https://SEU-PROJETO.supabase.co",
     supabaseAnonKey: "eyJhbGciOi..."
   };
   ```
   Essa chave pode ficar pública, porque quem protege os dados são as regras do banco. **Nunca** use a chave `service_role` / `secret` aqui.

### 3. Configurar o login
Em **Authentication → URL Configuration**:
- **Site URL**: `https://matheuscsilvaie-stack.github.io/Portif-lio-Matheus-Carvalho-/urbanix/`
- **Redirect URLs**: adicione o mesmo endereço.

Assim, o link de confirmação do e-mail leva a pessoa de volta ao Urbanix.

> O serviço de e-mail embutido do Supabase envia poucos e-mails por hora. Para uma demonstração de portfólio, você pode desligar a confirmação em **Authentication → Sign In / Providers → Email → Confirm email**: as contas passam a entrar direto. Para uso real, configure um SMTP próprio (Resend, Brevo etc.) em **Authentication → Emails → SMTP Settings**.

### 4. Tornar sua conta admin
Crie sua conta normalmente pelo site e depois rode no **SQL Editor** (troque pelo seu usuário):
```sql
update public.profiles set papel = 'admin' where usuario = 'seu_usuario';
```
Saia e entre de novo: aparece "· admin" ao lado do seu nome, e os relatos passam a mostrar os controles de moderação.

### 5. Publicar
Faça o commit e o push. O GitHub Pages atualiza em um ou dois minutos.

## Manutenção

- **Apagar a amostra fictícia**: `delete from public.occurrences where demo;`
- **Plano gratuito**: o Supabase pausa projetos gratuitos que ficam cerca de uma semana sem nenhum acesso. Se o site parar de carregar relatos, entre no painel e clique em **Restore project**.
- **Rodar localmente**: qualquer servidor estático serve, por exemplo `python -m http.server` dentro desta pasta, e então abra `http://localhost:8000`. Para o login funcionar localmente, adicione `http://localhost:8000` em **Redirect URLs**.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Layout e estilos |
| `app.js` | Lógica da aplicação (mapa, relatos, contas, moderação) |
| `config.js` | URL e chave pública do Supabase |
| `supabase/schema.sql` | Banco, regras de segurança, bucket de fotos e amostra |
| `static/` | Logo e favicon |

## Prioridade experimental

`gravidade (1–5 normalizada) × 0,50 + confirmações (até 10 normalizadas) × 0,30 + tempo (até 60 dias normalizado) × 0,20`

O índice serve apenas para ordenar os relatos. Não é uma avaliação oficial de risco. Relatos e confirmações não são verificados oficialmente, e o sistema não indica que uma prefeitura recebeu ou resolveu uma ocorrência.

## Limites desta versão

- Sem integração com prefeituras.
- A moderação depende de admins definidos manualmente no banco.
- Os mapas e as fontes externas precisam de conexão com a internet.

O planejamento acadêmico completo está no PDF `Projeto_Cidade_Invisivel_Plano_de_Estudo.pdf`, na pasta `Projeto. adsprivado.urban`. A versão anterior com Flask + SQLite continua disponível no histórico do Git.
