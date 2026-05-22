# Estrategia De Inteligencia Artificial

Este documento descreve a estrategia de inteligencia artificial atual do War Castelo: um agente composto, treinavel de forma supervisionada, que joga com o mesmo estado filtrado por fog of war recebido por jogadores humanos.

## Visao Geral

A IA e um jogador interno adicionado pelo servidor. A cada ciclo de decisao, ela recebe o estado publico filtrado para o proprio `playerId`, codifica o mapa visivel e a memoria de ultima visao, e passa esse input para um conjunto hierarquico de redes neurais.

O fluxo principal e:

1. O servidor adiciona um jogador interno controlado por IA.
2. O agente composto monta o input com 3 frames do tabuleiro espectral e 32 escalares.
3. A rede `router` escolhe a macro-acao: `farm`, `research`, `defend`, `attack`, `upgrade`, `upgrade-castle` ou `wait`.
4. A sub-rede da macro-acao decide o detalhe: tile de construcao, pesquisa ou spawn.
5. Os validadores deterministicos conferem recursos, requisitos, alcance e ocupacao do mapa.
6. A primeira decisao valida vira um comando do jogo.

Quando os arquivos treinados em `ai/agente-composto/redes/` ainda nao existem, o agente usa uma fallback heuristica simples para continuar funcional sem ressuscitar o agente antigo.

Captura, exploracao e movimentacao das tropas nao sao mais decididas pela rede: o motor do jogo controla o Herald e os soldados de forma autonoma (ver "Unidades Autonomas").

## Fog Of War

A IA nao enxerga o estado completo da sala. O motor calcula uma `fogMask` por jogador com castelo no `sightRange` de castelos, estruturas e unidades. Estruturas inimigas ou neutras vistas antes ficam em `memory.structures` como ultimo avistamento, mas unidades e jogadores nao sao memorizados.

Isso faz a IA decidir com a mesma informacao espacial que um humano teria: alvos fora da visao so entram no plano se foram lembrados como estruturas.

## Codificacao Do Input

Cada decisao usa:

- 3 frames do tabuleiro 48x30, codificados como valores espectrais em um vetor achatado;
- 32 escalares de economia, tecnologia, composicao, alvos visiveis, memoria, inimigos vivos, fracao visivel do mapa, tick da partida, ocupacao dos slots de construcao e gate percentual de upgrade da Castelo.

O tamanho final do input padrao e `4352` floats. A rede compartilhada de placement recebe mais 6 valores one-hot para o tipo de estrutura, totalizando `4358` floats.

## Redes

Arquitetura principal:

- `router`: escolhe a macro-acao.
- `farm`: decide entre construir Cover ou construir Taraque.
- `research`: escolhe Per, Hef ou Tujai.
- `defend`: decide torre defensiva ou upgrade defensivo.
- `attack`: decide Tujai, Zunim ou torre avancada.
- `upgrade`: escolhe estrutura propria nao-castelo para evoluir quando houver teto liberado.
- `upgrade-castle`: prioriza a Castelo quando slots de construcao estao cheios.
- `placement`: heatmap compartilhado para tiles de construcao.
- `target-defend-upgrade`: heatmap especializado para alvo de upgrade defensivo.
- `target-upgrade`: heatmap especializado para alvo de upgrade da Castelo.

Todas usam a infraestrutura feedforward em `ai/rede-neural/`.

As redes `scout`, `capture`, `target-capture` e a macro `farm > capture-mine-target` foram removidas: captura passou a ser decidida pelo motor, nao mais pela rede.

## Validadores Deterministicos

A camada em `ai/agente-composto/validadores.js` continua essencial. Ela impede comandos ilegais e transforma scores em acoes concretas. Exemplos:

