// Lädt die aktuelle Channel-Edition (content/channel.json) und rendert
// sie in den "Daily Channel"-Bereich der App. Word-Packs und Beat-Preset
// lassen sich per Klick direkt in den Trainer übernehmen.

const channelContent = document.getElementById("channelContent");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyWordPack(pack) {
  const keywords = document.getElementById("keywords");
  keywords.value = pack.words.slice(0, 3).join(", ");
  keywords.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("generateLyrics").click();
  keywords.scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyBeatPreset(preset) {
  const bpm = document.getElementById("bpm");
  bpm.value = String(preset.bpm);
  bpm.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderChannel(data) {
  channelContent.replaceChildren();

  const meta = el("div", "channel-meta");
  meta.append(
    el("span", "badge", `Edition ${data.edition}`),
    el("span", "badge badge-theme", `${data.theme.title} · ${data.theme.mood}`),
    el(
      "span",
      "badge badge-score",
      `Editor-Score ${data.editorial.score}/100`,
    ),
  );
  channelContent.append(meta);

  const grid = el("div", "channel-cards");

  // Tages-Challenge
  const challenge = el("article", "channel-card");
  challenge.append(
    el("h3", null, `🎯 ${data.challenge.title}`),
    el("p", null, data.challenge.task),
    el("p", "channel-constraint", `Zusatzregel: ${data.challenge.constraint}`),
  );
  const challengeMeta = el(
    "p",
    "channel-small",
    `${data.challenge.bars} Bars · Ziel-BPM ${data.challenge.bpm} · Beat: ${data.beatPreset.pattern}`,
  );
  const applyBpm = el("button", "btn chip-btn", "BPM übernehmen");
  applyBpm.addEventListener("click", () => applyBeatPreset(data.beatPreset));
  challenge.append(challengeMeta, applyBpm);
  grid.append(challenge);

  // Wortpakete
  const packs = el("article", "channel-card");
  packs.append(el("h3", null, "📦 Wortpakete"));
  data.wordPacks.forEach((pack) => {
    const wrap = el("div", "pack");
    wrap.append(el("p", "channel-small", pack.title));
    const chips = el("div", "chips");
    pack.words.forEach((word) => chips.append(el("span", "chip", word)));
    const use = el("button", "btn chip-btn", "In Trainer übernehmen");
    use.addEventListener("click", () => applyWordPack(pack));
    wrap.append(chips, use);
    packs.append(wrap);
  });
  grid.append(packs);

  // Reimpaare + Starter-Bars
  const rhymes = el("article", "channel-card");
  rhymes.append(el("h3", null, "🔗 Reimpaare des Tages"));
  const chips = el("div", "chips");
  data.rhymePairs.forEach((pair) =>
    chips.append(el("span", "chip", `${pair.a} / ${pair.b}`))
  );
  rhymes.append(chips, el("h3", null, "🎤 Starter-Bars"));
  data.starterBars.forEach((bar) => {
    rhymes.append(
      el("p", "starter-bar", `„${bar.line}“ (${bar.syllables} Silben)`),
    );
  });
  grid.append(rhymes);

  // Flow-Tipp + Zitat
  const tip = el("article", "channel-card");
  tip.append(
    el("h3", null, `💡 ${data.flowTip.title}`),
    el("p", null, data.flowTip.tip),
    el("blockquote", "channel-quote", `„${data.quote}“`),
  );
  grid.append(tip);

  channelContent.append(grid);
}

async function loadChannel() {
  try {
    const response = await fetch("content/channel.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderChannel(await response.json());
  } catch (_error) {
    channelContent.replaceChildren(
      el(
        "p",
        "channel-empty",
        "Channel-Feed nicht erreichbar. Die Seite muss über einen Webserver laufen " +
          "(z. B. GitHub Pages oder `deno run -A jsr:@std/http/file-server`).",
      ),
    );
  }
}

loadChannel();
