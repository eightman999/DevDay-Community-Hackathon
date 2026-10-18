"""Read-only structural, media, link and publication-hygiene checks for this reference subset.

Requires Python 3, Pillow and existing ffmpeg/ffprobe executables. It does not listen
to audio, install software, regenerate assets or benchmark a game engine.
"""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import array, ast, csv, hashlib, json, math, re, shutil, struct, subprocess, sys, wave
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent

def relative(path): return path.relative_to(ROOT).as_posix()

def glb_check(path):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    chunks=[];pos=12
    while pos<len(data):
        count,kind=struct.unpack_from('<II',data,pos);pos+=8
        assert count%4==0 and pos+count<=len(data)
        chunks.append((kind,data[pos:pos+count]));pos+=count
    assert pos==len(data) and chunks[0][0]==0x4E4F534A
    gltf=json.loads(chunks[0][1]);binary=next(v for k,v in chunks if k==0x004E4942)
    assert gltf['asset']['version']=='2.0' and len(gltf['buffers'])==1
    assert 'uri' not in gltf['buffers'][0]
    assert gltf['buffers'][0]['byteLength']<=len(binary)
    assert not any(gltf.get(k) for k in ['images','textures','animations','skins'])
    assert not gltf.get('extensionsRequired'), 'Unexpected external decoder dependency'
    for view in gltf.get('bufferViews',[]):
        assert view.get('buffer',0)==0
        assert 0<=view.get('byteOffset',0)<=len(binary)
        assert view.get('byteOffset',0)+view['byteLength']<=gltf['buffers'][0]['byteLength']
    components={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
    def values(n):
        acc=gltf['accessors'][n];assert not acc.get('sparse')
        view=gltf['bufferViews'][acc['bufferView']]
        typ,size=components[acc['componentType']];width=widths[acc['type']]
        stride=view.get('byteStride',size*width);start=view.get('byteOffset',0)+acc.get('byteOffset',0)
        assert stride>=size*width and acc['count']>0
        assert acc.get('byteOffset',0)+(acc['count']-1)*stride+size*width<=view['byteLength']
        return [struct.unpack_from('<'+typ*width,binary,start+i*stride) for i in range(acc['count'])]
    cache={}
    for n in range(len(gltf['accessors'])):
        cache[n]=values(n)
        assert all(math.isfinite(x) for row in cache[n] for x in row)
    triangles=0
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4)==4
            vertices=cache[primitive['attributes']['POSITION']]
            assert vertices and all(len(v)==3 for v in vertices)
            if 'indices' in primitive:
                idx=cache[primitive['indices']];assert len(idx)%3==0
                assert all(0<=v[0]<len(vertices) for v in idx);triangles+=len(idx)//3
            else: assert len(vertices)%3==0;triangles+=len(vertices)//3
            assert 0<=primitive.get('material',0)<len(gltf['materials'])
    return dict(file=relative(path),bytes=len(data),triangles=triangles,mesh_nodes=sum('mesh' in n for n in gltf['nodes']),materials=len(gltf['materials']),external_resources=0)

