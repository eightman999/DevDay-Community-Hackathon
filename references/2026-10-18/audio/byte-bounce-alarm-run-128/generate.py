"""Original 128 BPM alarm / mimic countdown sequence. CPU + NumPy only.
Reuses this project's own Byte Bounce synth utilities, not third-party samples.
Run: python generate.py (FFmpeg, when already installed, makes AAC copies).
"""
from pathlib import Path
import argparse
import csv
import hashlib
import io
import json
import shutil
import subprocess
import wave
import numpy as np
from tools import byte_bounce_core as core

ROOT = Path(__file__).resolve().parent
SR, BPM, SPB = 48000, 128, 22500
BEAT = SPB / SR
SEED = 50812804
DEMO_BEATS = 64
DEMO_NAME = 'ByteBounce_AlarmRun_128_demo'
NAMES = dict(normal='ByteBounce_Normal_128_context_2bars', alarm='ByteBounce_Alarm_128_oneshot',
             countdown='ByteBounce_Countdown_128_4beats', tension='ByteBounce_Tension_128_loop_8bars',
             success='ByteBounce_Success_128_jingle')
LENGTHS = dict(normal=8, alarm=4, countdown=4, tension=32, success=8)
TIMELINE = [('normal',0,8),('alarm',8,12),('countdown',12,16),('tension',16,48),('success',48,56),('normal_return',56,64)]


def shaped(t, duration, attack, decay):
    return core.envelope(t,duration,attack,decay)


def synth(voice, midi, seconds, velocity, rng):
    if voice not in ('warning','count','pressure','release'):
        return core.synth(voice,midi,seconds,velocity,SR,rng)
    t=np.arange(round(seconds*SR),dtype=np.float64)/SR
    p=2*np.pi*core.frequency(midi)*t
    if voice=='warning':
        # Original irregular clustered cue; no emergency-alert tune or siren sweep.
        y=np.sin(p+.20*np.sin(1.73*p)*np.exp(-t*8))+.14*np.sin(2*p)
        y*=.82+.18*np.cos(2*np.pi*13*t)
        y*=shaped(t,seconds,.008,.20)
    elif voice=='count':
        y=np.sin(p)+.13*np.sin(2*p)*np.exp(-t*18)
        y*=shaped(t,seconds,.005,.065)
    elif voice=='pressure':
        y=np.sin(p)+.38*np.sin(2*p)+.10*np.sin(3*p)
        y*=shaped(t,seconds,.008,.105)
    else:
        y=np.sin(p+.10*np.sin(2*p)*np.exp(-t*3))+.08*np.sin(2*p)
        y*=shaped(t,seconds,.012,.34)
    return (y*velocity).astype(np.float32)


def compose():
    score=[]
    def note(asset,beat,voice,midi,dur,vel):
        score.append(dict(asset=asset,beat=beat,sample=round(beat*SPB),voice=voice,
                          midi=midi,duration_seconds=dur,velocity=vel))
    # Preserve Byte Bounce's first D-major call and four-to-the-floor groove.
    for e in core.compose():
        if e['stem']==0 and e['beat']<8:
            note('normal',e['beat'],e['voice'],e['midi'],e['duration_seconds'],e['velocity'])
    # Three off-grid-for-a-beat clustered gestures plus low attention knocks.
    for beat,notes,dur in [(0,[(62,.108),(63,.052),(69,.036)],.42),
                           (.625,[(61,.088),(67,.040)],.29),
                           (1.625,[(64,.085),(65,.045),(70,.030)],.38),
                           (2.875,[(62,.084),(63,.035)],.30)]:
        for pitch,vel in notes:
            note('alarm',beat,'warning',pitch,dur,vel)
    for beat in [0,1.5,2.75]:
        note('alarm',beat,'pressure',50,.25,.10)
    # Four main countdown ticks: 4,3,2,1. Extra subdivisions near the deadline.
    for i,pitch in enumerate([62,63,64,65]):
        note('countdown',i,'count',pitch,.20-i*.025,.16)
        note('countdown',i,'pressure',50,.20,.10)
    for beat in [2.5,3.5,3.75]:
        note('countdown',beat,'count',66 if beat<3.75 else 67,.095,.075)
    harmony=[
        (50,[62,63,65,69,76]), (50,[62,65,69,73,76]),
        (46,[58,62,65,69,76]), (45,[57,61,64,67,70]),
        (50,[62,63,65,69,76]), (51,[63,67,70,74,76]),
        (43,[55,58,62,64,69]), (45,[57,62,64,67,70]),
    ]
    indices=[0,1,2,1,3,2,1,2,0,1,3,2,1,2,4,1]
    for bar,(root,chord) in enumerate(harmony):
        b=bar*4
        for beat in range(4):
            note('tension',b+beat,'kick',0,.17,.14 if beat%2==0 else .12)
        # Alternating sixteenths and low pulses create pressure without a level lift.
        for off,interval,vel in [(0,0,.16),(.5,0,.10),(.875,1,.065),(1.5,7,.095),
                                 (2,0,.15),(2.5,0,.095),(2.875,1,.060),(3.5,7,.10)]:
            note('tension',b+off,'pressure',root+interval,.22 if off in (0,2) else .15,vel)
        for step,idx in enumerate(indices):
            if bar%2 and step in (6,14):
                continue
            note('tension',b+step*.25,'arp',chord[idx],.105,.052 if step%4==0 else .038)
        for off in [.5,1.5,2.5,3.5]:
            for pitch in chord[:3]:
                note('tension',b+off,'stab',pitch,.13,.025)
            note('tension',b+off,'click',0,.04,.075)
        for off in [1,3]:
            note('tension',b+off,'tap',0,.10,.075)
            note('tension',b+off+.025,'clap',0,.09,.04)
        for off in [.25,.75,1.25,1.75,2.25,2.75,3.25,3.75]:
            note('tension',b+off,'click',0,.035,.038)
        if bar in (3,7):
            for off in [3.25,3.5,3.75]:
                note('tension',b+off,'count',61 if bar==3 else 63,.11,.052)
    # Bright major release, followed by an open tail instead of more alarm ticks.
    for off,pitch,vel in [(0,69,.12),(.25,73,.095),(.75,74,.13),(1.5,78,.10),
                           (2,76,.085),(2.75,74,.13)]:
        note('success',off,'release',pitch,.65 if off<2.75 else 1.25,vel)
    for pitch in [50,62,66,69,73,76]:
        note('success',0,'pad',pitch,3.65,.020 if pitch!=50 else .035)
    note('success',0,'pressure',50,.36,.11)
    return score


