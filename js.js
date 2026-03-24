// Constante que guarda la dirección de la PokéAPI. Todos los fetch la usan como prefijo para no repetir la URL completa cada vez.
const BASE_URL = 'https://pokeapi.co/api/v2';

//Es un objeto diccionario. Cuando necesitas pintar el badge de un tipo
const coloresPorTipo = {
    fire: '#F08030',
    water: '#6890F0',
    grass: '#78C850',
    electric: '#F8D030',
    psychic: '#F85888',
    ice: '#98D8D8',
    dragon: '#7038F8',
    dark: '#705848',
    fighting: '#C03028',
    poison: '#A040A0',
    ground: '#E0C068',
    flying: '#A890F0',
    bug: '#A8B820',
    rock: '#B8A038',
    ghost: '#705898',
    steel: '#B8B8D0',
    normal: '#A8A878',
    fairy: '#EE99AC'
};

// Efectividad de tipos: multiplicadores de daño según el tipo de ataque y los tipos del defensor
const tablaTipos = {
    normal: { rock: 0.5, steel: 0.5, ghost: 0 },
    fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
    water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
    electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
    grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
    ice: { grass: 2, ground: 2, flying: 2, dragon: 2, water: 0.5, ice: 0.5, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
    flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
    bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
    ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
    steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
    fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 }
};

// Estado global del juego es la memoria del juego. Guarda todo lo que está pasando en la partida actual. Cuando haces restartGame() se resetea completo.
let EstadoJuego = {
    pokemonList: [],
    playerPokemon: null,
    enemyPokemon: null,
    selectedId: null,
    playerTurn: true,
    battleActive: false
};

// Obtiene un array de IDs aleatorios únicos para cargar pokémon. El count es cuántos IDs quieres, y el max es el ID máximo (898 en la PokéAPI actual).
function obtenerIdsAleatorios(count, max = 898) {
    const ids = new Set();
    while (ids.size < count) ids.add(Math.floor(Math.random() * max) + 1);
    return [...ids];
}
// Funcion que hace fetch a la PokéAPI para obtener los datos de un Pokémon por su ID. Si la respuesta no es ok, lanza un error.
async function fetchPokemon(id) {
    const res = await fetch(`${BASE_URL}/pokemon/${id}`);
    if (!res.ok) throw new Error(`Error al cargar Pokémon ${id}`);
    return res.json();
}

// Función que hace fetch a la PokéAPI para obtener los datos de un movimiento por su URL. Devuelve un objeto con el nombre, poder, tipo y PP del movimiento. Si el poder o PP no están definidos, les asigna valores por defecto (40 y 10 respectivamente).
async function fetchMove(url) {
    const res = await fetch(url);
    const data = await res.json();
    return {
        name: data.name.replace(/-/g, ' '),
        power: data.power || 40,
        type: data.type.name,
        pp: data.pp || 10
    };
}

async function getMovesForPokemon(pokemon) {
    const levelUpMoves = pokemon.moves
        .filter(m => m.version_group_details.some(d => d.move_learn_method.name === 'level-up'))
        .slice(0, 4);
    const movesToFetch = levelUpMoves.length >= 4 ? levelUpMoves : pokemon.moves.slice(0, 4);
    return Promise.all(movesToFetch.map(m => fetchMove(m.move.url)));
}

// =============================================
// EFECTIVIDAD DE TIPOS
// =============================================
function getTypeMultiplier(attackType, defenderTypes) {
    const chart = tablaTipos[attackType] || {};
    return defenderTypes.reduce((mult, defType) => mult * (chart[defType] ?? 1), 1);
}

function getEffectivenessText(mult) {
    if (mult === 0) return { text: '¡No tiene efecto!', color: 'text-secondary' };
    if (mult < 1) return { text: 'No es muy eficaz...', color: 'text-warning' };
    if (mult > 1) return { text: '¡Es súper eficaz! 🔥', color: 'text-danger fw-bold' };
    return { text: '', color: '' };
}

// =============================================
// DAÑO
// =============================================
function calcDamage(power, multiplier) {
    return Math.max(5, Math.floor(power * multiplier / 5));
}

