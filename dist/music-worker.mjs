import { renderMusic } from './music-renderer.mjs';
self.onmessage = async () => {
  try {
    const response = await fetch(new URL('./music/tactical-breach.txt',import.meta.url));
    if (!response.ok) throw new Error('楽譜を読み込めません');
    const result = await renderMusic(await response.text());
    self.postMessage(result,[result.left.buffer,result.right.buffer]);
  } catch (error) { self.postMessage({error:error.message}); }
};