def add(track,audio,start,circular=False):
    if circular:
        core.add_circular(track,audio,start)
    elif start<len(track):
        end=min(len(track),start+len(audio))
        track[max(0,start):end]+=audio[max(0,-start):max(0,-start)+end-max(0,start)]


def render(score):
    tracks={key:np.zeros(beats*SPB,dtype=np.float32) for key,beats in LENGTHS.items()}
    rng=np.random.default_rng(SEED)
    for e in score:
        x=synth(e['voice'],e['midi'],e['duration_seconds'],e['velocity'],rng)
        key=e['asset']; pos=e['sample']; circular=key in ('normal','tension')
        add(tracks[key],x,pos,circular)
        if e['voice'] in ('toy','release'):
            for delay,gain in [(.75,.10),(1.5,.035)]:
                add(tracks[key],x*gain,pos+round(delay*SPB),circular)
    # Match long-term RMS slightly below the normal groove, before common mastering.
    normal_rms=float(np.sqrt(np.mean(tracks['normal']**2)))
    tension_rms=float(np.sqrt(np.mean(tracks['tension']**2)))
    tension_match=.95*normal_rms/tension_rms
    tracks['tension']*=tension_match
    return tracks,tension_match


def fade_edges(x,fade_in=0,fade_out=0):
    y=x.copy()
    if fade_in:
        n=round(fade_in*SR); y[:n]*=np.sin(np.linspace(0,np.pi/2,n))**2
    if fade_out:
        n=round(fade_out*SR); y[-n:]*=np.cos(np.linspace(0,np.pi/2,n))**2
    return y


def demo_mix(tracks):
    demo=np.zeros(DEMO_BEATS*SPB,dtype=np.float32)
    bed=np.tile(tracks['normal'],2)
    # Duck background only, leaving space for the cue and count, with smooth edges.
    g=np.ones(len(bed),dtype=np.float32)
    ramp=round(.20*SPB); start=8*SPB
    g[start:start+ramp]=np.linspace(1,.55,ramp);g[start+ramp:]=.55
    bed*=g;bed=fade_edges(bed,.025,.08)
    add(demo,bed,0)
    add(demo,tracks['alarm'],8*SPB)
    add(demo,tracks['countdown'],12*SPB)
    loop=tracks['tension']
    # On success, let a quarter-beat of the circular continuation fade out.
    release=round(.25*SPB)
    running=np.r_[loop,loop[:release]]
    running=fade_edges(running,.035,release/SR)
    add(demo,running,16*SPB)
    add(demo,tracks['success'],48*SPB)
    add(demo,fade_edges(tracks['normal'],.035,.25),56*SPB)
    return demo


def wav_bytes(x):
    out=io.BytesIO()
    with wave.open(out,'wb') as f:
        f.setparams((1,2,SR,len(x),'NONE','not compressed'))
        f.writeframes(np.rint(x*32767).astype('<i2').tobytes())
    return out.getvalue()


