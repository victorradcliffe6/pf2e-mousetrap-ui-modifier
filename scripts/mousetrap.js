const INCLUDE_GM_ACTIONS = true;

/* -------------------------------------------- */
/* UTIL                                         */
/* -------------------------------------------- */

function isTrackedUser(userId) {
  const u = game.users.get(userId);
  if (!u) return false;
  return INCLUDE_GM_ACTIONS ? true : !u.isGM;
}

function gmLog(msg) {
  ChatMessage.create({
    content: msg,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}

function safeNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "value" in v) return Number(v.value) || 0;
  return Number(v) || 0;
}

/* -------------------------------------------- */
/* SPELL SNAPSHOT SYSTEM                        */
/* -------------------------------------------- */

const actorSpellCache = new Map();

function spellName(actor, id) {
  if (!id) return "Empty";
  return actor.items.get(id)?.name ?? `SpellID:${id}`;
}

function snapshotPrepared(actor) {
  const rows = [];

  for (const entry of actor.itemTypes.spellcastingEntry ?? []) {
    const slots = entry.system?.slots ?? {};
    for (const [slotKey, slot] of Object.entries(slots)) {

      const match = slotKey.match(/^slot(\d+)$/);
      if (!match) continue;

      const rank = Number(match[1]);

      (slot.prepared ?? []).forEach((s, i) => {
        rows.push([entry.name, rank, i, s?.id ?? null]);
      });
    }
  }

  rows.sort((a, b) =>
    a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2]
  );

  return rows;
}

function snapshotSpellbook(actor) {
  const rows = [];
  for (const sp of actor.itemTypes.spell ?? []) {
    rows.push([sp.id, sp.system?.location?.value ?? null]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return rows;
}

function keyify(rows) {
  return JSON.stringify(rows);
}

function diffPrepared(actor, oldRows, newRows) {
  const oldMap = new Map(oldRows.map(r => [`${r[0]}|${r[1]}|${r[2]}`, r[3]]));
  const newMap = new Map(newRows.map(r => [`${r[0]}|${r[1]}|${r[2]}`, r[3]]));

  for (const [key, newId] of newMap) {

    const oldId = oldMap.get(key);
    if (oldId === newId) continue;

    const [entry, rank, slot] = key.split("|");

    gmLog(
      `<b>${actor.name}</b> prep slot ${Number(slot) + 1} (Rank ${rank}) → <b>${spellName(actor, newId)}</b> → ${entry}`
    );
  }
}

function diffSpellbook(actor, oldRows, newRows) {
  const oldMap = new Map(oldRows);
  const newMap = new Map(newRows);

  for (const [id, newLoc] of newMap) {

    const oldLoc = oldMap.get(id);
    if (oldLoc === newLoc) continue;

    const name = actor.items.get(id)?.name ?? `SpellID:${id}`;

    if (!oldLoc && newLoc) gmLog(`<b>${actor.name}</b> learned spell → <b>${name}</b>`);
    else if (oldLoc && !newLoc) gmLog(`<b>${actor.name}</b> removed spell → <b>${name}</b>`);
    else gmLog(`<b>${actor.name}</b> moved spell → <b>${name}</b>`);
  }
}

function checkActorSpells(actor) {

  const newPrep = snapshotPrepared(actor);
  const newBook = snapshotSpellbook(actor);

  const old = actorSpellCache.get(actor.id);
  if (!old) {
    actorSpellCache.set(actor.id, { prepKey: keyify(newPrep), bookKey: keyify(newBook) });
    return;
  }

  diffPrepared(actor, JSON.parse(old.prepKey), newPrep);
  diffSpellbook(actor, JSON.parse(old.bookKey), newBook);

  actorSpellCache.set(actor.id, { prepKey: keyify(newPrep), bookKey: keyify(newBook) });
}

/* -------------------------------------------- */
/* READY                                        */
/* -------------------------------------------- */

Hooks.once("ready", () => {

  if (!game.user.isGM) return;

  console.log("PF2E MOUSETRAP ACTIVE");

  for (const a of game.actors.contents) {
    actorSpellCache.set(a.id, {
      prepKey: keyify(snapshotPrepared(a)),
      bookKey: keyify(snapshotSpellbook(a))
    });
  }
});

/* -------------------------------------------- */
/* SPELL TRIGGERS                               */
/* -------------------------------------------- */

Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!game.user.isGM) return;
  if (!isTrackedUser(userId)) return;
  if (!actor.hasPlayerOwner) return;

  checkActorSpells(actor);

  /* CURRENCY */

  if (changes.system?.currency) {

    const oldC = actor._source.system.currency;
    const newC = actor.system.currency;

    for (let type in newC) {

      const diff = safeNumber(newC[type]) - safeNumber(oldC[type]);
      if (diff !== 0) {
        gmLog(`<b>${actor.name}</b> ${type.toUpperCase()} ${diff > 0 ? "+" : ""}${diff}`);
      }
    }
  }

  /* FOCUS */

  if (changes.system?.resources?.focus?.value !== undefined) {

    gmLog(
      `<b>${actor.name}</b> Focus → ${actor._source.system.resources.focus.value} → ${actor.system.resources.focus.value}`
    );
  }
});

/* -------------------------------------------- */
/* ITEM TRACKING                                */
/* -------------------------------------------- */

Hooks.on("updateItem", (item, changes, options, userId) => {

  if (!game.user.isGM) return;
  if (!isTrackedUser(userId)) return;

  const actor = item.actor;
  if (!actor || !actor.hasPlayerOwner) return;

  checkActorSpells(actor);

  if (changes.system?.quantity !== undefined) {

    gmLog(
      `<b>${actor.name}</b> ${item.name} qty → ${item._source.system.quantity} → ${item.system.quantity}`
    );
  }

  if (changes.system?.uses?.value !== undefined) {

    gmLog(
      `<b>${actor.name}</b> ${item.name} uses → ${item._source.system.uses?.value} → ${item.system.uses?.value}`
    );
  }
});

/* -------------------------------------------- */
/* CONDITIONS                                   */
/* -------------------------------------------- */

Hooks.on("createItem", (item, options, userId) => {

  if (!game.user.isGM) return;
  if (!isTrackedUser(userId)) return;
  if (item.type !== "condition") return;
  if (!item.actor?.hasPlayerOwner) return;

  gmLog(`<b>${item.actor.name}</b> gained condition → ${item.name}`);
});

Hooks.on("deleteItem", (item, options, userId) => {

  if (!game.user.isGM) return;
  if (!isTrackedUser(userId)) return;
  if (item.type !== "condition") return;
  if (!item.actor?.hasPlayerOwner) return;

  gmLog(`<b>${item.actor.name}</b> removed condition → ${item.name}`);
});
