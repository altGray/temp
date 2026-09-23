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

      const putUrl = `${B2_ENDPOINT}/${B2_BUCKET}/${id}`;
      const putRes = await client.fetch(putUrl, {
        method: "PUT",
        body: fileBody,
      });

      if (!putRes.ok) {
        return new Response("Upload failed", { status: 500 });
      }

      return new Response(JSON.stringify({ id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
