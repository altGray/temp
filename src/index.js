import { AwsClient } from "aws4fetch";

const B2_ENDPOINT = "https://s3.eu-central-003.backblazeb2.com";
const B2_BUCKET = "temp-media";

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomId() {
  let id = "";
  for (let i = 0; i < 4; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/upload" && request.method === "POST") {
      console.log("B2_KEY_ID present:", !!env.B2_KEY_ID);
      console.log("B2_APPLICATION_KEY present:", !!env.B2_APPLICATION_KEY);

      const client = new AwsClient({
        accessKeyId: env.B2_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
      });

      const fileBody = await request.arrayBuffer();
      const contentType =
        request.headers.get("Content-Type") || "application/octet-stream";
      const iv = request.headers.get("X-Encryption-IV");

      if (!iv) {
        return new Response("Missing encryption IV", {
          status: 400,
        });
      }

      let id;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const candidateId = randomId();
        const checkUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${candidateId}`;
        const checkRes = await client.fetch(checkUrl, { method: "HEAD" });

        if (!checkRes.ok) {
          id = candidateId;
          break;
        }

        attempts++;
      }

      if (!id) {
        return new Response("Could not generate a unique ID, try again", {
          status: 500,
        });
      }

      const putUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${id}`;
      const putRes = await client.fetch(putUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "x-amz-meta-iv": iv,
        },
        body: fileBody,
      });

      if (!putRes.ok) {
        const errorText = await putRes.text();
        console.log("B2 PUT failed:", putRes.status, errorText);
        return new Response("Upload failed", { status: 500 });
      }

      return new Response(JSON.stringify({ id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname.startsWith("/v/") && request.method === "GET") {
      const id = url.pathname.replace("/v/", "");

      const client = new AwsClient({
        accessKeyId: env.B2_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
      });

      const getUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${id}`;
      const getRes = await client.fetch(getUrl, { method: "GET" });

      if (!getRes.ok) {
        return new Response("Media has expired or does not exist", {
          status: 410,
        });
      }

      const fileData = await getRes.arrayBuffer();
      const contentType =
        getRes.headers.get("Content-Type") || "application/octet-stream";
      const iv = getRes.headers.get("x-amz-meta-iv");

      if (!iv) {
        return new Response("Missing encryption IV", {
          status: 500,
        });
      }

      const accept = request.headers.get("Accept") || "";

      if (accept.includes("text/html")) {
        const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>temp</title>
  </head>
  <body>
    <script>
      async function deriveKeyFromChar(char) {
        const encoder = new TextEncoder();
        const hash = await crypto.subtle.digest(
          "SHA-256",
          encoder.encode(char),
        );
        return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
          "encrypt",
          "decrypt",
        ]);
      }

      function base64UrlToBuf(str) {
        const binary = atob(
          str.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (str.length % 4)) % 4),
        );
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }

      async function loadFile() {
        const keyChar = location.hash.substring(1);

        if (!keyChar) {
          document.body.textContent = "Invalid link.";
          return;
        }

        const res = await fetch(location.pathname);

        if (!res.ok) {
          document.body.textContent = "Media has expired or does not exist.";
          return;
        }

        const iv = base64UrlToBuf(res.headers.get("X-Encryption-IV"));
        const encrypted = await res.arrayBuffer();
        const key = await deriveKeyFromChar(keyChar);

        try {
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            encrypted,
          );

          const type =
            res.headers.get("X-Original-Content-Type") ||
            "application/octet-stream";

          const blob = new Blob([decrypted], { type });
          const url = URL.createObjectURL(blob);

          if (type.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = url;
            document.body.appendChild(img);
          } else if (type.startsWith("video/")) {
            const video = document.createElement("video");
            video.src = url;
            video.controls = true;
            document.body.appendChild(video);
          } else if (type.startsWith("audio/")) {
            const audio = document.createElement("audio");
            audio.src = url;
            audio.controls = true;
            document.body.appendChild(audio);
          } else {
            const link = document.createElement("a");
            link.href = url;
            link.download = "file";
            link.textContent = "Download file";
            document.body.appendChild(link);
          }
        } catch {
          document.body.textContent = "Invalid encryption key.";
        }
      }

      loadFile();
    </script>
  </body>
</html>`;

        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      await client.fetch(getUrl, { method: "DELETE" });

      return new Response(fileData, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Encryption-IV": iv,
          "X-Original-Content-Type": contentType,
          "Access-Control-Expose-Headers":
            "X-Encryption-IV, X-Original-Content-Type",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
