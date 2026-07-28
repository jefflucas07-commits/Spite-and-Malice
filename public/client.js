/* global io */
(() => {
  const socket = io();

  const SUIT = { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" };
  const RED = { H: true, D: true };

  const screens = {
    lobby: document.getElementById("lobby"),
    waiting: document.getElementById("waiting"),
    game: document.getElementById("game"),
  };

  const els = {
    nameInput: document.getElementById("nameInput"),
    createBtn: document.getElementById("createBtn"),
    roomInput: document.getElementById("roomInput"),
    joinBtn: document.getElementById("joinBtn"),
    lobbyMsg: document.getElementById("lobbyMsg"),
    roomCodeDisplay: document.getElementById("roomCodeDisplay"),
    copyLinkBtn: document.getElementById("copyLinkBtn"),
    seatList: document.getElementById("seatList"),
    waitingMsg: document.getElementById("waitingMsg"),

    oppName: document.getElementById("oppName"),
    oppHand: document.getElementById("oppHand"),
    oppStack: document.getElementById("oppStack"),
    oppStackCount: document.getElementById("oppStackCount"),
    oppDiscards: document.getElementById("oppDiscards"),

    turnFlag: document.getElementById("turnFlag"),
    drawCount: document.getElementById("drawCount"),
    centerPiles: document.getElementById("centerPiles"),
    hint: document.getElementById("hint"),

    myStack: document.getElementById("myStack"),
    myStackCount: document.getElementById("myStackCount"),
    myDiscards: document.getElementById("myDiscards"),
    myHand: document.getElementById("myHand"),
    myName: document.getElementById("myName"),
    myTip: document.getElementById("myTip"),

    overlay: document.getElementById("overlay"),
    overTitle: document.getElementById("overTitle"),
    overText: document.getElementById("overText"),
    rematchBtn: document.getElementById("rematchBtn"),
    toast: document.getElementById("toast"),
  };

  let myPlayerId = null;
  let roomId = null;
  let latest = null; // last state received
  let selection = null; // { type: 'hand'|'stack'|'discard', index }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("active", key === name);
    });
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  // ---------- Card rendering ----------
  function cardEl(card, opts = {}) {
    const el = document.createElement("div");
    el.className = "card";
    if (!card) return el;

    if (card.joker) {
      el.classList.add("joker");
      const val = opts.faceValue || card.label;
      el.innerHTML =
        `<span class="corner">${val}</span>` +
        `<span class="pip">\u2605</span>` +
        `<span class="corner br">${val}</span>`;
      return el;
    }

    const val = opts.faceValue || card.label;
    const suit = SUIT[card.suit] || "";
    el.classList.add(RED[card.suit] ? "red" : "black");
    el.innerHTML =
      `<span class="corner">${val}${suit}</span>` +
      `<span class="pip">${suit}</span>` +
      `<span class="corner br">${val}${suit}</span>`;
    return el;
  }

  function backEl() {
    const el = document.createElement("div");
    el.className = "card back";
    return el;
  }

  function emptySlot(label) {
    const el = document.createElement("div");
    el.className = "slot";
    el.dataset.empty = label;
    return el;
  }

  // ---------- Selection ----------
  function isMyTurn() {
    return latest && latest.currentPlayerId === myPlayerId && !latest.winner;
  }

  function selectedCard() {
    if (!selection || !latest) return null;
    const me = latest.players.find((p) => p.isViewer);
    if (!me) return null;
    if (selection.type === "hand") return me.hand[selection.index];
    if (selection.type === "stack") return me.stackTop;
    if (selection.type === "discard") return me.discards[selection.index].top;
    return null;
  }

  function clearSelection() {
    selection = null;
    render();
  }

  function selectSource(type, index) {
    if (!isMyTurn()) {
      toast("Wait for your turn.");
      return;
    }
    if (selection && selection.type === type && selection.index === index) {
      clearSelection();
      return;
    }
    selection = { type, index };
    render();
  }

  function playToCenter(centerIndex) {
    if (!selection) return;
    socket.emit("play", { source: selection, centerIndex });
    selection = null;
  }

  function doDiscard(discardIndex) {
    if (!selection || selection.type !== "hand") return;
    socket.emit("discard", { handIndex: selection.index, discardIndex });
    selection = null;
  }

  // Which center piles accept the selected card?
  function validCenter(centerIndex) {
    const card = selectedCard();
    if (!card) return false;
    const pile = latest.center[centerIndex];
    if (card.joker) return true;
    return card.rank === pile.needsVal;
  }

  // ---------- Render ----------
  function render() {
    if (!latest) return;
    const me = latest.players.find((p) => p.isViewer);
    const opp = latest.players.find((p) => !p.isViewer);
    const myTurn = isMyTurn();

    // Opponent
    if (opp) {
      els.oppName.textContent = opp.name + (latest.currentPlayerId === opp.id ? " \u2022 turn" : "");
      els.oppHand.textContent = `Hand: ${opp.handCount}`;
      renderSlot(els.oppStack, opp.stackTop, "Stack", null);
      els.oppStackCount.textContent = opp.stackCount;
      renderDiscards(els.oppDiscards, opp.discards, false);
    }

    // Center
    els.turnFlag.textContent = latest.winner
      ? "Game over"
      : myTurn
        ? "Your turn"
        : `${opp ? opp.name : "Opponent"}'s turn`;
    els.turnFlag.classList.toggle("my-turn", myTurn);
    els.drawCount.textContent = `Draw: ${latest.drawCount}`;
    renderCenter();

    // Me
    if (me) {
      els.myName.textContent = me.name + (myTurn ? " \u2022 your turn" : "");
      renderSlot(els.myStack, me.stackTop, "Stack", { type: "stack", index: 0 });
      els.myStackCount.textContent = me.stackCount;
      renderDiscards(els.myDiscards, me.discards, true);
      renderHand(me.hand);
    }

    // Tip / hint
    const card = selectedCard();
    if (!myTurn) {
      els.myTip.textContent = "Opponent is playing…";
      els.hint.textContent = "Build A \u2192 K on the center piles. Jokers are wild.";
    } else if (card) {
      els.myTip.textContent =
        selection.type === "hand"
          ? "Tap a center pile to play, or a discard pile to end turn"
          : "Tap a matching center pile";
      els.hint.textContent = "Green outline = valid target. Tap again to deselect.";
    } else {
      els.myTip.textContent = "Tap a card to select";
      els.hint.textContent = "Play from hand, stack, or a discard pile. End turn by discarding.";
    }

    refreshStackSelection();

    // Overlay
    if (latest.winner) {
      const iWon = latest.winner === myPlayerId;
      els.overTitle.textContent = iWon ? "You win!" : "You lost";
      els.overText.textContent = iWon
        ? "You emptied your stack first. Well played."
        : "Your opponent emptied their stack first.";
      els.overlay.classList.add("active");
    } else {
      els.overlay.classList.remove("active");
    }
  }

  // Paint a stack slot: empty dashed slot, or the face-up top card visuals.
  function renderSlot(container, card, label) {
    container.className = "slot";
    if (!card) {
      container.dataset.empty = label;
      container.innerHTML = "";
      return;
    }
    const el = cardEl(card);
    container.className = "slot has-card " + el.className;
    container.innerHTML = el.innerHTML;
  }

  function renderDiscards(container, discards, mine) {
    container.innerHTML = "";
    discards.forEach((d, i) => {
      let el;
      if (d.top) {
        el = cardEl(d.top);
      } else {
        el = emptySlot(mine ? `D${i + 1}` : `D${i + 1}`);
      }
      // Selecting a discard as a source (mine, has card).
      if (mine && d.top && isMyTurn()) {
        el.classList.add("selectable");
        if (selection && selection.type === "discard" && selection.index === i) {
          el.classList.add("selected");
        }
        el.addEventListener("click", () => selectSource("discard", i));
      }
      // Discard as a target for ending the turn (hand card selected).
      if (mine && selection && selection.type === "hand" && isMyTurn()) {
        el.classList.add("target");
        el.addEventListener("click", () => doDiscard(i));
      }
      if (d.count > 1) {
        const badge = document.createElement("span");
        badge.className = "corner";
        badge.style.cssText =
          "top:auto;bottom:3px;left:4px;font-size:9px;opacity:.6;transform:none";
        badge.textContent = d.count;
        el.appendChild(badge);
      }
      container.appendChild(el);
    });
  }

  function renderCenter() {
    els.centerPiles.innerHTML = "";
    latest.center.forEach((pile, i) => {
      let el;
      if (pile.top) {
        el = cardEl(pile.top, { faceValue: labelFor(pile.top.assigned) });
      } else {
        el = emptySlot("A");
      }
      if (selection && isMyTurn() && validCenter(i)) {
        el.classList.add("target");
        el.addEventListener("click", () => playToCenter(i));
      }
      els.centerPiles.appendChild(el);
    });
  }

  function labelFor(v) {
    return { 1: "A", 11: "J", 12: "Q", 13: "K" }[v] || String(v);
  }

  function renderHand(hand) {
    els.myHand.innerHTML = "";
    (hand || []).forEach((card, i) => {
      const el = cardEl(card);
      if (isMyTurn()) {
        el.classList.add("selectable");
        if (selection && selection.type === "hand" && selection.index === i) {
          el.classList.add("selected");
        }
        el.addEventListener("click", () => selectSource("hand", i));
      }
      els.myHand.appendChild(el);
    });
  }

  // Special handling for the stack slot click (source select).
  function wireStack() {
    els.myStack.addEventListener("click", () => {
      const me = latest && latest.players.find((p) => p.isViewer);
      if (me && me.stackTop && isMyTurn()) selectSource("stack", 0);
    });
  }

  // Reflect stack selection outline.
  function refreshStackSelection() {
    const selectedStack = selection && selection.type === "stack";
    els.myStack.classList.toggle("selected", !!selectedStack);
    const me = latest && latest.players.find((p) => p.isViewer);
    els.myStack.classList.toggle(
      "selectable",
      !!(me && me.stackTop && isMyTurn())
    );
  }

  // ---------- Socket events ----------
  socket.on("state", (state) => {
    latest = state;
    render();
    refreshStackSelection();
  });

  socket.on("lobby", (info) => {
    if (!roomId) return;
    renderLobby(info);
  });

  socket.on("actionError", (msg) => {
    toast(msg);
    selection = null;
    render();
  });

  function renderLobby(info) {
    els.seatList.innerHTML = "";
    const seats = [info.players[0], info.players[1]];
    for (let i = 0; i < 2; i++) {
      const li = document.createElement("li");
      const seat = seats[i];
      li.className = seat && seat.connected ? "on" : "";
      li.innerHTML = `<span class="dot"></span><span>${
        seat ? seat.name : "Waiting for player…"
      }</span>`;
      els.seatList.appendChild(li);
    }
    if (info.started) {
      showScreen("game");
    }
  }

  // ---------- Lobby actions ----------
  els.createBtn.addEventListener("click", () => {
    const name = els.nameInput.value.trim() || "Player 1";
    socket.emit("createRoom", { name }, (res) => {
      if (!res.ok) return (els.lobbyMsg.textContent = res.error || "Could not create room.");
      roomId = res.roomId;
      myPlayerId = res.playerId;
      els.roomCodeDisplay.textContent = roomId;
      history.replaceState(null, "", `?room=${roomId}`);
      showScreen("waiting");
    });
  });

  els.joinBtn.addEventListener("click", joinFlow);
  els.roomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.nativeEvent?.isComposing) joinFlow();
  });

  function joinFlow() {
    const code = els.roomInput.value.trim().toUpperCase();
    if (code.length !== 4) return (els.lobbyMsg.textContent = "Enter a 4-letter room code.");
    const name = els.nameInput.value.trim() || "Player 2";
    socket.emit("joinRoom", { roomId: code, name }, (res) => {
      if (!res.ok) return (els.lobbyMsg.textContent = res.error || "Could not join.");
      roomId = res.roomId;
      myPlayerId = res.playerId;
      els.roomCodeDisplay.textContent = roomId;
      history.replaceState(null, "", `?room=${roomId}`);
      // If the game hasn't started we land in the waiting room; state event moves us to game.
      showScreen("waiting");
    });
  }

  els.copyLinkBtn.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      els.waitingMsg.style.color = "var(--gold-dark)";
      els.waitingMsg.textContent = "Invite link copied!";
    } catch {
      els.waitingMsg.style.color = "var(--gold-dark)";
      els.waitingMsg.textContent = url;
    }
  });

  els.rematchBtn.addEventListener("click", () => {
    socket.emit("rematch");
    els.overlay.classList.remove("active");
  });

  // ---------- Init ----------
  wireStack();
  const params = new URLSearchParams(location.search);
  const preRoom = params.get("room");
  if (preRoom) {
    els.roomInput.value = preRoom.toUpperCase().slice(0, 4);
    els.lobbyMsg.style.color = "var(--gold-dark)";
    els.lobbyMsg.textContent = `Joining room ${preRoom.toUpperCase()} — enter your name and tap Join.`;
  }
})();
