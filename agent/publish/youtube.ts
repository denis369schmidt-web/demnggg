/**
 * YouTube-API-Anbindung: tauscht das dauerhafte Refresh-Token gegen ein
 * Access-Token und lädt das Video per Resumable Upload hoch.
 */

import type { VideoMetadata } from "./metadata.ts";

export interface YoutubeCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Entfernt typische Copy-Paste-Reste: Whitespace, Zeilenumbrüche, Anführungszeichen. */
function cleanSecret(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^["']+|["']+$/g, "").trim();
  return cleaned || undefined;
}

/**
 * Erkennt Konfigurations-/Auth-Fehler, bei denen ein Retry sinnlos ist und
 * der Workflow den Channel trotzdem committen soll (Soft-Skip).
 */
export function isRecoverableAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "deleted_client",
    "invalid_client",
    "unauthorized_client",
    "invalid_grant",
    "oauth-refresh fehlgeschlagen",
  ].some((needle) => lower.includes(needle));
}

/** Menschlicher Hinweis zu gängigen OAuth-Fehlercodes. */
export function oauthErrorHint(detail: string): string {
  if (detail.includes("deleted_client")) {
    return "\nHinweis: Der OAuth-Client wurde in der Google Cloud Console " +
      "gelöscht. Neuen Desktop-Client anlegen, `deno task setup:youtube` " +
      "ausführen und die drei GitHub-Secrets aktualisieren.";
  }
  if (detail.includes("invalid_client")) {
    return "\nHinweis: YOUTUBE_CLIENT_ID/-SECRET prüfen – die ID muss auf " +
      "'.apps.googleusercontent.com' enden, das Secret beginnt mit 'GOCSPX-'.";
  }
  if (detail.includes("invalid_grant")) {
    return "\nHinweis: Das Refresh-Token ist ungültig oder widerrufen – " +
      "`deno task setup:youtube` erneut ausführen und das Secret aktualisieren.";
  }
  return "";
}

export function credentialsFromEnv(): YoutubeCredentials | undefined {
  const clientId = cleanSecret(Deno.env.get("YOUTUBE_CLIENT_ID"));
  const clientSecret = cleanSecret(Deno.env.get("YOUTUBE_CLIENT_SECRET"));
  const refreshToken = cleanSecret(Deno.env.get("YOUTUBE_REFRESH_TOKEN"));

  if (!clientId || !clientSecret || !refreshToken) {
    return undefined;
  }

  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    console.warn(
      "Hinweis: YOUTUBE_CLIENT_ID endet nicht auf '.apps.googleusercontent.com' – " +
        "vermutlich wurde ein falscher oder unvollständiger Wert hinterlegt.",
    );
  }

  return { clientId, clientSecret, refreshToken };
}

export async function refreshAccessToken(
  credentials: YoutubeCredentials,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OAuth-Refresh fehlgeschlagen (HTTP ${response.status}): ${detail}${
        oauthErrorHint(detail)
      }`,
    );
  }

  const payload = await response.json() as { access_token: string };
  return payload.access_token;
}

export async function uploadVideo(
  accessToken: string,
  videoPath: string,
  metadata: VideoMetadata,
): Promise<{ videoId: string; url: string }> {
  const body = JSON.stringify({
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
      defaultLanguage: "de",
    },
    status: {
      privacyStatus: metadata.privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  });

  const video = await Deno.readFile(videoPath);

  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(video.byteLength),
        "X-Upload-Content-Type": "video/mp4",
      },
      body,
    },
  );

  if (!start.ok) {
    throw new Error(
      `Upload-Session fehlgeschlagen (HTTP ${start.status}): ${await start
        .text()}`,
    );
  }
  await start.body?.cancel();

  const uploadUrl = start.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Upload-Session ohne Location-Header beantwortet.");
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(video.byteLength),
    },
    body: video,
  });

  if (!upload.ok) {
    throw new Error(
      `Video-Upload fehlgeschlagen (HTTP ${upload.status}): ${await upload
        .text()}`,
    );
  }

  const payload = await upload.json() as { id: string };
  return {
    videoId: payload.id,
    url: `https://www.youtube.com/watch?v=${payload.id}`,
  };
}
