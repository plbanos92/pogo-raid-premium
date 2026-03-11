export async function onRequest(context) {
  // Example Pages Function — respond with JSON
  return new Response(JSON.stringify({ message: 'Hello from Pages Function' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
