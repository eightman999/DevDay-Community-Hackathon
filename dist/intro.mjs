// The introduction never starts the duty clock or blocks loading the game.
export function showIntro() {
  const dialog = document.querySelector('#intro');
  const video = document.querySelector('#introVideo');
  const sound = document.querySelector('#introSound');
  const status = document.querySelector('#introStatus');
  const skip = document.querySelector('#introSkip');
  if (!dialog || !video || !sound || !status || !skip) return;

  const finish = () => {
    video.pause();
    dialog.close();
    video.removeAttribute('src');
    video.load();
    document.querySelector('#startBtn')?.focus();
  };
  skip.addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  video.addEventListener('ended', finish, {once:true});
  video.addEventListener('error', () => {
    status.textContent = '動画を読み込めませんでした。スキップしてゲームへ進めます。';
    sound.disabled = true;
  }, {once:true});
  video.addEventListener('volumechange', () => {
    sound.textContent = video.muted ? '音声をオン' : '音声をオフ';
    sound.setAttribute('aria-pressed', String(!video.muted));
  });
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    void video.play().catch(() => {
      status.textContent = '動画の再生ボタンを押すか、スキップして進んでください。';
    });
  });
  dialog.showModal();
  // Muted autoplay works without a user gesture; audio is explicitly opt-in.
  video.muted = true;
  void video.play().catch(() => {
    if (dialog.open) status.textContent = '動画の再生ボタンを押すか、スキップして進んでください。';
  });
}
