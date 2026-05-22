# War Base

War Base e um jogo multiplayer FFA (free-for-all) de castelos. Cada jogador administra um castelo, constroi estruturas, captura minas e edificios desativados, pesquisa tecnologias, envia unidades e tenta ser o ultimo com o castelo ativo.

![Fluxograma do jogo](fluxograma.png)

## Como Rodar

Requisitos:

- Node.js 20 ou superior
- npm 10 ou superior

Instale as dependências:

```bash
npm install
```

Inicie em desenvolvimento, com reload automático:

```bash
npm run dev
```

Ou rode como produção local:

```bash
npm start
```

Acesse a partida em `http://localhost:4000`. O servidor usa a porta `4000` por padrão, mas aceita a variável `PORT` para outros ambientes, por exemplo `PORT=3000 npm start`.

O endpoint `GET /health` retorna `status`, `activeRooms`, `uptimeSeconds` e `timestamp`, e pode ser usado por checks de disponibilidade. Ao receber `SIGINT` ou `SIGTERM`, o servidor encerra Socket.IO e o servidor HTTP antes de finalizar.

## Como Entrar

- **Criar partida**: informe um GamerTag e o servidor gera uma HostKey de sala privada.
- **Entrar em partida**: informe GamerTag e uma HostKey existente. A HostKey é normalizada para 5 caracteres alfanuméricos.
- Tambem e possivel pre-preencher a sala pela URL com `?room=ABCDE` ou `?hostKey=ABCDE`.
- O navegador lembra o último GamerTag usado para agilizar novas partidas no mesmo dispositivo.
- Cada jogador comeca com um Castelo e 750 de ouro.

## Inteligência Artificial

O jogo pode adicionar uma IA pela lista de jogadores no HUD, usando o botão **Adicionar IA**. O servidor cria um jogador interno e usa o agente composto em `ai/agente-composto/`, que combina um roteador estrategista com sub-redes especializadas para capturar, construir, pesquisar, defender, atacar, evoluir estruturas e explorar sob fog of war.

A estratégia adotada está documentada em [docs/estrategia-ia.md](docs/estrategia-ia.md).

A implementação fica separada em duas partes:

- `ai/rede-neural/`: matriz e rede neural feedforward com backpropagation.
- `ai/agente-composto/`: agente hierárquico, codificação espacial, validadores, datasets e pipeline de treino.

Para regenerar as redes treinadas em `ai/agente-composto/redes/`:

```bash
npm run train:ai
```

## Objetivo

Proteja seu Castelo. Quando a integridade de um Castelo chega a 0, o dono e eliminado e todas as suas estruturas/unidades saem do jogo. Quando sobra apenas um jogador com Castelo ativo, ele vence.

## Gameplay Atual

O jogador nao e mais controlado diretamente por WASD como uma entidade no mapa. O jogador funciona como comandante do Castelo: seleciona terrenos/construcoes e emite ordens.

Para capturar uma estrutura neutra ou desativada:

1. Clique em uma construcao capturavel.
2. Use o botao **Iniciar captura** ou o atalho `D`.
3. O Castelo envia automaticamente um **Arauto**.
4. O Arauto caminha sozinho ate o alvo.
5. Ao entrar no alcance de captura, ele comeca a capturar.
6. Se outro Arauto estiver influenciando a captura, eles podem se atacar.
7. Apos 30 segundos de progresso, a construcao muda de dono e e reativada.

Se o Arauto morrer, ele fica fora por 30 segundos e reaparece perto do Castelo.

## Atalhos

- `W`: evoluir a construcao selecionada.
- `A`: construir Mina no terreno selecionado.
- `S`: enviar Soldado, se o Quartel estiver ativo e houver ouro.
- `D`: iniciar captura do alvo capturavel; se nao houver alvo capturavel selecionado, foca o Castelo.
- `Esc`: limpa a selecao.
- Clique no mapa: seleciona terreno ou construcao.
- O HUD mostra recursos, estado da unidade, estruturas ativas, unidades em campo, jogadores offline e horario dos eventos.

## Loop Do Servidor

A cada tick, o servidor processa:

1. Respawns de Arautos que morreram e ja cumpriram 30 segundos.
2. Geracao de recursos por estruturas ativas.
3. Regeneracao de barreiras de estruturas e unidades fora de combate.
4. Ordens dos Arautos, incluindo movimento, ataque e aproximacao para captura.
5. Progresso de captura de estruturas desativadas.
6. Ataques automaticos de torres.
7. Movimento/ataque de NPCs ofensivos, como Soldados.
8. Condicao de vitoria.

## Recursos

