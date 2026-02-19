
Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  console.log("PF2e GM Surveillance v1.1 | Active");
});

function sendGMChat(message) {
  ChatMessage.create({
    speaker: { alias: "GM Surveillance" },
    content: message,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}

function diffCurrency(oldC, newC){
  let changes = [];
  for (let k of Object.keys(newC)){
    const diff = (newC[k] ?? 0) - (oldC[k] ?? 0);
    if (diff !== 0){
      const sign = diff > 0 ? "+" : "";
      changes.push(`${sign}${diff} ${k}`);
    }
  }
  return changes.join(", ");
}

Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!game.user.isGM) return;
  if (!actor.hasPlayerOwner) return;

  const oldData = actor._source.system;

  // Focus
  const newFocus = changes.system?.resources?.focus?.value;
  if (newFocus !== undefined) {
    const oldFocus = oldData.resources.focus.value;
    sendGMChat(`<b>${actor.name}</b> Focus: ${oldFocus} → ${newFocus}`);
  }

  // Currency
  if (changes.system?.currency) {
    const diff = diffCurrency(oldData.currency, foundry.utils.mergeObject(oldData.currency, changes.system.currency));
    sendGMChat(`<b>${actor.name}</b> Money: ${diff}`);
  }

  // Spellcasting
  if (changes.system?.spellcasting) {
    sendGMChat(`<b>${actor.name}</b> modified spellcasting`);
  }
});

Hooks.on("updateItem", (item, changes) => {
  if (!game.user.isGM) return;
  const actor = item.actor;
  if (!actor?.hasPlayerOwner) return;

  const oldData = item._source.system;

  // Quantity
  if (changes.system?.quantity !== undefined) {
    sendGMChat(`<b>${actor.name}</b> ${item.name} qty: ${oldData.quantity} → ${changes.system.quantity}`);
  }

  // Uses
  if (changes.system?.uses?.value !== undefined) {
    sendGMChat(`<b>${actor.name}</b> ${item.name} charges: ${oldData.uses.value} → ${changes.system.uses.value}`);
  }

  // Spell prep movement
  if (item.type === "spell" && changes.system?.location !== undefined) {
    sendGMChat(`<b>${actor.name}</b> prepared/unprepared → ${item.name}`);
  }
});

Hooks.on("createItem", (item) => {
  if (!game.user.isGM) return;
  if (item.type !== "condition") return;
  if (item.actor?.hasPlayerOwner) {
    sendGMChat(`<b>${item.actor.name}</b> gained → ${item.name}`);
  }
});

Hooks.on("deleteItem", (item) => {
  if (!game.user.isGM) return;
  if (item.type !== "condition") return;
  if (item.actor?.hasPlayerOwner) {
    sendGMChat(`<b>${item.actor.name}</b> removed → ${item.name}`);
  }
});
