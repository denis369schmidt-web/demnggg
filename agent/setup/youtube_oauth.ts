/**
 * Einmaliges YouTube-OAuth-Setup:
 *
 *   deno task setup:youtube
 *
 * Voraussetzung: In der Google Cloud Console ein Projekt mit aktivierter
 * "YouTube Data API v3" und einem OAuth-Client (Typ "Desktop-App").
 *
 * Zwei Modi:
 *  - Lokal (Browser auf demselben Rechner): automatischer Callback-Server.
 *  - Fern (z. B. Google Cloud Shell / SSH): manueller Modus – die
 *    Weiterleitungs-URL aus der Browser-Adressleiste wird eingefügt.
 */

const PORT = 8790;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function ask(question: string): string {
  const value = prompt(question)?.trim();
  if (!value) {
    console.error("Abgebrochen: Eingabe fehlt.");
    Deno.exit(1);
  }
  return value;
}

const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") ??
  ask("Client-ID (aus der Google Cloud Console):");
const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET") ??
  ask("Client-Secret:");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const sameMachine = (prompt(
  "Läuft dieses Skript auf demselben Rechner wie dein Browser? (J/n)",
) ?? "j").trim().toLowerCase() !== "n";

console.log("\n1) Öffne diese URL im Browser und melde dich mit dem");
console.log("   Google-Konto deines YouTube-Kanals an:\n");
console.log(`   ${authUrl.toString()}\n`);

let code: string;

if (sameMachine) {
  console.log(`2) Warte auf die Bestätigung … (Callback auf ${REDIRECT_URI})\n`);

  code = await new Promise<string>((resolve, reject) => {
    const controller = new AbortController();

    Deno.serve(
      { port: PORT, signal: controller.signal, onListen: () => {} },
      (request) => {
        const url = new URL(request.url);
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 });
        }

        const error = url.searchParams.get("error");
        const authCode = url.searchParams.get("code");

        queueMicrotask(() => {
          controller.abort();
          if (authCode) resolve(authCode);
          else reject(new Error(`Google meldet: ${error ?? "kein Code"}`));
        });

        return new Response(
          authCode
            ? "FlowForge: Autorisierung erfolgreich – dieses Fenster kann geschlossen werden."
            : `FlowForge: Autorisierung fehlgeschlagen (${error}).`,
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      },
    );
  });
} else {
  console.log("2) Nach dem Bestätigen leitet Google auf eine 127.0.0.1-Adresse");
  console.log("   weiter, die der Browser NICHT laden kann – das ist normal.");
  console.log("   Kopiere die komplette Adresse aus der Adressleiste des");
  console.log("   Browsers (beginnt mit http://127.0.0.1:8790/callback?...).\n");

  const pasted = ask("3) Füge die Weiterleitungs-URL (oder nur den Code) hier ein:");
  if (pasted.includes("code=")) {
    const parsed = new URL(pasted);
    const authCode = parsed.searchParams.get("code");
    if (!authCode) {
      console.error("Kein code-Parameter in der eingefügten URL gefunden.");
      Deno.exit(1);
    }
    code = authCode;
  } else {
    code = pasted;
  }
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  }),
});

if (!tokenResponse.ok) {
  console.error(
    `Token-Tausch fehlgeschlagen (HTTP ${tokenResponse.status}): ${await tokenResponse
      .text()}`,
  );
  Deno.exit(1);
}

const tokens = await tokenResponse.json() as { refresh_token?: string };
if (!tokens.refresh_token) {
  console.error(
    "Kein Refresh-Token erhalten. In der Google-Kontoverwaltung den Zugriff " +
      "der App entfernen und das Setup erneut ausführen (prompt=consent).",
  );
  Deno.exit(1);
}

console.log("\nFertig! Diese drei Werte als GitHub-Actions-Secrets anlegen");
console.log("(Repo → Settings → Secrets and variables → Actions):\n");
console.log(`  YOUTUBE_CLIENT_ID      = ${clientId}`);
console.log(`  YOUTUBE_CLIENT_SECRET  = ${clientSecret}`);
console.log(`  YOUTUBE_REFRESH_TOKEN  = ${tokens.refresh_token}`);
console.log(
  "\nOptional: YOUTUBE_PRIVACY = public | unlisted | private (Standard: public)",
);
