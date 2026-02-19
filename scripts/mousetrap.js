
Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  console.log("PF2e Mousetrap UI Modifier V2.1 | Active");
});

function sendGMChat(message) {
  ChatMessage.create({
    speaker: { alias: "Mousetrap" },
    content: message,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}

function isPlayerAction(userId){
  const u = game.users.get(userId);
  return !!u && !u.isGM;
}

function diffCurrency(oldC, newC){
  const keys = new Set([...Object.keys(oldC ?? {}), ...Object.keys(newC ?? {})]);
  const changes = [];
  for (const k of keys){
    const diff = (newC?.[k] ?? 0) - (oldC?.[k] ?? 0);
    if (diff !== 0){
      const sign = diff > 0 ? "+" : "";
      changes.push(`${sign}${diff} ${k}`);
    }
  }
  return changes.join(", ");
}

function getEntryName(actor, entryId){
  const entry = actor.system.spellcasting?.[entryId];
  return entry?.name || "Unknown Entry";
}

function getSpellEntryNameFromItem(actor, spellItem){
  const entryId = spellItem?.system?.location?.value;
  return entryId ? getEntryName(actor, entryId) : "No Entry";
}

/* ---------------- ACTOR UPDATES ---------------- */

Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!game.user.isGM) return;
  if (!isPlayerAction(userId)) return;

  const oldSystem = actor._source?.system ?? {};

  const newFocus = changes.system?.resources?.focus?.value;
  if (newFocus !== undefined) {
    const oldFocus = oldSystem.resources?.focus?.value;
    sendGMChat(`<b>${actor.name}</b> Focus: ${oldFocus} → ${newFocus}`);
  }

  if (changes.system?.currency) {
    const merged = foundry.utils.mergeObject(oldSystem.currency ?? {}, changes.system.currency);
    const diff = diffCurrency(oldSystem.currency ?? {}, merged);
    sendGMChat(`<b>${actor.name}</b> Money: ${diff || "updated"}`);
  }

  let prepEvents = 0;
  if (changes.system?.spellcasting) {
    const oldEntries = oldSystem.spellcasting ?? {};
    const newEntries = actor.system.spellcasting ?? {};

    for (const [entryId, entry] of Object.entries(newEntries)) {
      const oldEntry = oldEntries[entryId];
      if (!oldEntry?.slots || !entry?.slots) continue;

      for (const slotKey of Object.keys(entry.slots)) {
        const newSlot = entry.slots[slotKey];
        const oldSlot = oldEntry.slots?.[slotKey];
        if (!newSlot?.prepared || !oldSlot?.prepared) continue;

        const maxLen = Math.max(newSlot.prepared.length, oldSlot.prepared.length);
        for (let i = 0; i < maxLen; i++) {
          const newPrepId = newSlot.prepared[i]?.id;
          const oldPrepId = oldSlot.prepared[i]?.id;

          if (newPrepId !== oldPrepId) {
            const spell = newPrepId ? actor.items.get(newPrepId) : null;
            const entryName = getEntryName(actor, entryId);
            sendGMChat(
              `<b>${actor.name}</b> prepared → ${spell?.name ?? "Empty Slot"} (Rank ${newSlot.level}) → ${entryName}`
            );
            prepEvents++;
          }
        }
      }
    }

    if (prepEvents === 0) {
      sendGMChat(`<b>${actor.name}</b> modified spellcasting (catch-all)`);
    }
  }
});

/* ---------------- ITEM UPDATES ---------------- */

Hooks.on("updateItem", (item, changes, options, userId) => {
  if (!game.user.isGM) return;
  if (!isPlayerAction(userId)) return;

  const actor = item.actor;
  const oldSys = item._source?.system ?? {};

  if (item.type === "spell" && changes.system?.location?.value !== undefined) {
    const newLoc = changes.system.location.value;
    const oldLoc = oldSys.location?.value;

    const newEntry = newLoc ? getEntryName(actor, newLoc) : "None";
    const oldEntry = oldLoc ? getEntryName(actor, oldLoc) : "None";

    if (!oldLoc && newLoc) {
      sendGMChat(`<b>${actor.name}</b> learned → ${item.name} → ${newEntry}`);
    } else if (oldLoc && !newLoc) {
      sendGMChat(`<b>${actor.name}</b> removed from spellbook → ${item.name} → ${oldEntry}`);
    } else {
      sendGMChat(`<b>${actor.name}</b> moved spell → ${item.name} → ${newEntry}`);
    }

    sendGMChat(`<b>${actor.name}</b> spell change (catch-all) → ${item.name} → ${newEntry}`);
    return;
  }

  if (item.type === "spell" && changes.system) {
    const entryName = getSpellEntryNameFromItem(actor, item);
    sendGMChat(`<b>${actor.name}</b> updated spell → ${item.name} → ${entryName}`);
  }

  if (changes.system?.quantity !== undefined) {
    sendGMChat(`<b>${actor.name}</b> ${item.name} qty: ${oldSys.quantity} → ${changes.system.quantity}`);
  }

  if (changes.system?.uses?.value !== undefined) {
    const oldVal = oldSys.uses?.value;
    sendGMChat(`<b>${actor.name}</b> ${item.name} charges: ${oldVal} → ${changes.system.uses.value}`);
  }
});

/* ---------------- CONDITIONS ---------------- */

Hooks.on("createItem", (item, options, userId) => {
  if (!game.user.isGM) return;
  if (!isPlayerAction(userId)) return;
  if (item.type !== "condition") return;

  const actor = item.actor;
  sendGMChat(`<b>${actor.name}</b> gained → ${item.name}`);
});

Hooks.on("deleteItem", (item, options, userId) => {
  if (!game.user.isGM) return;
  if (!isPlayerAction(userId)) return;
  if (item.type !== "condition") return;

  const actor = item.actor;
  sendGMChat(`<b>${actor.name}</b> removed → ${item.name}`);
});