- construcoes precisam de carvao, requisitos liberados, tile livre, alcance de construcao e slot disponivel em `catalog.limits`;
- pesquisas precisam de conhecimento e nivel minimo de Taraque;
- upgrades so podem mirar estruturas proprias ativas com carvao suficiente; estruturas nao-castelo tambem precisam estar abaixo do nivel da Castelo; o upgrade da Castelo depende da media de niveis das outras estruturas alcancar `nivelAtual * 0.75`.

Os comandos `capture` e `move-herald-to` nao existem mais: a captura e movimentacao do Herald sao controladas pelo motor.

## Unidades Autonomas

Captura e ataque sao tratados como comportamentos do motor, nao decisoes da rede. O ciclo do servidor passa por um loop dedicado para cada tropa antes de processar comandos da IA.

### Herald

Cada jogador tem exatamente um Herald, spawnado ao entrar no jogo e respawnado no castelo quando morre. A cada tick:

1. **Se ja existe ordem ativa** (`move` ou `capture`), continua executando ate concluir.
2. **Procura alvo capturavel**: visivel ou em `memory.structures`. Se houver algum, gera ordem `capture` mirando o **mais proximo do proprio castelo**.
3. **Patrulha do FOV**: senao, gera ordem `move` para um tile na **borda da fogMask aliada** (tile visivel cujos vizinhos incluem ao menos um tile sob fog). A escolha gira pelos quadrantes ao redor do castelo para distribuir a exploracao.

O Herald nao precisa mais ser comandado por humano nem por IA. Os antigos comandos `capture` e `move-herald-to` foram removidos do protocolo, dos botoes e das teclas.

### Soldados

Cada soldado, a cada tick, segue prioridades em cascata:

1. **Defesa do FOV aliado**: se existe estrutura ou unidade inimiga dentro da `fogMask` do dono (combinacao dos `sightRange` do castelo, torres, soldados e Herald), o soldado mira o inimigo **mais proximo do proprio castelo** e o ataca.
2. **Apoio ao Herald**:
   - Se o Herald tem ordem `capture` ou `move`, o soldado avanca para o **destino da ordem** (acelera capturas e protege o Herald em rota).
   - Se o Herald esta idle, o soldado **escolta** posicionando-se proximo a ele.
3. **Exploracao**: se nada acima se aplica, o soldado escolhe um tile sob fog (dispersao por hash do `unitId` para evitar amontoamento) e marcha para descobrir o mapa.

Isso substitui o antigo comportamento de marchar direto no castelo inimigo mais proximo, que ignorava ameacas imediatas e nao apoiava nem a exploracao nem a captura.

## Treinamento

O treinamento continua supervisionado, mas agora usa datasets independentes por rede em `ai/agente-composto/treino/dataset-*.js`.

Para treinar todas as redes:

```bash
npm run train:ai
```

O comando grava modelos JSON em `ai/agente-composto/redes/`. O numero de epocas pode ser reduzido ou aumentado com a variavel `WAR_BASE_AI_EPOCHS`.

## Limites Atuais

A IA composta ainda nao usa reinforcement learning, self-play ou CNNs. O tabuleiro e vetorizado, e os datasets iniciais sao pequenos. O desenho, porem, deixa a evolucao mais direta: cada rede pode ganhar exemplos novos sem reescrever o agente inteiro.

## Arquivos Relacionados

- `ai/rede-neural/matriz.js`: operacoes de matriz usadas pela rede.
- `ai/rede-neural/rede-neural.js`: implementacao feedforward com treinamento por backpropagation.
- `ai/agente-composto/agente-composto.js`: orquestrador hierarquico.
- `ai/agente-composto/validadores.js`: validacao e montagem de comandos.
- `ai/agente-composto/codificacao/`: tabuleiro espectral, escalares e historico.
- `ai/agente-composto/treino/`: datasets e scripts de treino.
- `public/game.js`: fog of war, memoria e integracao das decisoes ao jogo.
- `server.js`: integra o agente composto ao ciclo da sala e ao comando de adicionar IA.
