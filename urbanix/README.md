Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
# Urbanix · Cidade Invisível

**Demonstração pública:** [Abrir Urbanix](https://matheuscsilvaie-stack.github.io/Portif-lio-Matheus-Carvalho-/urbanix/). No GitHub Pages, use `adm` / `adm`; esta versão é uma prévia estática e guarda os relatos apenas no navegador.

MVP acadêmico para registrar ocorrências urbanas, localizá-las no mapa e consultar os dados por categoria, período e bairro. O mapa de demonstração usa Santos (SP) e inclui uma amostra fictícia identificada na interface.

## Executar localmente

Requer Python 3.10 ou superior.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --debug
```

Acesse `http://127.0.0.1:5000`. O acesso inicial de demonstração é usuário `adm`, senha `adm` (papel `admin`). Outras pessoas podem criar uma conta na tela de login; cada conta tem seu próprio usuário e senha, senhas de novas contas precisam ter pelo menos oito caracteres e são armazenadas com hash. Cada conta pode confirmar um relato uma vez.

Para apenas visualizar abrindo `index.html` diretamente, use `adm` / `adm`: essa prévia não autentica no servidor nem permite criar contas, e mantém relatos apenas neste navegador. Para contas reais e sincronização dos dados, abra o endereço do Flask acima.

O banco SQLite é criado em `instance/urbanix.sqlite3`. Para escolher outro caminho, defina `URBANIX_DB_PATH` antes de iniciar o Flask. A chave de sessão local é criada em `instance/.session-key`; em produção, configure `URBANIX_SECRET_KEY` e use HTTPS. A senha `adm` é apenas para a demonstração local e deve ser alterada antes de qualquer publicação.

## O que o MVP oferece

- Cadastro de ocorrências com categoria, descrição, gravidade informada e ponto marcado no mapa.
- Persistência local em SQLite por meio da API Flask; se a API estiver indisponível, os novos registros ficam no navegador atual.
- Mapa Leaflet com base OpenStreetMap, visualização por pontos e concentração por bairro.
- Filtros por categoria, período e bairro, indicadores, gráficos e fila ordenada pelo índice experimental de prioridade.
- Contas individuais com confirmação limitada a uma vez por conta para cada ocorrência.

## Prioridade experimental

`gravidade (1–5 normalizada) × 0,50 + confirmações (até 10 normalizadas) × 0,30 + tempo (até 60 dias normalizado) × 0,20`.

O índice serve apenas para ordenar os registros do protótipo. Não é uma avaliação oficial de risco. Relatos e confirmações não são verificados oficialmente, e o sistema não indica que uma prefeitura recebeu ou resolveu uma ocorrência.

## Limites desta versão

- Não há moderação, upload de fotos ou integração com prefeituras.
- A conta `adm` / `adm` existe para demonstração local; troque essa senha antes de publicar o sistema.
- A amostra de demonstração é fictícia e não deve ser interpretada como retrato oficial da cidade.
- Os mapas e fontes externas precisam de conexão com a internet.

O planejamento acadêmico completo está no PDF `Projeto_Cidade_Invisivel_Plano_de_Estudo.pdf` localizado na pasta `Projeto. adsprivado.urban`.

O logo vetorial usado pela interface está em `static/urbanix-logo.svg`; o símbolo reduzido e o favicon estão em `static/urbanix-symbol.svg`.
