/** Simple same-origin server for local hackathon prototyping; not production hardened. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {offlineClassify,decisionRequest,interpretDecision} from './decision.mjs';

const directory=join(dirname(fileURLToPath(import.meta.url)),'public');
const PORT=Number(process.env.PORT||4173);
const HOST=process.env.HOST||'127.0.0.1';
const live=process.env.ENABLE_DECISIONS_API==='1' && Boolean(process.env.OPENAI_API_KEY);
const staticFiles=new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/styles.css', ['styles.css','text/css; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']]
]);
const ratelimits=new Map();
function send(res,status,json){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(json));
}
async function readJSON(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('json required');
  let text='';
  for await (const part of req){
    text+=part.toString('utf8');
    if(Buffer.byteLength(text,'utf8')>2400)throw Error('body too large');
  }
  return JSON.parse(text);
}
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if(req.method==='GET'&&pathname==='/api/status')return send(res,200,{mode:live?'live':'offline',model:live?'gpt-6-luna':null});
  if(req.method==='POST'&&pathname==='/api/evaluate'){
    const ip=req.socket.remoteAddress||'local';
    const now=Date.now();const dates=(ratelimits.get(ip)||[]).filter(t=>t>now-60000);
    if(dates.length>=20)return send(res,429,{error:'rate_limit'});
    dates.push(now);ratelimits.set(ip,dates);
    try{
      const payload=await readJSON(req);
      const stage=payload?.stage, text=payload?.text;
      if(!Number.isInteger(stage)||stage<0||stage>2||typeof text!=='string'||text.trim().length<7||text.length>300)return send(res,400,{error:'invalid_input'});
      if(!live)return send(res,200,offlineClassify(text));
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch('https://api.openai.com/v1/decisions',{
          method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
          body:JSON.stringify(decisionRequest(text,stage)),signal:controller.signal
        });
        if(!response.ok){
          // Avoid forwarding provider error contents or secrets to public callers.
          return send(res,502,{error:'decisions_unavailable'});
        }
        return send(res,200,interpretDecision(await response.json()));
      }finally{clearTimeout(timeout);}
    }catch(err){
      return send(res,400,{error:err instanceof SyntaxError?'invalid_json':'request_failed'});
    }
  }
  if(req.method==='GET'&&staticFiles.has(pathname)){
    const [file,type]=staticFiles.get(pathname);
    try{res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');res.end(await readFile(join(directory,file)));}
    catch(_){send(res,500,{error:'file_unavailable'});}
    return;
  }
  send(res,404,{error:'not_found'});
});
server.listen(PORT,HOST,()=>{
  console.log(`[ON CALL] http://${HOST}:${PORT} / mode=${live?'Decisions API':'OFFLINE DEMO'} / non-public prototype`);
});