def run():
    assert shutil.which('ffmpeg') and shutil.which('ffprobe')
    files=sorted(p for p in ROOT.rglob('*') if p.is_file())
    images=[];audio=[];links=0;py=0
    private_text=[rb'(?i)[a-z]:[\\/]',rb'(?i)/(?:Users|home|mnt)/',rb'libfile_[A-Za-z0-9]+',rb'file_[0-9a-f]{24,}']
    credentials=[rb'gh[pousr]_[A-Za-z0-9]{20,}',rb'github_pat_[A-Za-z0-9_]+',rb'sk-proj-[A-Za-z0-9_-]+',rb'AKIA[0-9A-Z]{16}',rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----']
    for path in files:
        if path==Path(__file__).resolve(): continue # Patterns above are definitions, not leaked data.
        raw=path.read_bytes()
        text=raw if path.suffix in ['.md','.py','.json','.csv','.txt'] or path.name=='.gitattributes' else b''
        if path.suffix=='.glb':text=raw[20:20+struct.unpack_from('<I',raw,12)[0]]
        # PCM/mesh bytes can randomly spell short path fragments. Inspect actual
        # text/metadata for paths, and scan every bundled byte for long key signatures.
        for pattern in private_text: assert not re.search(pattern,text),(relative(path),'private text pattern')
        for pattern in credentials: assert not re.search(pattern,raw),(relative(path),'credential pattern')
        assert not any(part.startswith('.') for part in path.relative_to(ROOT).parts if part!='.gitattributes')
        assert path.suffix.lower() not in ['.zip','.log','.blend','.pyc','.jpg','.jpeg']
        if path.suffix=='.py':ast.parse(raw.decode('utf-8'));py+=1
        if path.suffix in ['.png','.webp']:
            with Image.open(path) as im:
                im.verify()
            with Image.open(path) as im:
                im.load();assert not im.getexif() and not im.info.get('exif')
                for pattern in private_text:assert not re.search(pattern,json.dumps(im.info,default=str).encode())
                assert not any(k in im.info for k in ['comment','Description','Software','Author','XML:com.adobe.xmp'])
                images.append(dict(file=relative(path),size=list(im.size)))
        if path.suffix=='.md':
            content=raw.decode('utf-8')
            for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',content):
                target=target.strip('<>').split('#')[0]
                if not target or urlsplit(target).scheme:continue
                resolved=(path.parent/unquote(target)).resolve()
                assert resolved.is_relative_to(ROOT) and resolved.is_file(),(relative(path),target)
                links+=1
        if path.suffix in ['.m4a','.wav']:
            proc=subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)],capture_output=True,check=True)
            info=json.loads(proc.stdout);stream=info['streams'][0]
            assert len(info['streams'])==1 and stream['codec_type']=='audio'
            assert int(stream['sample_rate'])==48000 and stream['channels']==1
            subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'],capture_output=True,check=True)
            tags={**info.get('format',{}).get('tags',{}),**stream.get('tags',{})}
            for pattern in private_text:assert not re.search(pattern,json.dumps(tags).encode())
            assert set(k.lower() for k in tags)<=set(['major_brand','minor_version','compatible_brands','encoder','language','handler_name','vendor_id'])
            row=dict(file=relative(path),codec=stream['codec_name'],duration_seconds=float(info['format']['duration']),decode_pass=True)
            if path.suffix=='.wav':
                with wave.open(str(path),'rb') as w:
                    assert w.getsampwidth()==2 and w.getframerate()==48000 and w.getnchannels()==1
                    row['samples']=w.getnframes();pcm=array.array('h',w.readframes(w.getnframes()))
                    if sys.byteorder!='little':pcm.byteswap()
                    assert max(abs(v) for v in pcm)<32767;row['peak_pcm']=max(abs(v) for v in pcm)
            audio.append(row)
    for folder in ['pocket-directory-96','byte-bounce-128']:
        d=ROOT/'audio'/folder;m=json.loads((d/'metadata.json').read_text(encoding='utf-8'))
        wav=[r for r in audio if r['file'].startswith('audio/'+folder+'/') and 'samples' in r]
        assert len(wav)==3 and all(r['samples']==m['samples_per_file'] for r in wav)
        assert m['loop_start_sample']==0 and m['loop_end_sample_exclusive']==m['samples_per_file']
        beats=list(csv.DictReader((d/'beat_grid.csv').open(encoding='utf-8')))
        assert len(beats)==m['beats']
        for n,beat in enumerate(beats):
            assert int(beat['absolute_beat_0based'])==n
            assert int(beat['sample_48k'])==n*m['samples_per_beat']
            assert float(beat['time_seconds'])==n*60/m['bpm']
        previews=[r for r in audio if r['file'].startswith('audio/'+folder+'/') and r['file'].endswith('.m4a')]
        assert len(previews)==3 and all(abs(r['duration_seconds']-m['duration_seconds'])<.025 for r in previews)
        for f in m['stem_files']+m['audition_files']:assert (d/f).is_file()
    d=ROOT/'audio/byte-bounce-alarm-run-128';m=json.loads((d/'metadata.json').read_text(encoding='utf-8'))
    for asset in list(m['assets'].values())+[m['demo']]:
        row=next(r for r in audio if r['file']==relative(d/asset['file']))
        assert row['samples']==asset['samples']
        preview=next(r for r in audio if r['file']==relative(d/'compressed'/(Path(asset['file']).stem+'.m4a')))
        assert abs(preview['duration_seconds']-asset['duration_seconds'])<.025
    beats=list(csv.DictReader((d/'beat_grid.csv').open(encoding='utf-8')))
    assert len(beats)==65 and all(int(r['sample'])==n*22500 for n,r in enumerate(beats))
    assert [r['local_sample'] for r in m['countdown']]==[0,22500,45000,67500]
    assert m['deadline']['local_countdown_sample']==90000
    glbs=[glb_check(p) for p in files if p.suffix=='.glb'];assert len(glbs)==26
    catalog=json.loads((ROOT/'3d/catalog.json').read_text(encoding='utf-8'))
    for model in catalog:
        p=ROOT/'3d'/model['model'];assert hashlib.sha256(p.read_bytes()).hexdigest()==model['sha256']
        assert hashlib.sha256((ROOT/'3d'/model['preview']).read_bytes()).hexdigest()==model['preview_sha256']
        found=next(r for r in glbs if r['file']=='3d/'+model['model'])
        assert all(found[k]==model[k] for k in ['triangles','mesh_nodes','materials','bytes'])
    return dict(result='passed',audio=dict(m4a_files=sum(r['file'].endswith('.m4a') for r in audio),wav_files=sum(r['file'].endswith('.wav') for r in audio),decode_and_pcm_checks=audio,human_audition=False,real_phone_tested=False),models=glbs,images=images,relative_markdown_links=links,python_syntax_files=py,publication_hygiene='All bundled bytes scanned for common credential signatures; text files, GLB JSON, image metadata and audio tags inspected for local paths and private identifiers. This is a bounded automated check, not a proof that no secret can exist.',Unity_tested=False,fps_measured=False)

if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
