# Estrategia De Inteligencia Artificial

Este documento descreve a estrategia de inteligencia artificial adotada no War Base: uma politica neural treinada de forma supervisionada, combinada com uma camada deterministica que transforma a decisao da rede em comandos validos do jogo.

## Visao Geral

A IA foi implementada como um agente autonomo que joga usando o mesmo conjunto de acoes disponiveis para um jogador humano: capturar estruturas, construir, pesquisar tecnologias, evoluir a Base e enviar unidades ofensivas.

O agente nao controla uma entidade diretamente no mapa. Ele observa o estado publico da partida, transforma esse estado em um vetor numerico, passa esse vetor por uma rede neural treinada e escolhe a acao com maior pontuacao que possa ser executada naquele momento.

O fluxo principal e:

1. O servidor adiciona um jogador interno controlado por IA.
2. O agente carrega o modelo salvo em `ai/agente-war-base/rede-treinada.json`.
3. A cada ciclo de decisao, o agente extrai entradas numericas do estado da sala.
4. A rede neural calcula uma pontuacao para cada acao possivel.
5. As acoes sao ordenadas da maior para a menor pontuacao.
6. A primeira acao valida e convertida em um comando do jogo.
7. Caso nenhuma acao seja valida, o agente nao emite comando naquele ciclo.

## Papel Da Rede Neural

A rede neural e responsavel por escolher a prioridade estrategica do agente. Ela responde perguntas como:

- vale mais capturar agora ou fortalecer a economia?
- devo construir Cover, Taraque, Per, Hef ou Tujai?
- ja e hora de pesquisar uma tecnologia?
- devo melhorar a Base?
- devo enviar Zunim contra um inimigo?
- devo esperar porque ainda nao tenho recursos suficientes?

Na pratica, a rede recebe um vetor de entradas e retorna um vetor de saidas. Cada saida representa a pontuacao de uma acao possivel.

As entradas atuais incluem sinais como:

- quantidade relativa de carvao;
- quantidade relativa de conhecimento;
- nivel da Base;
- vida e barreira da Base;
- quantidade de estruturas ativas por tipo;
- quantidade de Zunim em campo;
- tecnologias desbloqueadas;
- quantidade de alvos capturaveis;
- proximidade da Base inimiga mais proxima;
- se o Capturador ja esta executando uma ordem;
- quantidade de inimigos vivos.

As saidas atuais representam estas acoes:

- `capture`
- `build-cover`
- `upgrade-base`
- `build-taraque`
- `research-per`
- `research-hef`
- `research-tujai`
- `build-per`
- `build-hef`
- `build-tujai`
- `spawn-zunim`
- `wait`

## Papel Das Regras Deterministicas

A IA nao e composta apenas de `if/else`, mas existe uma camada de regras depois da rede neural. Essa camada nao escolhe a estrategia principal; ela valida se a acao escolhida pela rede pode ser executada dentro das regras do War Base.

Exemplos:

- se a rede escolhe `build-cover`, a camada deterministica procura um terreno valido dentro do alcance de construcao;
- se a rede escolhe `capture`, ela seleciona o alvo capturavel com melhor prioridade;
- se a rede escolhe `research-hef`, ela verifica se existe Taraque suficiente, conhecimento suficiente e se a tecnologia ainda nao foi pesquisada;
- se a rede escolhe `spawn-zunim`, ela confirma que Tujai foi pesquisada, que existe estrutura Tujai ativa e que ha carvao suficiente.

Essa separacao evita comandos invalidos e mantem a rede focada em estrategia, enquanto as regras mantem a IA compatível com a simulacao do jogo.

## Treinamento

O treinamento atual e supervisionado. Isso significa que definimos exemplos de situacoes e a acao esperada para cada uma delas. O script de treinamento usa esses exemplos para ajustar os pesos da rede neural.

O dataset fica em `ai/agente-war-base/treinar.js` e contem exemplos como:

- priorizar captura quando existem alvos capturaveis;
- construir Cover para fortalecer a economia;
- evoluir a Base quando ha recursos suficientes;
- construir Taraque para abrir pesquisas;
- pesquisar Per, Hef e Tujai conforme conhecimento e requisitos;
- construir torres quando as tecnologias ja foram liberadas;
- enviar Zunim quando a estrutura ofensiva esta disponivel;
- esperar quando recursos e opcoes estao baixos.

O comando para regenerar o modelo e:

```bash
npm run train:ai
```

Ao final do treinamento, o modelo e salvo em:

```text
ai/agente-war-base/rede-treinada.json
```

Esse arquivo fica versionado no repositorio para que o jogo possa carregar uma IA pronta sem precisar treinar a rede a cada inicializacao.

## Estrategia De Jogo Esperada

A politica treinada tenta seguir uma progressao simples:

1. Capturar estruturas neutras ou desativadas quando houver oportunidade.
2. Construir Cover para aumentar a geracao de carvao.
3. Evoluir a Base para liberar construcoes mais avancadas.
4. Construir Taraque para gerar conhecimento.
5. Pesquisar tecnologias ofensivas e defensivas.
6. Construir Per e Hef para defender e pressionar inimigos.
7. Construir Tujai para habilitar unidades ofensivas.
8. Enviar Zunim quando houver infraestrutura e recursos.

Essa estrategia nao pretende ser perfeita. Ela foi escolhida para criar um adversario funcional, previsivel o suficiente para ser testado e simples de evoluir.

## Limites Atuais

A IA atual ainda nao aprende jogando sozinha. Ela nao usa reinforcement learning, simulacao massiva de partidas nem avaliacao de longo prazo baseada em vitorias e derrotas.

As principais limitacoes sao:

- o dataset de treinamento ainda e pequeno;
- a rede aprende a imitar os exemplos definidos manualmente;
- a avaliacao de posicao e simplificada;
- o agente nao planeja varias jogadas a frente;
- a escolha final ainda depende de validadores determinísticos para respeitar as regras do jogo.

Mesmo assim, a arquitetura deixa o caminho aberto para evolucoes futuras.

## Caminhos De Evolucao

Melhorias naturais para a IA:

- aumentar o dataset com mais situacoes reais de partida;
- registrar partidas humanas e transformar decisoes boas em exemplos de treino;
- criar partidas automatizadas entre IAs para coletar dados;
- usar recompensa por sobrevivencia, economia, dano causado e vitoria;
- treinar politicas diferentes para perfis agressivo, defensivo e economico;
- ajustar o cooldown de decisao conforme o ritmo da partida;
- adicionar metricas para comparar versoes do modelo.

## Arquivos Relacionados

- `ai/rede-neural/matriz.js`: operacoes de matriz usadas pela rede.
- `ai/rede-neural/rede-neural.js`: implementacao feedforward com treinamento por backpropagation.
- `ai/agente-war-base/treinar.js`: dataset supervisionado e geracao do modelo treinado.
- `ai/agente-war-base/rede-treinada.json`: modelo neural treinado e versionado.
- `ai/agente-war-base/agente-neural.js`: agente que extrai entradas, consulta a rede e cria comandos validos para o jogo.
- `server.js`: integra o agente neural ao ciclo da sala e ao comando de adicionar IA.
