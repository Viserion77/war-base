import { mod } from "./utils.js"

export default function createGame() {
    const state = {
        players: {},
        crystals: {},
        screen: {
            width: 25,
            height: 25,
            pixelsPerFields: 16,
        },
        config: {
            maxCollisionDistance: 4,
            playerCollisionCost: 100,
            wallCollisionCost: 150,
            initialScore: 500,
            autoDropCrystalValue: 50,
            showPotsValue: true,
        }
    }

    const observers = []

    function start() {
        const frequency = 20000

        addCrystal()
        addCrystal()
        addCrystal()
        addCrystal()
        addCrystal()

        setInterval(addCrystal, frequency)
    }

    function subscribe(observerFunction) {
        observers.push(observerFunction)
    }

    function notifyAll(command) {
        for (const observerFunction of observers) {
            observerFunction(command)
        }
    }

    function setState(newState) {
        Object.assign(state, newState)
    }

    function addPlayer(command) {
        const playerId = command.playerId
        const playerX = 'playerX' in command ? command.playerX : Math.floor(Math.random() * state.screen.width)
        const playerY = 'playerY' in command ? command.playerY : Math.floor(Math.random() * state.screen.height)

        state.players[playerId] = {
            playerId: playerId,
            nickName: playerId,
            x: playerX,
            y: playerY,            
            score: state.config.initialScore
        }

        notifyAll({
            type: 'add-player',
            playerId: playerId,
            nickName: playerId,
            playerX: playerX,
            playerY: playerY,
            score: state.config.initialScore
        })
    }

    function removePlayer(command) {
        const playerId = command.playerId

        delete state.players[playerId]

        notifyAll({
            type: 'remove-player',
            playerId: playerId
        })
    }

    //retorna array com os players proximos a coordenada
    function getPlayersAround(coords){
        let { config:{maxCollisionDistance}, players } = state
        let playersAround = []
        
        for (const playerId in players) {
            const player = players[playerId]
            const {x,y} = player
            const distance = Math.sqrt((coords.x - x) * (coords.y-y));
            if(distance <= maxCollisionDistance)
                playersAround.push(playerId)              
        }
        return playersAround        
    }

    function addCrystal(command) {
        const crystalX = command ? command.crystalX : Math.floor(Math.random() * state.screen.width)
        const crystalY = command ? command.crystalY : Math.floor(Math.random() * state.screen.height)
        const crystalId = command ? command.crystalId : `${crystalX}-${crystalY}`
        const quantity = command ? command.quantity : state.config.autoDropCrystalValue

        const oldQuantity = state.crystals[crystalId] ? state.crystals[crystalId].quantity : 0

        /** update quantity */
        state.crystals[crystalId] = {
            x: crystalX,
            y: crystalY,
            quantity: quantity + oldQuantity
        }
        
        //new crystal dispatch sound for who is around
        notifyAll({
            type: 'play-audio',
            audio: 'newCrystal',
            playersId: getPlayersAround(state.crystals[crystalId])
        })  

        notifyAll({
            type: 'add-crystal',
            crystalId: `${crystalX}-${crystalY}`,
            crystalX,
            crystalY,
            quantity: quantity
        })
    }

    function removeCrystal(command) {
        const {crystalId, playerId} = command
        
        delete state.crystals[crystalId]          
        
        //make sound for who ate the crystal
        notifyAll({
            type: 'play-audio',
            audio: 'drinkPot',
            playersId: [playerId]
        })        

        notifyAll({
            type: 'remove-crystal',
            crystalId
        })
    }    

    function onBorderShock(player) {
        const { config: { wallCollisionCost } } = state
        let shockCost = Math.min(player.score, wallCollisionCost)
        state.players[player.playerId].score -= shockCost
        explodeCrystals(shockCost, player.x, player.y)
        const audio = state.players[player.playerId].score<=0 ? 'dying' : 'wallCollision'
        //only play this sound for this user who sock against the wall
        notifyAll({
            type: 'play-audio',
            audio,
            playersId: [player.playerId]
        })   
    }

    function movePlayer(command) {
        notifyAll(command)

        const acceptedMoves = {
            ArrowUp(player) {
                if (player.y - 1 >= 0) {
                    player.y = player.y - 1
                } else onBorderShock(player)
            },
            ArrowRight(player) {
                if (player.x + 1 < state.screen.width) {
                    player.x = player.x + 1
                } else onBorderShock(player)
            },
            ArrowDown(player) {
                if (player.y + 1 < state.screen.height) {
                    player.y = player.y + 1
                } else onBorderShock(player)
            },
            ArrowLeft(player) {
                if (player.x - 1 >= 0) {
                    player.x = player.x - 1
                } else onBorderShock(player)
            }
        }

        const keyPressed = command.keyPressed
        const playerId = command.playerId
        const player = state.players[playerId]
        const moveFunction = acceptedMoves[keyPressed]

        //stop player movement when die
        if (player && moveFunction && player.score > 0) {
            moveFunction(player)
            checkForCrystalCollision(playerId)
            checkForPlayerCollision(playerId)
        }

    }

    /** check if user got points and generate collision 
     *  we can detect the direction of collision if save last position, to step back 
    */
    function checkForPlayerCollision(playerId) {
        const player = state.players[playerId]

        Object.keys(state.players).filter(k => k !== playerId).forEach(otherPlayerKey => {
            let otherPlayers = state.players[otherPlayerKey]
            if (player.x === otherPlayers.x && player.y === otherPlayers.y && otherPlayers.score > 0) {
                //remove 5 points and show extra 5 crystals for each player
                //console.log(`COLLISION between ${playerId} and ${otherPlayerKey}`)

                let otherPlayerDiscount = Math.min(otherPlayers.score, state.config.playerCollisionCost)
                let playerDiscount = Math.min(player.score, state.config.playerCollisionCost)
                let totalCrystals = otherPlayerDiscount + playerDiscount

                state.players[otherPlayerKey].score -= otherPlayerDiscount
                state.players[playerId].score -= playerDiscount
                const audio = state.players[player.playerId].score<=0 ? 'dying' : 'playerCollision'
                
                //make sound for 2 users when crash
                notifyAll({
                    type: 'play-audio',
                    audio,
                    playersId: [playerId,otherPlayerKey]
                }) 

                explodeCrystals(totalCrystals, player.x, player.y)
            }
        })
    }

    /** generate random number inclusive */
    function randomInteger(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * generate crystals based on collission and remaining user points
     */
    function explodeCrystals(qtd, x, y) {
        let { screen:{width, height, pixelsPerFields}, config } = state
        //calculate possible new coordinates
        let maxX = Math.min(x + config.maxCollisionDistance, width-1)
        let minX = Math.max(x - config.maxCollisionDistance, 1)
        let maxY = Math.min(y + config.maxCollisionDistance, height-1)
        let minY = Math.max(y - config.maxCollisionDistance, 1)

        let rest = qtd
        while (rest > 0) {
            let crystalQtd = randomInteger(1, rest)
            rest -= crystalQtd
            let crystalX = randomInteger(minX, maxX)
            let crystalY = randomInteger(minY, maxY)
            let crystalId = `${crystalX}-${crystalY}`
            addCrystal({
                crystalId,
                crystalX,
                crystalY,
                quantity: crystalQtd
            })
        }
        //console.log(`state`,state)
    }

    function checkForCrystalCollision(playerId) {
        const player = state.players[playerId]

        for (const crystalId in state.crystals) {
            const crystal = state.crystals[crystalId]
            // console.log(`Checking ${playerId} score ${player.score} and ${crystalId}`)

            if (player.x === crystal.x && player.y === crystal.y) {
                // console.log(`COLLISION between ${playerId} and ${crystalId}`)

                //only make sound for this user
                removeCrystal({ crystalId, playerId })
                player.score += crystal.quantity
            }
        }
    }

    return {
        addPlayer,
        removePlayer,
        movePlayer,
        addCrystal,
        removeCrystal,
        state,
        setState,
        subscribe,
        start
    }
}
