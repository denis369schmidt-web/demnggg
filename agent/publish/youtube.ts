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

export function credentialsFromEnv(): YoutubeCredentials | undefined {
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("YOUTUBE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    return undefined;
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
    throw new Error(
      `OAuth-Refresh fehlgeschlagen (HTTP ${response.status}): ${await response
        .text()}`,
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
