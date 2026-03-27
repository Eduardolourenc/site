# Monitoramento de Estudos

Aplicação web simples para registrar horas diárias de estudo, quantidade de questões feitas e acertos, com controle por matéria e relatório mensal de horas estudadas por dia.

## Requisitos

- Node.js 18+ instalado

## Instalação

```bash
npm install
npm start
```

O servidor ficará disponível em: http://localhost:3000

## Funcionalidades

- Cadastro de matérias
- Registro diário de estudos (data, matéria, horas, questões, acertos)
- Lista dos últimos registros
- Relatório mensal com gráfico (Chart.js via CDN) mostrando horas estudadas por dia
- Banco de dados SQLite local em `data/study-tracker.db`

## Hospedagem simples (Render + SQLite persistente)

Se só você vai usar e quer algo simples, a forma mais direta é usar o SQLite mesmo, mas com **disco persistente** em um serviço como o Render.

### Passo a passo resumido

1. Suba este projeto para um repositório no GitHub.
2. No painel do Render crie um **Web Service** conectado a esse repositório.
3. Configure:
	- Build command: `npm install`
	- Start command: `npm start`
4. Adicione um **Persistent Disk** ao serviço com, por exemplo:
	- Tamanho: 1 GB (sobra para uso pessoal)
	- Caminho de montagem (mount path): `/data`
5. Nas variáveis de ambiente do serviço, configure:
	- `PORT` = porta que o Render indicar (geralmente ele já injeta automaticamente)
	- `DB_DIR` = `/data`

Com isso, o arquivo do banco (`study-tracker.db`) ficará dentro do disco persistente do Render. Reinícios ou novos deploys não apagarão o histórico de estudos.