def make_metadata(score,master,tension_match):
    assets={}
    for key,beats in LENGTHS.items():
        loop=key in ('normal','tension')
        assets[key]=dict(file='audio/'+NAMES[key]+'.wav',beats=beats,bars=beats/4,
                         samples=beats*SPB,duration_seconds=beats*BEAT,one_shot=not loop,
                         loop_start_sample=0 if loop else None,loop_end_sample_exclusive=beats*SPB if loop else None,
                         loop_start_seconds=0 if loop else None,loop_end_seconds_exclusive=beats*BEAT if loop else None,
                         local_downbeat_sample=0,recommended_gain=1)
    return dict(title='Byte Bounce: Alarm Run / 擬態デッドライン',version='1.0',bpm=BPM,meter='4/4',
                sample_rate_hz=SR,pcm_bits=16,channels=1,samples_per_beat=SPB,samples_per_bar=SPB*4,
                master_gain=master,tension_rms_match_gain=tension_match,
                assets=assets,demo=dict(file='mixes/'+DEMO_NAME+'.wav',beats=64,bars=16,samples=64*SPB,
                                       duration_seconds=64*BEAT,loop=False),
                demo_timeline=[dict(section=key,start_beat=start,end_beat_exclusive=end,start_sample=start*SPB,
                                    end_sample_exclusive=end*SPB,start_seconds=start*BEAT,end_seconds_exclusive=end*BEAT)
                               for key,start,end in TIMELINE],
                countdown=[dict(count_remaining=4-i,local_beat=i,local_sample=i*SPB,demo_beat=12+i,
                                demo_sample=(12+i)*SPB) for i in range(4)],
                deadline=dict(local_countdown_beat=4,local_countdown_sample=4*SPB,demo_beat=16,demo_sample=16*SPB),
                integration=dict(clock='Schedule from one audio clock; beat n starts at origin+n*60/128.',
                                 normal='The normal context is a 2-bar D-major reference using our own Byte Bounce score.',
                                 alarm='One-shot, 4 beats; the background is ducked smoothly to 0.55 in this demo.',
                                 countdown='One-shot of 4 beats. Main ticks at beats 0,1,2,3 represent 4,3,2,1; deadline at 4.',
                                 tension='Complete 8-bar music loop; replace the normal BGM rather than summing two full mixes.',
                                 success='One-shot, 8 beats; fade tension over 0.25 beat (0.1171875 s), then return to normal.',
                                 phase='All assets start on their own beat 0. Trigger on a scheduled beat; reset tension to its bar 1.',
                                 compression='AAC is for audition; use PCM WAV for sample-accurate loops and cues.'),
                provenance='Original code-synthesized game cue. Reuses our own Byte Bounce utilities and normal motif; newly written warning, countdown, D-minor tension and D-major success. No third-party samples, songs, speech or emergency alert recording/melody used. Legal clearance is not guaranteed.',
                subdivision_rounding='Nearest PCM sample, at most 0.5 sample; all main beat and state-start samples are exact.',
                event_count=len(score),human_audition=False,real_smartphone_test=False)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--no-compressed',action='store_true');args=parser.parse_args()
    for folder in ['audio','mixes','compressed']:(ROOT/folder).mkdir(exist_ok=True)
    score=compose();tracks,tension_match=render(score);demo=demo_mix(tracks)
    peak=max(float(np.max(np.abs(x))) for x in [*tracks.values(),demo])
    master=.63/peak
    tracks={key:x*master for key,x in tracks.items()};demo*=master
    for key,x in tracks.items():(ROOT/'audio'/(NAMES[key]+'.wav')).write_bytes(wav_bytes(x))
    (ROOT/'mixes'/(DEMO_NAME+'.wav')).write_bytes(wav_bytes(demo))
    (ROOT/'score.json').write_text(json.dumps(score,separators=(',',':')),encoding='utf-8')
    (ROOT/'metadata.json').write_text(json.dumps(make_metadata(score,master,tension_match),indent=2,ensure_ascii=False),encoding='utf-8')
    with (ROOT/'beat_grid.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(['beat_0based','bar_1based','beat_in_bar_1based','seconds','sample','section'])
        for beat in range(DEMO_BEATS+1):
            section=next((key for key,start,end in TIMELINE if start<=beat<end),'end')
            writer.writerow([beat,beat//4+1,beat%4+1,beat*BEAT,beat*SPB,section])
    if shutil.which('ffmpeg') and not args.no_compressed:
        for path in [ROOT/'mixes'/(DEMO_NAME+'.wav')]+[ROOT/'audio'/(NAMES[k]+'.wav') for k in NAMES]:
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-threads','1','-i',str(path),
                            '-c:a','aac','-b:a','96k','-movflags','+faststart',str(ROOT/'compressed'/(path.stem+'.m4a'))],check=True)
    print(json.dumps(dict(events=len(score),demo_seconds=DEMO_BEATS*BEAT,master_gain=master,
                          tension_rms_match_gain=tension_match,assets={k:len(x) for k,x in tracks.items()},
                          demo_peak=float(np.max(np.abs(demo)))),indent=2))


if __name__=='__main__':
    main()