- **Ouro**: recurso principal. Usado para construir, comprar unidades e fazer upgrades. Gerado por Minas.
- **Sabedoria**: recurso de tecnologia. Gerado por Bibliotecas. Usado para pesquisar Tiro de Arqueiro, Engenharia de Cerco e Treinamento Militar.

## Combate

- Barreira absorve dano primeiro; depois o dano vai para integridade.
- Barreira regenera quando a entidade nao recebe dano por alguns segundos.
- Torres atacam automaticamente inimigos no alcance a cada 1 segundo.
- Estruturas comuns zeradas ficam desativadas e capturaveis.
- Castelos zerados eliminam o jogador.

## Captura

- So estruturas marcadas como capturaveis podem receber ordem de captura.
- O Castelo nao e capturavel; ele deve ser destruido.
- O Arauto tem 160 de integridade, 40 de barreira, 20 de dano e 1.5 de alcance.
- O Arauto nasce perto do Castelo, anda 1 campo por tick e captura quando fica dentro do alcance.
- Arautos inimigos proximos ao mesmo ponto disputado podem lutar entre si.
- A captura leva 30 segundos de progresso.

## Construcoes

Cada tipo construivel tem limite atrelado ao nivel do Castelo. O limite usa uma quantidade inicial mais um incremento por nivel: Mina comeca em 3 slots e ganha +2 por nivel; Biblioteca, Torre de Arqueiros, Catapulta e Quartel comecam em 1 slot e ganham +1 por nivel. Estruturas proprias desativadas nao contam para o limite, enquanto capturas podem deixar o jogador acima do cap e bloquear novas construcoes daquele tipo ate abrir espaco ou subir o Castelo.

Estruturas que nao sao o Castelo so podem receber upgrade ate o nivel atual do Castelo. O Castelo nao tem esse teto e e o eixo para liberar mais slots e niveis.

O upgrade do Castelo tambem depende de um gate de progressao: a media de niveis das demais estruturas proprias ativas precisa alcancar `nivelAtualDoCastelo x 0.75` para que o botao de upgrade libere. Por exemplo, para subir do nivel 4 para o 5 a media precisa ser >= 3; para subir de 100 para 101, >= 75. Estruturas desativadas proprias nao entram na conta; capturas entram.

### Castelo

- 1000 de integridade inicial.
- 500 de barreira inicial.
- +25 de integridade e +25 de barreira por nivel.
- Castelo nivel 2 desbloqueia Biblioteca.
- Nao e capturavel.

### Mina

- Custa 540 de ouro.
- Gera ouro automaticamente.
- Comeca em +20 de ouro por segundo.
- +5 de ouro por segundo por nivel.
- Capturavel quando desativada/neutra.

### Biblioteca

- Exige Castelo nivel 2.
- Gera sabedoria.
- Permite pesquisas:
  - Nivel 1: Tiro de Arqueiro e Engenharia de Cerco.
  - Nivel 2: Treinamento Militar.

### Torre de Arqueiros

- Torre de dano unico.
- Custa 140 de ouro.
- 500 de integridade.
- 0 de barreira.
- 5 de dano por tiro.
- 20 de alcance.

### Catapulta

- Torre de dano em area.
- Custa 200 de ouro.
- 200 de integridade.
- 100 de barreira.
- 15 de dano por tiro.
- 10 de alcance.

### Quartel

- Estrutura de unidades ofensivas.
- Custa 600 de ouro.
- 200 de integridade.
- 0 de barreira.
- Permite enviar Soldados depois da pesquisa Treinamento Militar.

## Unidades

### Arauto

- Unidade automatica enviada pelo Castelo ao iniciar captura.
- Custo 0.
- 160 de integridade.
- 40 de barreira.
- 20 de dano.
- 1.5 de alcance.
- Reaparece no Castelo 30 segundos apos morrer.

### Soldado

- Unidade ofensiva comprada pelo Quartel.
- Custa 80 de ouro.
- 150 de integridade.
- 50 de barreira.
- 10 de dano.
- 1 de alcance.
- Anda sozinho ate o Castelo inimigo mais proximo.
- Ganha +10 de integridade, +5 de barreira e +2 de dano por nivel do Quartel.

## Desenvolvimento

Arquivos principais:

- `server.js`: servidor Express + Socket.IO.
- `public/game.js`: estado, regras e simulação do jogo.
- `public/render-screen.js`: renderização do canvas e HUD.
- `public/index.html`: layout, estilos e handlers de UI.
- `ai/rede-neural/`: implementação da rede neural.
- `ai/agente-composto/`: agente composto, codificadores, validadores e treinamento.

Comandos úteis:

```bash
npm run dev
npm start
npm run train:ai
npm test
npm run coverage
npm run test:watch
```

O comando `npm run coverage` exige 100% em statements, branches, functions e lines para todo o projeto.
