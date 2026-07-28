// Authoritative game engine for a custom variant of Spite and Malice.
// 3 standard decks + all jokers = 162 cards. Jokers are wild.

const SUITS = ["S", "H", "D", "C"];
const STACK_SIZE = 20;
const HAND_SIZE = 5;
const NUM_DISCARDS = 4;
const NUM_CENTER = 4;

let cardSeq = 0;

function makeCard(rank, suit, joker = false) {
  return { id: `c${cardSeq++}`, rank, suit, joker };
}

// Build 3 decks (156) + 6 jokers (2 per deck) = 162 cards.
function buildDeck() {
  const cards = [];
  for (let d = 0; d < 3; d++) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push(makeCard(rank, suit, false));
      }
    }
    cards.push(makeCard(null, null, true));
    cards.push(makeCard(null, null, true));
  }
  return cards;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Create a fresh game for exactly two players.
function createGame(players) {
  const draw = shuffle(buildDeck());

  const state = {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      stack: [],
      discards: [[], [], [], []],
    })),
    center: [[], [], [], []], // each entry is an array of cards; top value = length-based
    draw,
    completed: [], // completed King piles, recycled into draw when empty
    currentPlayerIndex: Math.floor(Math.random() * players.length),
    winner: null,
    log: [],
  };

  // Deal 20-card face-down stacks.
  for (const player of state.players) {
    for (let i = 0; i < STACK_SIZE; i++) {
      player.stack.push(state.draw.pop());
    }
  }

  // Deal opening hands and start the first turn.
  for (const player of state.players) {
    drawUpTo(state, player, HAND_SIZE);
  }

  pushLog(state, `${state.players[state.currentPlayerIndex].name} goes first.`);
  return state;
}

function pushLog(state, msg) {
  state.log.push(msg);
  if (state.log.length > 30) state.log.shift();
}

function recycleIfNeeded(state) {
  if (state.draw.length === 0 && state.completed.length > 0) {
    state.draw = shuffle(state.completed);
    state.completed = [];
    pushLog(state, "Draw pile refilled from completed piles.");
  }
}

function drawUpTo(state, player, size) {
  while (player.hand.length < size) {
    recycleIfNeeded(state);
    if (state.draw.length === 0) break;
    player.hand.push(state.draw.pop());
  }
}

// The value a card contributes. Jokers are wild (return null -> caller decides).
function cardValue(card) {
  return card.joker ? null : card.rank;
}

// Value currently required by a center spot (1..13). Empty spot needs an Ace (1).
function centerNeeds(pile) {
  return pile.length + 1;
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

// Peek the card referenced by a source without removing it.
function peekSource(player, source) {
  if (source.type === "hand") return player.hand[source.index] || null;
  if (source.type === "stack") return player.stack[player.stack.length - 1] || null;
  if (source.type === "discard") {
    const pile = player.discards[source.index];
    return pile[pile.length - 1] || null;
  }
  return null;
}

function removeSource(player, source) {
  if (source.type === "hand") return player.hand.splice(source.index, 1)[0];
  if (source.type === "stack") return player.stack.pop();
  if (source.type === "discard") return player.discards[source.index].pop();
  return null;
}

// Attempt to play a card from a source onto a center building spot.
function playToCenter(state, playerId, source, centerIndex) {
  if (state.winner) return { ok: false, error: "Game is over." };
  const player = currentPlayer(state);
  if (player.id !== playerId) return { ok: false, error: "Not your turn." };
  if (centerIndex < 0 || centerIndex >= NUM_CENTER)
    return { ok: false, error: "Invalid center pile." };

  const card = peekSource(player, source);
  if (!card) return { ok: false, error: "No card there." };

  const pile = state.center[centerIndex];
  const needs = centerNeeds(pile);
  const value = cardValue(card);

  if (value !== null && value !== needs) {
    return { ok: false, error: `That spot needs a ${rankLabel(needs)}.` };
  }

  // Commit the move.
  removeSource(player, source);
  const placed = { ...card, assigned: needs };
  pile.push(placed);

  const label = card.joker ? `Joker as ${rankLabel(needs)}` : rankLabel(needs);
  pushLog(state, `${player.name} played ${label} to center.`);

  // Completed a King pile -> clear it and recycle the cards.
  if (needs === 13) {
    state.completed.push(...pile.splice(0, pile.length));
    pushLog(state, `A center pile reached King and cleared.`);
  }

  // Refill immediately if the hand was fully played out.
  if (player.hand.length === 0) {
    drawUpTo(state, player, HAND_SIZE);
    pushLog(state, `${player.name} emptied their hand and drew back up to 5.`);
  }

  // Win check: emptying the 20-card stack wins the game.
  if (player.stack.length === 0) {
    state.winner = player.id;
    pushLog(state, `${player.name} emptied their stack and wins!`);
  }

  return { ok: true };
}

// Discard a hand card onto one of your own discard piles. This ends the turn.
function discard(state, playerId, handIndex, discardIndex) {
  if (state.winner) return { ok: false, error: "Game is over." };
  const player = currentPlayer(state);
  if (player.id !== playerId) return { ok: false, error: "Not your turn." };
  if (handIndex < 0 || handIndex >= player.hand.length)
    return { ok: false, error: "Invalid hand card." };
  if (discardIndex < 0 || discardIndex >= NUM_DISCARDS)
    return { ok: false, error: "Invalid discard pile." };

  const card = player.hand.splice(handIndex, 1)[0];
  player.discards[discardIndex].push(card);
  pushLog(state, `${player.name} discarded to pile ${discardIndex + 1} and ended their turn.`);

  // Advance to the next player and refill their hand to 5.
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  drawUpTo(state, currentPlayer(state), HAND_SIZE);

  return { ok: true, endedTurn: true };
}

function rankLabel(rank) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function publicCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    joker: card.joker,
    assigned: card.assigned ?? null,
    label: card.joker ? "★" : rankLabel(card.rank),
  };
}

// Build a per-player view of the game (hides opponent hand contents).
function serialize(state, viewerId) {
  return {
    winner: state.winner,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    drawCount: state.draw.length,
    log: state.log.slice(-6),
    center: state.center.map((pile) => ({
      top: publicCard(pile[pile.length - 1]),
      count: pile.length,
      needs: rankLabel(centerNeeds(pile)),
      needsVal: centerNeeds(pile),
    })),
    players: state.players.map((p) => {
      const isViewer = p.id === viewerId;
      return {
        id: p.id,
        name: p.name,
        isViewer,
        stackTop: publicCard(p.stack[p.stack.length - 1]),
        stackCount: p.stack.length,
        handCount: p.hand.length,
        hand: isViewer ? p.hand.map(publicCard) : null,
        discards: p.discards.map((pile) => ({
          top: publicCard(pile[pile.length - 1]),
          count: pile.length,
        })),
      };
    }),
  };
}

module.exports = {
  createGame,
  playToCenter,
  discard,
  serialize,
  rankLabel,
  HAND_SIZE,
  NUM_DISCARDS,
  NUM_CENTER,
  STACK_SIZE,
};
