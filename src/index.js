import { AwsClient } from "aws4fetch";

const B2_ENDPOINT = "https://s3.eu-central-003.backblazeb2.com";
const B2_BUCKET = "temp-media";

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
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

      const id = randomId();
      const fileBody = await request.arrayBuffer();
      const contentType =
        request.headers.get("Content-Type") || "application/octet-stream";

      const putUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${id}`;
      const putRes = await client.fetch(putUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
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

    if (url.pathname.startsWith("/view/") && request.method === "GET") {
      const id = url.pathname.replace("/view/", "");

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

      const deleteUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${id}`;
      await client.fetch(deleteUrl, { method: "DELETE" });

      return new Response(fileData, {
        headers: { "Content-Type": contentType },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