// =============================================
// INIT
// =============================================
async function initGame() {
    showLoading(true);
    try {
        const ids = obtenerIdsAleatorios(6);
        const data = await Promise.all(ids.map(id => fetchPokemon(id)));
        EstadoJuego.pokemonList = data;
        renderSelection(data);
        showScreen('selection-screen');
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
}

// =============================================
// PANTALLA SELECCIÓN
// =============================================
function renderSelection(pokemons) {
    document.getElementById('pokemon-list').innerHTML = pokemons.map((p, i) => {
        const types = p.types.map(t =>
            `<span class="badge type-badge" style="background:${coloresPorTipo[t.type.name] || '#777'};color:${['electric', 'ground', 'steel', 'fairy', 'ice'].includes(t.type.name) ? '#333' : '#fff'}">${t.type.name}</span>`
        ).join(' ');
        const hp = p.stats.find(s => s.stat.name === 'hp').base_stat;
        const atk = p.stats.find(s => s.stat.name === 'attack').base_stat;
        return `
        <div class="col-6 col-sm-4 col-md-2">
            <div class="pokemon-card p-2 text-center h-100" onclick="selectPokemon(${i})" id="card-${i}">
                <img src="${p.sprites.front_default}" class="pokemon-sprite" width="96" alt="${p.name}">
                <h6 class="text-white fw-bold mt-1 mb-1 text-capitalize">${p.name}</h6>
                <div class="mb-1">${types}</div>
                <small class="text-light d-block">❤️ HP: ${hp}</small>
                <small class="text-light d-block">⚔️ ATK: ${atk}</small>
            </div>
        </div>`;
    }).join('');
}

function selectPokemon(index) {
    document.querySelectorAll('.pokemon-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`card-${index}`).classList.add('selected');
    EstadoJuego.selectedId = index;
    document.getElementById('btn-start').classList.remove('d-none');
}

// =============================================
// INICIAR BATALLA
// =============================================
async function Iniciarbatalla() {
    if (EstadoJuego.selectedId === null) return;
    showLoading(true);
    try {
        const playerData = EstadoJuego.pokemonList[EstadoJuego.selectedId];

        // Enemigo: aleatorio entre los demás
        const remaining = [...Array(6).keys()].filter(i => i !== EstadoJuego.selectedId);
        const enemyData = EstadoJuego.pokemonList[remaining[Math.floor(Math.random() * remaining.length)]];

        const [playerMoves, enemyMoves] = await Promise.all([
            getMovesForPokemon(playerData),
            getMovesForPokemon(enemyData)
        ]);

        const buildPokemon = (data, moves) => ({
            name: data.name,
            sprites: data.sprites,
            types: data.types.map(t => t.type.name),
            moves,
            maxHP: data.stats.find(s => s.stat.name === 'hp').base_stat,
            currentHP: data.stats.find(s => s.stat.name === 'hp').base_stat
        });

        EstadoJuego.playerPokemon = buildPokemon(playerData, playerMoves);
        EstadoJuego.enemyPokemon = buildPokemon(enemyData, enemyMoves);
        EstadoJuego.battleActive = true;
        EstadoJuego.playerTurn = true;

        renderBattleScreen();
        showScreen('battle-screen');
        addLog(`⚔️ ¡<b>${cap(playerData.name)}</b> vs <b>${cap(enemyData.name)}</b>!`, 'text-warning');
        addLog(`👤 Es tu turno. ¡Elige un ataque!`, 'text-info');
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
}

// =============================================
// RENDERIZAR BATALLA
// =============================================
function renderBattleScreen() {

    ['player', 'enemy'].forEach(side => {
        const bar = document.getElementById(`${side}-hp-bar`);
        if (bar) {
            bar.style.width = '100%';
            bar.className = 'hp-bar high';
        }
    });

    const p = EstadoJuego.playerPokemon;
    const e = EstadoJuego.enemyPokemon;
    const typeBadges = types => types.map(t =>
        `<span class="badge type-badge ms-1" style="background:${coloresPorTipo[t] || '#777'};color:${['electric', 'ground', 'steel', 'fairy', 'ice'].includes(t) ? '#333' : '#fff'}">${t}</span>`
    ).join('');

    document.getElementById('player-name').textContent = cap(p.name);
    document.getElementById('player-sprite').src = p.sprites.back_default || p.sprites.front_default;
    document.getElementById('player-hp').textContent = p.currentHP;
    document.getElementById('player-maxhp').textContent = p.maxHP;
    document.getElementById('player-types').innerHTML = typeBadges(p.types);

    document.getElementById('enemy-name').textContent = cap(e.name);
    document.getElementById('enemy-sprite').src = e.sprites.front_default;
    document.getElementById('enemy-hp').textContent = e.currentHP;
    document.getElementById('enemy-maxhp').textContent = e.maxHP;
    document.getElementById('enemy-types').innerHTML = typeBadges(e.types);

    renderMoves();
}

function renderMoves() {
    const moveBtnColor = t => ({
        fire: 'btn-danger', water: 'btn-primary', grass: 'btn-success',
        electric: 'btn-warning text-dark', ice: 'btn-info text-dark',
        psychic: 'btn-info', dragon: 'btn-primary', dark: 'btn-dark',
        fighting: 'btn-danger', normal: 'btn-secondary', ghost: 'btn-dark',
        poison: 'btn-secondary', ground: 'btn-warning text-dark',
        flying: 'btn-info text-dark', bug: 'btn-success', rock: 'btn-secondary',
        steel: 'btn-secondary', fairy: 'btn-danger'
    }[t] || 'btn-secondary');

    document.getElementById('move-buttons').innerHTML = EstadoJuego.playerPokemon.moves.map((m, i) => `
        <div class="col-6 col-md-3">
            <button class="move-btn btn ${moveBtnColor(m.type)} w-100 py-2" onclick="playerAttack(${i})" id="mbtn-${i}">
                <div class="text-capitalize fw-bold small">${m.name}</div>
                <small class="opacity-85">
                    <span class="badge" style="background:${coloresPorTipo[m.type] || '#777'};color:${['electric', 'ground', 'steel', 'fairy', 'ice'].includes(m.type) ? '#333' : '#fff'}">${m.type}</span>
                    💥 ${m.power}
                </small>
            </button>
        </div>`
    ).join('');
}

// =============================================
// COMBATE
// =============================================
async function playerAttack(moveIndex) {
    if (!EstadoJuego.battleActive || !EstadoJuego.playerTurn) return;
    EstadoJuego.playerTurn = false;
    setMovesDisabled(true);

    const move = EstadoJuego.playerPokemon.moves[moveIndex];
    const mult = getTypeMultiplier(move.type, EstadoJuego.enemyPokemon.types);
    const dmg = calcDamage(move.power, mult);

    EstadoJuego.enemyPokemon.currentHP = Math.max(0, EstadoJuego.enemyPokemon.currentHP - dmg);

    document.getElementById('enemy-sprite').classList.add('hit-flash');
    setTimeout(() => document.getElementById('enemy-sprite').classList.remove('hit-flash'), 350);

    const eff = getEffectivenessText(mult);
    addLog(`👤 <b>${cap(EstadoJuego.playerPokemon.name)}</b> usó <b>${move.name}</b>! (-${dmg} HP)`, 'text-success');
    if (eff.text) addLog(eff.text, eff.color);
    updateHPBar('enemy', EstadoJuego.enemyPokemon.currentHP, EstadoJuego.enemyPokemon.maxHP);

    if (EstadoJuego.enemyPokemon.currentHP <= 0) { endBattle('player'); return; }
    setTimeout(machineAttack, 1200);
}

function machineAttack() {
    if (!EstadoJuego.battleActive) return;
    const moves = EstadoJuego.enemyPokemon.moves;
    const move = moves[Math.floor(Math.random() * moves.length)];
    const mult = getTypeMultiplier(move.type, EstadoJuego.playerPokemon.types);
    const dmg = calcDamage(move.power, mult);

    EstadoJuego.playerPokemon.currentHP = Math.max(0, EstadoJuego.playerPokemon.currentHP - dmg);

    document.getElementById('player-sprite').classList.add('hit-flash');
    setTimeout(() => document.getElementById('player-sprite').classList.remove('hit-flash'), 350);

    const eff = getEffectivenessText(mult);
    addLog(`🤖 <b>${cap(EstadoJuego.enemyPokemon.name)}</b> usó <b>${move.name}</b>! (-${dmg} HP)`, 'text-danger');
    if (eff.text) addLog(eff.text, eff.color);
    updateHPBar('player', EstadoJuego.playerPokemon.currentHP, EstadoJuego.playerPokemon.maxHP);

    if (EstadoJuego.playerPokemon.currentHP <= 0) { endBattle('enemy'); return; }
    EstadoJuego.playerTurn = true;
    setMovesDisabled(false);
    addLog('👤 Tu turno. ¡Elige un ataque!', 'text-info');
}

// =============================================
// HP BAR
// =============================================
function updateHPBar(side, currentHP, maxHP) {
    const pct = (currentHP / maxHP) * 100;
    const bar = document.getElementById(`${side}-hp-bar`);
    document.getElementById(`${side}-hp`).textContent = currentHP;
    bar.style.width = `${pct}%`;
    bar.className = `hp-bar ${pct > 50 ? 'high' : pct > 25 ? 'medium' : 'low'}`;
}

// =============================================
// FIN DE BATALLA
// =============================================
function endBattle(winner) {
    EstadoJuego.battleActive = false;
    setMovesDisabled(true);
    const resultDiv = document.getElementById('battle-result');
    const resultText = document.getElementById('result-text');
    if (winner === 'player') {
        resultText.innerHTML = `🏆 ¡${cap(EstadoJuego.playerPokemon.name)} ganó la batalla!`;
        resultText.className = 'fw-bold text-warning';
        addLog('🎉 ¡VICTORIA!', 'text-warning fw-bold');
    } else {
        resultText.innerHTML = `💀 ¡${cap(EstadoJuego.enemyPokemon.name)} ganó la batalla!`;
        resultText.className = 'fw-bold text-danger';
        addLog('😭 ¡DERROTA!', 'text-danger fw-bold');
    }
    resultDiv.classList.remove('d-none');
}

function restartGame() {
    // Reiniciar barras de HP visualmente ANTES de cargar nuevos pokémon
    ['player', 'enemy'].forEach(side => {
        const bar = document.getElementById(`${side}-hp-bar`);
        if (bar) {
            bar.style.width = '100%';
            bar.className = 'hp-bar high';
        }
        const hpEl = document.getElementById(`${side}-hp`);
        if (hpEl) hpEl.textContent = '0';
        const maxEl = document.getElementById(`${side}-maxhp`);
        if (maxEl) maxEl.textContent = '0';
    });

    EstadoJuego = {
        pokemonList: [],
        playerPokemon: null,
        enemyPokemon: null,
        selectedId: null,
        playerTurn: true,
        battleActive: false
    };

    document.getElementById('battle-result').classList.add('d-none');
    document.getElementById('battle-log').innerHTML = '';
    document.getElementById('btn-start').classList.add('d-none');
    initGame();
}


// =============================================
// HELPERS UI
// =============================================
function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function showScreen(id) {
    ['selection-screen', 'battle-screen'].forEach(s => document.getElementById(s).classList.add('d-none'));
    document.getElementById(id).classList.remove('d-none');
}

function showLoading(show) {
    document.getElementById('pantalla-carga').style.display = show ? 'flex' : 'none';
}

function addLog(msg, cls = 'text-white') {
    const log = document.getElementById('battle-log');
    if (!log) return;
    const p = document.createElement('p');
    p.className = `mb-1 ${cls}`;
    p.innerHTML = msg;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
}

function setMovesDisabled(disabled) {
    document.querySelectorAll('.move-btn').forEach(b => b.disabled = disabled);
}

// =============================================
// ARRANCAR
// =============================================
initGame();