function renderDiscards(container, discards, mine) {
    container.innerHTML = "";
    discards.forEach((d, i) => {
      const slot = document.createElement("div");
      slot.className = "slot discard-slot";
      if (!d.cards || d.cards.length === 0) {
        slot.dataset.empty = `D${i + 1}`;
      } else {
        slot.classList.add("has-card");
        // Cascade and render every card in the pile
        d.cards.forEach((card, cardIdx) => {
          const el = cardEl(card);
          el.style.position = "absolute";
          el.style.top = `${cardIdx * 10}px`;
          el.style.left = "0";
          el.style.width = "100%";
          el.style.height = "100%";
          el.style.zIndex = cardIdx + 1;
          slot.appendChild(el);
        });
      }

      // Selecting a discard as a source (mine, has cards).
      if (mine && d.cards && d.cards.length > 0 && isMyTurn()) {
        slot.classList.add("selectable");
        if (selection && selection.type === "discard" && selection.index === i) {
          slot.classList.add("selected");
        }
        slot.addEventListener("click", () => selectSource("discard", i));
      }

      // Discard as a target for ending the turn (hand card selected).
      if (mine && selection && selection.type === "hand" && isMyTurn()) {
        slot.classList.add("target");
        slot.addEventListener("click", () => doDiscard(i));
      }

      container.appendChild(slot);
    });
  }