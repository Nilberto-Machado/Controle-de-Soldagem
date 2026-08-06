# Controle de Soldagem Ozango (V5.2.3)

Aplicacao web baseada em HTML unico, preparada para deploy no Render.

## Executar localmente

1. Instale dependencias:

   npm install

2. Inicie o servidor:

   npm start

3. Abra no navegador:

   http://localhost:10000

## Deploy no Render

Este repositorio ja contem o arquivo `render.yaml`.

### Opcao 1: Blueprint (recomendada)

1. Suba este repositorio no GitHub.
2. No Render, clique em New + > Blueprint.
3. Selecione o repositorio.
4. O Render vai detectar o `render.yaml` e criar o servico.

### Opcao 2: Web Service manual

- Environment: Node
- Build Command: npm install
- Start Command: npm start

## Observacoes

- O arquivo principal servido na raiz (`/`) e `Controle_de_Soldagem_Ozango_V5_2_3.html`.
- O arquivo `Ozango_Controle_Soldagem_Banco_V5_2_3.xlsx` fica disponivel estaticamente no mesmo diretorio.
- Algumas funcoes de acesso direto ao sistema de arquivos dependem do navegador e das permissoes concedidas.
