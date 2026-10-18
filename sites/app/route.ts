import game from "../public/index.html?raw";
export function GET() { return new Response(game, {headers:{"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-cache"}}); }
