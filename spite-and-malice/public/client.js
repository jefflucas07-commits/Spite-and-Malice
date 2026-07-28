function renderDiscards(container, discards, mine) {
    container.innerHTML = "";
    discards.forEach((d, i) => {
      const slot = document.createElement("div");
      slot.className = "slot discard-slot";
      
      // Check if the discard pile has a top card
      if (!d.top) {
        slot.dataset.empty = `D${i + 1}`;
      } else {
        slot.classList.add("has-card");
        
        // Render the top card
        const el = cardEl(d.top);
        el.style.position = "absolute";
        el.style.top = "0";
        el.style.left = "0";
        el.style.width = "100%";
        el.style.height = "100%";
        slot.appendChild(el);

        // Show a count badge if there are multiple cards stacked
        if (d.count > 1) {
          const badge = document.createElement("span");
          badge.className = "corner";
          badge.style.cssText = "top:auto;bottom:3px;left:4px;font-size:9px;opacity:.7;transform:none;z-index:5;";
          badge.textContent = d.count;
          slot.appendChild(badge);
        }
      }

      // Selecting a discard as a source (mine, has a card).
      if (mine && d.top && isMyTurn()) {
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