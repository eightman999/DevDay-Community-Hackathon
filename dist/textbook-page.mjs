// This independent textbook uses the same evidence rules and CSV as the game.
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const status = document.getElementById('dataStatus');
try {
  const [{THREATS, TRANSFER_LIMITS, ROLE_OPERATIONS, REVIEW_SECONDS, inspectionChecks, inspectionVerdict, inspectionIncident}, {TYPES}, {seedReplicator, highLifeStep}] = await Promise.all([
    import('./threats.mjs'), import('./catalog.mjs'), import('./automata.mjs')
  ]);
  const impactLabels = {availability:'閲覧不能（可用性）', confidentiality:'漏えい（機密性）', integrity:'改変（完全性）'};
  const pattern = THREATS[0];
  const normal = {patternId:pattern.id,a:pattern.safeA,b:pattern.safeB,actor:'JOB-11',credentialSubject:'JOB-11',role:'診療担当',operation:'参照',classification:'診療情報',destination:'院内',anonymized:false,approval:false,expandedMB:TRANSFER_LIMITS[pattern.route]};
  const checks = inspectionChecks(normal);
  document.querySelectorAll('[data-review-seconds]').forEach(node => { node.textContent = REVIEW_SECONDS; });
  document.getElementById('reviewRules').innerHTML = checks.map((check,index) => `<article><span class="tag">CHECK ${String(index+1).padStart(2,'0')}</span><h3>${escapeHtml(check.label)}</h3><p>${escapeHtml(check.rule)}</p>${index<2?'<p>技術条件は通信に付いた検査プロファイルで変わります。下の11種類の一覧と照合してください。</p>':''}</article>`).join('');
  document.getElementById('roleRules').innerHTML = Object.entries(ROLE_OPERATIONS).map(([role,operations]) => `<p><strong>${escapeHtml(role)}</strong>：${operations.map(escapeHtml).join('・')}</p>`).join('');
  document.getElementById('capacityRules').innerHTML = Object.entries(TRANSFER_LIMITS).map(([route,limit]) => `<p><strong>${escapeHtml(TYPES[route].name)}</strong>：${limit} MB以下</p>`).join('');

  const variants = [{a:pattern.attackA},{b:pattern.attackB},{credentialSubject:'JOB-99'},{role:'閲覧担当',operation:'更新'},{classification:'院内情報',destination:'外部'},{expandedMB:TRANSFER_LIMITS[pattern.route]+1}];
  document.getElementById('exampleCards').innerHTML = variants.map((change,index) => {
    const bad = {...normal,...change};
    const failed = inspectionChecks(bad).find(check => !check.passed);
    const incident = inspectionIncident(bad);
    return `<article class="example-card"><h3>${index+1}. ${escapeHtml(checks[index].label)}</h3><div class="example-pair"><div><h4>${inspectionVerdict(normal)?'通過':'遮断'}できる例</h4><p>${escapeHtml(checks[index].value)}</p><small>他の5項目も規則を満たしています。</small></div><div><h4>${inspectionVerdict(bad)?'通過':'遮断'}する例</h4><p>${escapeHtml(failed.value)}</p><small>適用規則：${escapeHtml(failed.rule)}</small><small>違反：${escapeHtml(incident.name)} / 主な模擬被害：${escapeHtml(impactLabels[incident.impactKind])}</small></div></div></article>`;
  }).join('');
  const conditional = {...normal,classification:'診療情報',destination:'契約先',anonymized:true,approval:true};
  const publicTransfer = {...normal,classification:'公開資料',destination:'外部'};
  const handlingCard = document.createElement('article');
  handlingCard.className = 'example-card';
  handlingCard.innerHTML = `<h3>条件を満たす外部への転送</h3><p>「外部」「契約先」という単語だけで遮断しません。情報区分・宛先・匿名化・承認の関係を確認します。</p><div class="example-pair"><div><h4>${inspectionVerdict(publicTransfer)?'通過':'遮断'}：公開資料 → 外部</h4><p>${escapeHtml(inspectionChecks(publicTransfer)[4].value)}</p></div><div class="valid-example"><h4>${inspectionVerdict(conditional)?'通過':'遮断'}：診療情報 → 契約先</h4><p>${escapeHtml(inspectionChecks(conditional)[4].value)}</p><small>匿名化と連携承認の両方が必要です。他の5項目も満たします。</small></div></div>`;
  document.getElementById('exampleCards').append(handlingCard);
  document.getElementById('threatCards').innerHTML = THREATS.map((threat,index) => `<article id="threat-${escapeHtml(threat.id)}"><span class="tag">${String(index+1).padStart(2,'0')} / ${escapeHtml(TYPES[threat.route].name)}</span><h3>${escapeHtml(threat.name)}</h3><p>${escapeHtml(threat.weakness)}</p><dl><dt>${escapeHtml(threat.fieldA)}</dt><dd><span class="safe">正常：${escapeHtml(threat.safeA)}</span><br><span class="unsafe">不正：${escapeHtml(threat.attackA)}</span></dd><dt>${escapeHtml(threat.fieldB)}</dt><dd><span class="safe">正常：${escapeHtml(threat.safeB)}</span><br><span class="unsafe">不正：${escapeHtml(threat.attackB)}</span></dd><dt>対策</dt><dd>${escapeHtml(threat.patch)}</dd><dt>主な模擬被害</dt><dd>${escapeHtml(impactLabels[threat.impactKind])}。${escapeHtml(threat.impact)}</dd></dl><a class="source-link" href="${escapeHtml(threat.source)}" target="_blank" rel="noopener">元資料を読む ↗</a></article>`).join('');

  const width = 80, height = 80;
  let cells = seedReplicator(width,height,38,38);
  for(let generation=0;generation<=36;generation++) {
    if([0,12,36].includes(generation)) {
      const figure=document.createElement('figure');
      const canvas=document.createElement('canvas');
      canvas.width=width*4; canvas.height=height*4;
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label',`${generation}世代後のHighLife。核${generation===0?1:generation===12?2:4}個`);
      const context=canvas.getContext('2d');
      if(context) {context.fillStyle='#0a171c';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#ef9c91';for(const cell of cells)context.fillRect(cell%width*4,Math.floor(cell/width)*4,4,4);}
      const caption=document.createElement('figcaption');
      caption.textContent=`${generation}世代 / ${cells.size}セル`;
      figure.append(canvas,caption);document.getElementById('lifeSnapshots').append(figure);
    }
    cells=highLifeStep(cells,width,height);
  }
  status.textContent=`共有データから6項目・${THREATS.length}種類の技術所見を表示しています。`;
} catch(error) {
  status.textContent='審査データを読み込めませんでした。通信状態を確認して再読み込みしてください。操作・被害・参考資料の本文は引き続き読めます。';
  status.setAttribute('role','alert');
  console.error('Textbook data loading failed:',error);
}
