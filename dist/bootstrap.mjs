import {showIntro} from './intro.mjs';

showIntro();
try {
  await import('./app.mjs');
  document.querySelector('#startBtn').disabled = false;
} catch (error) {
  console.error('通信カタログの初期化に失敗', error);
  document.querySelector('#startBtn').disabled = true;
  document.querySelector('#eventLog').textContent = '通信定義を読み込めません。CSVの形式とファイルの配置を確認し、再読み込みしてください。';
  document.querySelector('#eventLog').classList.add('loaderror');
}
