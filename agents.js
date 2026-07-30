// Agent-Dashboard: visualisiert channel.json (aktuelle Edition, Gates,
// Health) und agent-log.json (Lauf-Protokoll der Pipeline).

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} für ${path}`);
  return response.json();
}

function renderHealth(channel) {
  const cards = document.getElementById("healthCards");
  cards.replaceChildren();

  const statusLabel = { gruen: "Grün", gelb: "Gelb", rot: "Rot" };
  const entries = [
    ["Status", statusLabel[channel.health.status] ?? channel.health.status],
    ["Editionen gesamt", String(channel.health.editionCount)],
    ["Im Archiv", String(channel.health.archivedEditions)],
    ["Zuletzt bereinigt", String(channel.health.prunedEditions)],
  ];

  entries.forEach(([label, value]) => {
    const card = el("div", `health-card health-${channel.health.status}`);
    card.append(el("strong", null, value), el("small", null, label));
    cards.append(card);
  });

  const notes = document.getElementById("healthNotes");
  notes.replaceChildren();
  channel.health.notes.forEach((note) =>
    notes.append(el("p", "channel-small", `• ${note}`))
  );
}

function renderEdition(channel) {
  const info = document.getElementById("editionInfo");
  info.replaceChildren(
    el("p", null, `Edition ${channel.edition} – Thema „${channel.theme.title}“`),
    el(
      "p",
      "channel-small",
      `Generiert: ${new Date(channel.generatedAt).toLocaleString("de-DE")} · ` +
        `Versuch ${channel.attempt + 1} · Score ${channel.editorial.score}/100`,
    ),
  );

  const gates = document.getElementById("gateList");
  gates.replaceChildren();
  channel.editorial.gates.forEach((gate) => {
    const row = el("div", `gate ${gate.passed ? "gate-ok" : "gate-fail"}`);
    row.append(
      el("strong", null, `${gate.passed ? "✔" : "✘"} ${gate.gate}`),
      el("small", null, gate.details),
    );
    gates.append(row);
  });
}

function renderLog(log) {
  const tbody = document.querySelector("#logTable tbody");
  tbody.replaceChildren();

  if (log.length === 0) {
    const row = el("tr");
    row.append(el("td", "channel-empty", "Noch keine Läufe protokolliert."));
    tbody.append(row);
    return;
  }

  log.forEach((entry) => {
    const row = el("tr");
    const stages = entry.stages
      .map((stage) => `${stage.ok ? "✔" : "✘"} ${stage.name}`)
      .join("  ");

    row.append(
      el("td", null, new Date(entry.runAt).toISOString().replace("T", " ").slice(0, 16)),
      el("td", null, entry.edition),
      el("td", `status status-${entry.status}`, entry.status),
      el("td", null, String(entry.score)),
      el("td", "channel-small", stages),
    );
    tbody.append(row);
  });
}

function markStages(log) {
  if (log.length === 0) return;
  const lastRun = log[0];
  lastRun.stages.forEach((stage) => {
    const node = document.querySelector(`.stage[data-stage="${stage.name}"]`);
    if (node) node.classList.add(stage.ok ? "stage-ok" : "stage-fail");
  });
}

async function renderUploads() {
  let uploads;
  try {
    uploads = await fetchJson("content/youtube-log.json");
  } catch (_error) {
    return; // Noch keine Uploads – Sektion bleibt ausgeblendet.
  }
  if (!Array.isArray(uploads) || uploads.length === 0) return;

  const tbody = document.querySelector("#uploadTable tbody");
  tbody.replaceChildren();
  uploads.forEach((entry) => {
    const row = el("tr");
    const linkCell = el("td");
    const link = el("a", null, entry.url);
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener";
    linkCell.append(link);

    row.append(
      el("td", null, entry.edition),
      el("td", null, new Date(entry.uploadedAt).toISOString().replace("T", " ").slice(0, 16)),
      el("td", null, entry.privacy),
      linkCell,
    );
    tbody.append(row);
  });
  document.getElementById("uploadSection").hidden = false;
}

async function init() {
  try {
    const [channel, log] = await Promise.all([
      fetchJson("content/channel.json"),
      fetchJson("content/agent-log.json"),
    ]);
    renderHealth(channel);
    renderEdition(channel);
    renderLog(log);
    markStages(log);
    await renderUploads();
  } catch (_error) {
    document.getElementById("healthCards").replaceChildren(
      el(
        "p",
        "channel-empty",
        "Daten nicht erreichbar – Seite über einen Webserver öffnen.",
      ),
    );
  }
}

init();
