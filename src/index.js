export default {
  async fetch(request) {
    return new Response("<h1>Hello World!</h1>", {
      headers: { "Content-Type": "text/html" },
    });
  },
};
