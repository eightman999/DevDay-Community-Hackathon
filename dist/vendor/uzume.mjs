/**
 * Uzume Language Compiler - JavaScript Edition
 * 楽譜をコードのように記述し、Web Audio APIで音声生成
 *
 * v0.5.1 - 実装修正:
 *   - P1-1: nプレフィックスなし音名記法 (C4-1 等) を受理
 *   - P1-1: CHORD_NAME/IDENTIFIER の衝突解消 (A始まり識別子等)
 *   - P1-2: pulse50 波形を追加
 *   - P2-3: DYNAMIC (^mf 等) を renderNote で音量に反映
 *   - P2-4: articulation (stc/leg/acc/ten) を renderNote で反映
 *   - P2-5: .arpeggio / .cre / .dec を renderSingleMeasure で反映
 *   - P3-6: tuplet 3 in 2 [...] 連符をパース&レンダリング
 *   - P3-7: set scale(major) + 1_4 記法をパース&レンダリング
 *   - P3-8: カスタムコード定義 Name = chord[...] をパース&レンダリング
 *   - P4-9: CHORD_DEFINITIONS に sus2/m7b5 タイプを追加 (230個以上)
 */

// ========================================
// AST Node Classes
// ========================================

class ASTNode {
    constructor() {}
}

class Program extends ASTNode {
    constructor(statements) {
        super();
        this.statements = statements;
    }
}

class SetStatement extends ASTNode {
    constructor(setting, value) {
        super();
        this.setting = setting;
        this.value = value;
    }
}

class MeasureDefinition extends ASTNode {
    constructor(name, notes, dynamic = null, dynamicsCover = null) {
        super();
        this.name = name;
        this.notes = notes;
        this.dynamic = dynamic;
        this.dynamicsCover = dynamicsCover;
    }
}

// P3-8: カスタムコード定義ノード
class CustomChordDefinition extends ASTNode {
    constructor(name, pitches) {
        super();
        this.name = name;
        this.pitches = pitches; // string[]
    }
}

class Note extends ASTNode {
    constructor(pitch, duration, articulation = null, dynamic = null) {
        super();
        this.pitch = pitch;
        this.duration = duration;
        this.articulation = articulation;
        this.dynamic = dynamic;
    }
}

class Rest extends ASTNode {
    constructor(duration) {
        super();
        this.duration = duration;
    }
}

class Chord extends ASTNode {
    constructor(notes) {
        super();
        this.notes = notes;
    }
}

class CodeChord extends ASTNode {
    constructor(chordName, duration = 1.0) {
        super();
        this.chordName = chordName;
        this.duration = duration;
    }
}

class LoopStatement extends ASTNode {
    constructor(count, body) {
        super();
        this.count = count;
        this.body = body;
    }
}

class ReadStatement extends ASTNode {
    constructor(measureNames) {
        super();
        this.measureNames = measureNames;
    }
}

class TrackDefinition extends ASTNode {
    constructor(name, settings, statements) {
        super();
        this.name = name;
        this.settings = settings;
        this.statements = statements;
    }
}

class MeasureReference extends ASTNode {
    constructor(measureName) {
        super();
        this.measureName = measureName;
    }
}

// P3-6: 連符ノード
class TupletDefinition extends ASTNode {
    constructor(name, count, inBeats, notes) {
        super();
        this.name = name;    // 変数名 (null の場合はインライン)
        this.count = count;  // 連符の個数 (e.g. 3)
        this.inBeats = inBeats; // 何拍の中に入れるか (e.g. 2)
        this.notes = notes;
    }
}

// P3-6: 小節内での連符参照 (name 参照 or インライン定義)
class TupletReference extends ASTNode {
    constructor(name, inlineDef = null) {
        super();
        this.name = name;          // 参照名 (インライン時は null)
        this.inlineDef = inlineDef; // TupletDefinition (インライン時)
    }
}

// add stc/leg/acc/ten(target[index]) 後付けアーティキュレーション
class AddStatement extends ASTNode {
    constructor(articulation, target, index) {
        super();
        this.articulation = articulation;
        this.target = target;
        this.index = index;
    }
}

// P3-7: スケール度数ノード
class ScaleDegreeNote extends ASTNode {
    constructor(degree, octave, duration, articulation = null, dynamic = null) {
        super();
        this.degree = degree;
        this.octave = octave;
        this.duration = duration;
        this.articulation = articulation;
        this.dynamic = dynamic;
    }
}

// ========================================
// Chord Definitions (P4-9: 230以上 = 12ルート x 20タイプ = 240)
// ========================================

const CHORD_DEFINITIONS = {
    // C chords
    'C': ['C4', 'E4', 'G4'],
    'Cm': ['C4', 'Eb4', 'G4'],
    'C7': ['C4', 'E4', 'G4', 'Bb4'],
    'Cmaj7': ['C4', 'E4', 'G4', 'B4'],
    'Cm7': ['C4', 'Eb4', 'G4', 'Bb4'],
    'Cdim': ['C4', 'Eb4', 'F#4'],
    'Caug': ['C4', 'E4', 'G#4'],
    'Csus4': ['C4', 'F4', 'G4'],
    'Csus2': ['C4', 'D4', 'G4'],
    'Cm7b5': ['C4', 'Eb4', 'F#4', 'Bb4'],
    'Cadd9': ['C4', 'E4', 'G4', 'D5'],
    'C9': ['C4', 'E4', 'G4', 'Bb4', 'D5'],
    'C11': ['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5'],
    'C13': ['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5', 'A5'],
    'Cm9': ['C4', 'Eb4', 'G4', 'Bb4', 'D5'],
    'Cmaj9': ['C4', 'E4', 'G4', 'B4', 'D5'],
    'C7-b9': ['C4', 'E4', 'G4', 'Bb4', 'C#5'],
    'C7-#9': ['C4', 'E4', 'G4', 'Bb4', 'Eb5'],
    'Cno3': ['C4', 'G4'],
    'Cno5': ['C4', 'E4'],
    'Cmaj7-no5': ['C4', 'E4', 'B4'],

    // C# chords
    'C#': ['C#4', 'F4', 'G#4'],
    'C#m': ['C#4', 'E4', 'G#4'],
    'C#7': ['C#4', 'F4', 'G#4', 'B4'],
    'C#maj7': ['C#4', 'F4', 'G#4', 'C5'],
    'C#m7': ['C#4', 'E4', 'G#4', 'B4'],
    'C#dim': ['C#4', 'E4', 'G4'],
    'C#aug': ['C#4', 'F4', 'A4'],
    'C#sus4': ['C#4', 'F#4', 'G#4'],
    'C#sus2': ['C#4', 'Eb4', 'G#4'],
    'C#m7b5': ['C#4', 'E4', 'G4', 'B4'],
    'C#add9': ['C#4', 'F4', 'G#4', 'Eb5'],
    'C#9': ['C#4', 'F4', 'G#4', 'B4', 'Eb5'],
    'C#11': ['C#4', 'F4', 'G#4', 'B4', 'Eb5', 'F#5'],
    'C#13': ['C#4', 'F4', 'G#4', 'B4', 'Eb5', 'F#5', 'Bb5'],
    'C#m9': ['C#4', 'E4', 'G#4', 'B4', 'Eb5'],
    'C#maj9': ['C#4', 'F4', 'G#4', 'C5', 'Eb5'],
    'C#7-b9': ['C#4', 'F4', 'G#4', 'B4', 'D5'],
    'C#7-#9': ['C#4', 'F4', 'G#4', 'B4', 'E5'],
    'C#no3': ['C#4', 'G#4'],
    'C#no5': ['C#4', 'F4'],
    'C#maj7-no5': ['C#4', 'F4', 'C5'],

    // D chords
    'D': ['D4', 'F#4', 'A4'],
    'Dm': ['D4', 'F4', 'A4'],
    'D7': ['D4', 'F#4', 'A4', 'C5'],
    'Dmaj7': ['D4', 'F#4', 'A4', 'C#5'],
    'Dm7': ['D4', 'F4', 'A4', 'C5'],
    'Ddim': ['D4', 'F4', 'G#4'],
    'Daug': ['D4', 'F#4', 'Bb4'],
    'Dsus4': ['D4', 'G4', 'A4'],
    'Dsus2': ['D4', 'E4', 'A4'],
    'Dm7b5': ['D4', 'F4', 'G#4', 'C5'],
    'Dadd9': ['D4', 'F#4', 'A4', 'E5'],
    'D9': ['D4', 'F#4', 'A4', 'C5', 'E5'],
    'D11': ['D4', 'F#4', 'A4', 'C5', 'E5', 'G5'],
    'D13': ['D4', 'F#4', 'A4', 'C5', 'E5', 'G5', 'B5'],
    'Dm9': ['D4', 'F4', 'A4', 'C5', 'E5'],
    'Dmaj9': ['D4', 'F#4', 'A4', 'C#5', 'E5'],
    'D7-b9': ['D4', 'F#4', 'A4', 'C5', 'Eb5'],
    'D7-#9': ['D4', 'F#4', 'A4', 'C5', 'F5'],
    'Dno3': ['D4', 'A4'],
    'Dno5': ['D4', 'F#4'],
    'Dmaj7-no5': ['D4', 'F#4', 'C#5'],

    // Eb chords
    'Eb': ['Eb4', 'G4', 'Bb4'],
    'Ebm': ['Eb4', 'F#4', 'Bb4'],
    'Eb7': ['Eb4', 'G4', 'Bb4', 'C#5'],
    'Ebmaj7': ['Eb4', 'G4', 'Bb4', 'D5'],
    'Ebm7': ['Eb4', 'F#4', 'Bb4', 'C#5'],
    'Ebdim': ['Eb4', 'F#4', 'A4'],
    'Ebaug': ['Eb4', 'G4', 'B4'],
    'Ebsus4': ['Eb4', 'G#4', 'Bb4'],
    'Ebsus2': ['Eb4', 'F4', 'Bb4'],
    'Ebm7b5': ['Eb4', 'F#4', 'A4', 'C#5'],
    'Ebadd9': ['Eb4', 'G4', 'Bb4', 'F5'],
    'Eb9': ['Eb4', 'G4', 'Bb4', 'C#5', 'F5'],
    'Eb11': ['Eb4', 'G4', 'Bb4', 'C#5', 'F5', 'G#5'],
    'Eb13': ['Eb4', 'G4', 'Bb4', 'C#5', 'F5', 'G#5', 'C6'],
    'Ebm9': ['Eb4', 'F#4', 'Bb4', 'C#5', 'F5'],
    'Ebmaj9': ['Eb4', 'G4', 'Bb4', 'D5', 'F5'],
    'Eb7-b9': ['Eb4', 'G4', 'Bb4', 'C#5', 'E5'],
    'Eb7-#9': ['Eb4', 'G4', 'Bb4', 'C#5', 'F#5'],
    'Ebno3': ['Eb4', 'Bb4'],
    'Ebno5': ['Eb4', 'G4'],
    'Ebmaj7-no5': ['Eb4', 'G4', 'D5'],

    // E chords
    'E': ['E4', 'G#4', 'B4'],
    'Em': ['E4', 'G4', 'B4'],
    'E7': ['E4', 'G#4', 'B4', 'D5'],
    'Emaj7': ['E4', 'G#4', 'B4', 'Eb5'],
    'Em7': ['E4', 'G4', 'B4', 'D5'],
    'Edim': ['E4', 'G4', 'Bb4'],
    'Eaug': ['E4', 'G#4', 'C5'],
    'Esus4': ['E4', 'A4', 'B4'],
    'Esus2': ['E4', 'F#4', 'B4'],
    'Em7b5': ['E4', 'G4', 'Bb4', 'D5'],
    'Eadd9': ['E4', 'G#4', 'B4', 'F#5'],
    'E9': ['E4', 'G#4', 'B4', 'D5', 'F#5'],
    'E11': ['E4', 'G#4', 'B4', 'D5', 'F#5', 'A5'],
    'E13': ['E4', 'G#4', 'B4', 'D5', 'F#5', 'A5', 'C#6'],
    'Em9': ['E4', 'G4', 'B4', 'D5', 'F#5'],
    'Emaj9': ['E4', 'G#4', 'B4', 'Eb5', 'F#5'],
    'E7-b9': ['E4', 'G#4', 'B4', 'D5', 'F5'],
    'E7-#9': ['E4', 'G#4', 'B4', 'D5', 'G5'],
    'Eno3': ['E4', 'B4'],
    'Eno5': ['E4', 'G#4'],
    'Emaj7-no5': ['E4', 'G#4', 'Eb5'],

    // F chords
    'F': ['F4', 'A4', 'C5'],
    'Fm': ['F4', 'G#4', 'C5'],
    'F7': ['F4', 'A4', 'C5', 'Eb5'],
    'Fmaj7': ['F4', 'A4', 'C5', 'E5'],
    'Fm7': ['F4', 'G#4', 'C5', 'Eb5'],
    'Fdim': ['F4', 'G#4', 'B4'],
    'Faug': ['F4', 'A4', 'C#5'],
    'Fsus4': ['F4', 'Bb4', 'C5'],
    'Fsus2': ['F4', 'G4', 'C5'],
    'Fm7b5': ['F4', 'G#4', 'B4', 'Eb5'],
    'Fadd9': ['F4', 'A4', 'C5', 'G5'],
    'F9': ['F4', 'A4', 'C5', 'Eb5', 'G5'],
    'F11': ['F4', 'A4', 'C5', 'Eb5', 'G5', 'Bb5'],
    'F13': ['F4', 'A4', 'C5', 'Eb5', 'G5', 'Bb5', 'D6'],
    'Fm9': ['F4', 'G#4', 'C5', 'Eb5', 'G5'],
    'Fmaj9': ['F4', 'A4', 'C5', 'E5', 'G5'],
    'F7-b9': ['F4', 'A4', 'C5', 'Eb5', 'F#5'],
    'F7-#9': ['F4', 'A4', 'C5', 'Eb5', 'G#5'],
    'Fno3': ['F4', 'C5'],
    'Fno5': ['F4', 'A4'],
    'Fmaj7-no5': ['F4', 'A4', 'E5'],

    // F# chords
    'F#': ['F#4', 'Bb4', 'C#5'],
    'F#m': ['F#4', 'A4', 'C#5'],
    'F#7': ['F#4', 'Bb4', 'C#5', 'E5'],
    'F#maj7': ['F#4', 'Bb4', 'C#5', 'F5'],
    'F#m7': ['F#4', 'A4', 'C#5', 'E5'],
    'F#dim': ['F#4', 'A4', 'C5'],
    'F#aug': ['F#4', 'Bb4', 'D5'],
    'F#sus4': ['F#4', 'B4', 'C#5'],
    'F#sus2': ['F#4', 'G#4', 'C#5'],
    'F#m7b5': ['F#4', 'A4', 'C5', 'E5'],
    'F#add9': ['F#4', 'Bb4', 'C#5', 'G#5'],
    'F#9': ['F#4', 'Bb4', 'C#5', 'E5', 'G#5'],
    'F#11': ['F#4', 'Bb4', 'C#5', 'E5', 'G#5', 'B5'],
    'F#13': ['F#4', 'Bb4', 'C#5', 'E5', 'G#5', 'B5', 'Eb6'],
    'F#m9': ['F#4', 'A4', 'C#5', 'E5', 'G#5'],
    'F#maj9': ['F#4', 'Bb4', 'C#5', 'F5', 'G#5'],
    'F#7-b9': ['F#4', 'Bb4', 'C#5', 'E5', 'G5'],
    'F#7-#9': ['F#4', 'Bb4', 'C#5', 'E5', 'A5'],
    'F#no3': ['F#4', 'C#5'],
    'F#no5': ['F#4', 'Bb4'],
    'F#maj7-no5': ['F#4', 'Bb4', 'F5'],

    // G chords
    'G': ['G4', 'B4', 'D5'],
    'Gm': ['G4', 'Bb4', 'D5'],
    'G7': ['G4', 'B4', 'D5', 'F5'],
    'Gmaj7': ['G4', 'B4', 'D5', 'F#5'],
    'Gm7': ['G4', 'Bb4', 'D5', 'F5'],
    'Gdim': ['G4', 'Bb4', 'C#5'],
    'Gaug': ['G4', 'B4', 'Eb5'],
    'Gsus4': ['G4', 'C5', 'D5'],
    'Gsus2': ['G4', 'A4', 'D5'],
    'Gm7b5': ['G4', 'Bb4', 'C#5', 'F5'],
    'Gadd9': ['G4', 'B4', 'D5', 'A5'],
    'G9': ['G4', 'B4', 'D5', 'F5', 'A5'],
    'G11': ['G4', 'B4', 'D5', 'F5', 'A5', 'C6'],
    'G13': ['G4', 'B4', 'D5', 'F5', 'A5', 'C6', 'E6'],
    'Gm9': ['G4', 'Bb4', 'D5', 'F5', 'A5'],
    'Gmaj9': ['G4', 'B4', 'D5', 'F#5', 'A5'],
    'G7-b9': ['G4', 'B4', 'D5', 'F5', 'G#5'],
    'G7-#9': ['G4', 'B4', 'D5', 'F5', 'Bb5'],
    'Gno3': ['G4', 'D5'],
    'Gno5': ['G4', 'B4'],
    'Gmaj7-no5': ['G4', 'B4', 'F#5'],

    // G# chords
    'G#': ['G#4', 'C5', 'Eb5'],
    'G#m': ['G#4', 'B4', 'Eb5'],
    'G#7': ['G#4', 'C5', 'Eb5', 'F#5'],
    'G#maj7': ['G#4', 'C5', 'Eb5', 'G5'],
    'G#m7': ['G#4', 'B4', 'Eb5', 'F#5'],
    'G#dim': ['G#4', 'B4', 'D5'],
    'G#aug': ['G#4', 'C5', 'E5'],
    'G#sus4': ['G#4', 'C#5', 'Eb5'],
    'G#sus2': ['G#4', 'Bb4', 'Eb5'],
    'G#m7b5': ['G#4', 'B4', 'D5', 'F#5'],
    'G#add9': ['G#4', 'C5', 'Eb5', 'Bb5'],
    'G#9': ['G#4', 'C5', 'Eb5', 'F#5', 'Bb5'],
    'G#11': ['G#4', 'C5', 'Eb5', 'F#5', 'Bb5', 'C#6'],
    'G#13': ['G#4', 'C5', 'Eb5', 'F#5', 'Bb5', 'C#6', 'F6'],
    'G#m9': ['G#4', 'B4', 'Eb5', 'F#5', 'Bb5'],
    'G#maj9': ['G#4', 'C5', 'Eb5', 'G5', 'Bb5'],
    'G#7-b9': ['G#4', 'C5', 'Eb5', 'F#5', 'A5'],
    'G#7-#9': ['G#4', 'C5', 'Eb5', 'F#5', 'B5'],
    'G#no3': ['G#4', 'Eb5'],
    'G#no5': ['G#4', 'C5'],
    'G#maj7-no5': ['G#4', 'C5', 'G5'],

    // A chords
    'A': ['A4', 'C#5', 'E5'],
    'Am': ['A4', 'C5', 'E5'],
    'A7': ['A4', 'C#5', 'E5', 'G5'],
    'Amaj7': ['A4', 'C#5', 'E5', 'G#5'],
    'Am7': ['A4', 'C5', 'E5', 'G5'],
    'Adim': ['A4', 'C5', 'Eb5'],
    'Aaug': ['A4', 'C#5', 'F5'],
    'Asus4': ['A4', 'D5', 'E5'],
    'Asus2': ['A4', 'B4', 'E5'],
    'Am7b5': ['A4', 'C5', 'Eb5', 'G5'],
    'Aadd9': ['A4', 'C#5', 'E5', 'B5'],
    'A9': ['A4', 'C#5', 'E5', 'G5', 'B5'],
    'A11': ['A4', 'C#5', 'E5', 'G5', 'B5', 'D6'],
    'A13': ['A4', 'C#5', 'E5', 'G5', 'B5', 'D6', 'F#6'],
    'Am9': ['A4', 'C5', 'E5', 'G5', 'B5'],
    'Amaj9': ['A4', 'C#5', 'E5', 'G#5', 'B5'],
    'A7-b9': ['A4', 'C#5', 'E5', 'G5', 'Bb5'],
    'A7-#9': ['A4', 'C#5', 'E5', 'G5', 'C6'],
    'Ano3': ['A4', 'E5'],
    'Ano5': ['A4', 'C#5'],
    'Amaj7-no5': ['A4', 'C#5', 'G#5'],

    // Bb chords
    'Bb': ['Bb4', 'D5', 'F5'],
    'Bbm': ['Bb4', 'C#5', 'F5'],
    'Bb7': ['Bb4', 'D5', 'F5', 'G#5'],
    'Bbmaj7': ['Bb4', 'D5', 'F5', 'A5'],
    'Bbm7': ['Bb4', 'C#5', 'F5', 'G#5'],
    'Bbdim': ['Bb4', 'C#5', 'E5'],
    'Bbaug': ['Bb4', 'D5', 'F#5'],
    'Bbsus4': ['Bb4', 'Eb5', 'F5'],
    'Bbsus2': ['Bb4', 'C5', 'F5'],
    'Bbm7b5': ['Bb4', 'C#5', 'E5', 'G#5'],
    'Bbadd9': ['Bb4', 'D5', 'F5', 'C6'],
    'Bb9': ['Bb4', 'D5', 'F5', 'G#5', 'C6'],
    'Bb11': ['Bb4', 'D5', 'F5', 'G#5', 'C6', 'Eb6'],
    'Bb13': ['Bb4', 'D5', 'F5', 'G#5', 'C6', 'Eb6', 'G6'],
    'Bbm9': ['Bb4', 'C#5', 'F5', 'G#5', 'C6'],
    'Bbmaj9': ['Bb4', 'D5', 'F5', 'A5', 'C6'],
    'Bb7-b9': ['Bb4', 'D5', 'F5', 'G#5', 'B5'],
    'Bb7-#9': ['Bb4', 'D5', 'F5', 'G#5', 'C#6'],
    'Bbno3': ['Bb4', 'F5'],
    'Bbno5': ['Bb4', 'D5'],
    'Bbmaj7-no5': ['Bb4', 'D5', 'A5'],

    // B chords
    'B': ['B4', 'Eb5', 'F#5'],
    'Bm': ['B4', 'D5', 'F#5'],
    'B7': ['B4', 'Eb5', 'F#5', 'A5'],
    'Bmaj7': ['B4', 'Eb5', 'F#5', 'Bb5'],
    'Bm7': ['B4', 'D5', 'F#5', 'A5'],
    'Bdim': ['B4', 'D5', 'F5'],
    'Baug': ['B4', 'Eb5', 'G5'],
    'Bsus4': ['B4', 'E5', 'F#5'],
    'Bsus2': ['B4', 'C#5', 'F#5'],
    'Bm7b5': ['B4', 'D5', 'F5', 'A5'],
    'Badd9': ['B4', 'Eb5', 'F#5', 'C#6'],
    'B9': ['B4', 'Eb5', 'F#5', 'A5', 'C#6'],
    'B11': ['B4', 'Eb5', 'F#5', 'A5', 'C#6', 'E6'],
    'B13': ['B4', 'Eb5', 'F#5', 'A5', 'C#6', 'E6', 'G#6'],
    'Bm9': ['B4', 'D5', 'F#5', 'A5', 'C#6'],
    'Bmaj9': ['B4', 'Eb5', 'F#5', 'Bb5', 'C#6'],
    'B7-b9': ['B4', 'Eb5', 'F#5', 'A5', 'C6'],
    'B7-#9': ['B4', 'Eb5', 'F#5', 'A5', 'D6'],
    'Bno3': ['B4', 'F#5'],
    'Bno5': ['B4', 'Eb5'],
    'Bmaj7-no5': ['B4', 'Eb5', 'Bb5']
};

// ========================================
// Scale Definitions (P3-7)
// ========================================

const SCALE_DEFINITIONS = {
    'major':         [0, 2, 4, 5, 7, 9, 11],
    'minor':         [0, 2, 3, 5, 7, 8, 10],
    'dorian':        [0, 2, 3, 5, 7, 9, 10],
    'phrygian':      [0, 1, 3, 5, 7, 8, 10],
    'lydian':        [0, 2, 4, 6, 7, 9, 11],
    'mixolydian':    [0, 2, 4, 5, 7, 9, 10],
    'locrian':       [0, 1, 3, 5, 6, 8, 10],
    'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
    'melodic_minor': [0, 2, 3, 5, 7, 9, 11],
    'pentatonic':    [0, 2, 4, 7, 9],
    'blues':         [0, 3, 5, 6, 7, 10]
};

// ========================================
// Lexer
// ========================================

class UzumeLexer {
    constructor() {
        this.tokens = [];
        this.current = 0;
    }

    tokenize(source) {
        this.tokens = [];
        this.current = 0;

        // ----------------------------------------------------------------
        // パターン優先順位 (上が優先):
        //
        // 1. COMMENT
        // 2. N_NOTE    n[A-G][#b]?[0-9]        例: nC4, nF#3
        // 3. キーワード (set/measure/chord/code/tuplet/track/loop/read/add/in)
        // 4. ARTICULATION (stc/leg/acc/ten)
        // 5. DYNAMIC (pp/p/mp/mf/f/ff)
        // 6. DOT_xxx   (.cre/.dec/.cover/.arpeggio)
        // 7. FRACTION  d+/d+
        // 8. NUMBER
        // 9. NOTE      [A-G][#b]?[0-9]          例: C4, F#3
        //    ※ NOTEはCHORD_NAMEより前だが、後ろに英字が続く場合は
        //       CHORD_NAMEとして扱わないといけない問題がある。
        //       解決策: NOTE は [A-G][#b]?[0-9] のみ (末尾が数字で終わる)
        //       CHORD_NAME は [A-G][#b]?[a-zA-Z0-9\-#]* で英字が1字以上続く
        //       (NOTE が [A-G][#b]?[0-9] なので、Cmaj7 は C4 にはならない)
        // 10. REST     R (後ろに英数字なし)
        // 11. SCALE_DEGREE  [0-9]+_[0-9]+
        // 12. CHORD_NAME   [A-G][#b]?[a-zA-Z0-9\-#]+   (英字1字以上必須)
        // 13. IDENTIFIER   [a-zA-Z_][a-zA-Z0-9_]*
        //     ※ A-G で始まる識別子も [0-9] が後に続かなければ
        //       CHORD_NAMEに分類され、後でパーサが対処する。
        //       しかし measure 名 (Atheme 等) が CHORD_NAME になってしまう。
        //       → 対策: CHORD_NAME は [A-G][#b]?[a-zA-Z0-9\-#]* だが、
        //         パーサで「= measure」の前後でCHORD_NAMEもIDENTIFIERとして扱う。
        //         もしくは、CHORD_NAME を [A-G][#b]?(?:dim|aug|maj|min|m|sus|add|\d)...
        //         のように厳密に限定する。
        //
        // ここでは "context-sensitive" に対応するため:
        //   CHORD_NAME = [A-G][#b]?(?=[a-zA-Z0-9\-#]) で始まり
        //                後ろに既知のコードサフィックスが続く場合のみ
        //   それ以外は IDENTIFIER として扱う
        //
        // 実装: CHORD_NAME の後方参照を使わず、lexer後にパーサで対処する。
        // CHORD_NAME トークンも parseMeasureDefinition では IDENTIFIER として受理する。
        // ----------------------------------------------------------------

        const patterns = [
            // 1. Comments
            { type: 'COMMENT', regex: /\/\/.*/g },
            // 2. N_NOTE (must come before NOTE and IDENTIFIER)
            { type: 'N_NOTE', regex: /n[A-G][#b]?[0-9]/g },
            // 3. Keywords (longest-match priority via ordering)
            { type: 'SET',     regex: /set(?![a-zA-Z0-9_])/g },
            { type: 'MEASURE', regex: /measure(?![a-zA-Z0-9_])/g },
            { type: 'CHORD',   regex: /chord(?![a-zA-Z0-9_])/g },
            { type: 'CODE',    regex: /code(?![a-zA-Z0-9_])/g },
            { type: 'TUPLET',  regex: /tuplet(?![a-zA-Z0-9_])/g },
            { type: 'TRACK',   regex: /track(?![a-zA-Z0-9_])/g },
            { type: 'LOOP',    regex: /loop(?![a-zA-Z0-9_])/g },
            { type: 'READ',    regex: /read(?![a-zA-Z0-9_])/g },
            { type: 'ADD',     regex: /add(?![a-zA-Z0-9_])/g },
            { type: 'IN',      regex: /in(?![a-zA-Z0-9_])/g },
            // 4. Articulations
            { type: 'ARTICULATION', regex: /(?:stc|leg|acc|ten)(?![a-zA-Z0-9_])/g },
            // 5. Dynamics
            { type: 'DYNAMIC', regex: /(?:pp|mp|mf|ff|p|f)(?![a-zA-Z0-9_])/g },
            // 6. Dot modifiers
            { type: 'DOT_ARPEGGIO', regex: /\.arpeggio(?![a-zA-Z0-9_])/g },
            { type: 'DOT_COVER',    regex: /\.cover(?![a-zA-Z0-9_])/g },
            { type: 'DOT_CRE',      regex: /\.cre(?![a-zA-Z0-9_])/g },
            { type: 'DOT_DEC',      regex: /\.dec(?![a-zA-Z0-9_])/g },
            // 7. Fractions
            { type: 'FRACTION', regex: /\d+\/\d+/g },
            // 7.5. Scale degree (must come before NUMBER to match "1_4" before "1")
            { type: 'SCALE_DEGREE', regex: /[0-9]+_[0-9]+/g },
            // 8. Numbers
            { type: 'NUMBER', regex: /\d+(?:\.\d+)?/g },
            // 9. NOTE: [A-G][#b]?[0-9]  (後ろに英字が続かないこと)
            //    例: C4, F#3, Bb2  ←NOTE
            //    例: C4m, Cmaj7   ←CHORD_NAMEに任せる
            { type: 'NOTE', regex: /[A-G][#b]?[0-9](?![a-zA-Z_])/g },
            // 10. Rest
            { type: 'REST', regex: /R(?![a-zA-Z0-9_])/g },
            // 12. CHORD_NAME: 音名ルート + コードサフィックス (英字必須)
            //     例: Cmaj7, Am, F#m7b5
            //     ただし A-G 単独は CHORD_NAME (後ろが非英数 or 数字のみなら NOTE で捕捉済)
            { type: 'CHORD_NAME', regex: /[A-G][#b]?[a-zA-Z][a-zA-Z0-9#\-]*/g },
            // 13. Identifiers (including bare A-G chord names like 'C', 'Am' that survived)
            { type: 'IDENTIFIER', regex: /[a-zA-Z_][a-zA-Z0-9_]*/g },
            // Operators & Punctuation
            { type: 'ASSIGN',    regex: /=/g },
            { type: 'AMPERSAND', regex: /&/g },
            { type: 'CARET',     regex: /\^/g },
            { type: 'SHARP',     regex: /#/g },
            { type: 'MINUS',     regex: /-/g },
            { type: 'SLASH',     regex: /\//g },
            { type: 'SEMICOLON', regex: /;/g },
            { type: 'COMMA',     regex: /,/g },
            { type: 'LPAR',      regex: /\(/g },
            { type: 'RPAR',      regex: /\)/g },
            { type: 'LBRACE',    regex: /\{/g },
            { type: 'RBRACE',    regex: /\}/g },
            { type: 'LSQB',      regex: /\[/g },
            { type: 'RSQB',      regex: /\]/g },
            { type: 'WHITESPACE', regex: /\s+/g }
        ];

        let position = 0;

        while (position < source.length) {
            let matched = false;
            const remaining = source.slice(position);

            for (const pattern of patterns) {
                const regex = new RegExp('^' + pattern.regex.source);
                const match = regex.exec(remaining);

                if (match) {
                    if (pattern.type !== 'WHITESPACE' && pattern.type !== 'COMMENT') {
                        this.tokens.push({
                            type: pattern.type,
                            value: match[0],
                            position: position
                        });
                    }
                    position += match[0].length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new Error(`Unexpected character at position ${position}: '${source[position]}'`);
            }
        }

        return this.tokens;
    }

    peek(offset = 0) {
        const idx = this.current + offset;
        return idx < this.tokens.length ? this.tokens[idx] : null;
    }

    consume(expectedType = null) {
        const token = this.tokens[this.current++];
        if (expectedType && token && token.type !== expectedType) {
            throw new Error(`Expected ${expectedType}, got ${token ? token.type : 'EOF'} ('${token ? token.value : ''}')`);
        }
        return token;
    }

    match(...types) {
        const token = this.peek();
        return token && types.includes(token.type);
    }

    // CHORD_NAME または IDENTIFIER のどちらも「識別子」として扱うヘルパー
    matchIdentifierLike() {
        return this.match('IDENTIFIER', 'CHORD_NAME');
    }

    consumeIdentifierLike() {
        if (this.match('IDENTIFIER', 'CHORD_NAME')) {
            return this.consume();
        }
        throw new Error(`Expected identifier, got ${this.peek()?.type} ('${this.peek()?.value}')`);
    }
}

// ========================================
// Parser
// ========================================

class UzumeParser {
    constructor() {
        this.lexer = new UzumeLexer();
        this.customChords = {}; // P3-8: カスタムコード辞書
    }

    parse(source) {
        this.tokens = this.lexer.tokenize(source);
        this.lexer.current = 0;

        const statements = [];
        while (this.lexer.peek()) {
            statements.push(this.parseStatement());
        }

        return new Program(statements);
    }

    parseStatement() {
        const token = this.lexer.peek();
        if (!token) return null;

        switch (token.type) {
            case 'SET':
                return this.parseSetStatement();
            case 'TRACK':
                return this.parseTrackDefinition();
            case 'LOOP':
                return this.parseLoopStatement();
            case 'READ':
                return this.parseReadStatement();
            case 'ADD':
                return this.parseAddStatement();
            case 'TUPLET':
                // tuplet単体定義: tupletName = tuplet N in M [...];
                // ここには来ない (tupletは IDENTIFIER = tuplet で来る)
                // ただし inline tuplet: tuplet N in M [...]; はここで処理
                return this.parseTupletStatement();
            case 'IDENTIFIER':
            case 'CHORD_NAME':
                // 識別子の後を確認: = の後が measure/chord/tuplet かによって分岐
                return this.parseIdentifierStatement();
            default: {
                const nextTokens = [];
                for (let i = 0; i < 5 && (this.lexer.current + i) < this.lexer.tokens.length; i++) {
                    const t = this.lexer.tokens[this.lexer.current + i];
                    nextTokens.push(`${t.type}='${t.value}'`);
                }
                throw new Error(`Unexpected token: ${token.type} = '${token.value}'. Next: [${nextTokens.join(', ')}]`);
            }
        }
    }

    // IDENTIFIER/CHORD_NAME の後を見て振り分け
    parseIdentifierStatement() {
        const name = this.lexer.consumeIdentifierLike().value;
        this.lexer.consume('ASSIGN');

        const next = this.lexer.peek();
        if (!next) throw new Error(`Expected measure/chord/tuplet after '${name} ='`);

        if (next.type === 'MEASURE') {
            return this.parseMeasureBody(name);
        } else if (next.type === 'CHORD') {
            return this.parseCustomChordBody(name);
        } else if (next.type === 'TUPLET') {
            return this.parseTupletBody(name);
        } else {
            throw new Error(`Expected 'measure', 'chord', or 'tuplet' after '${name} =', got ${next.type}='${next.value}'`);
        }
    }

    parseSetStatement() {
        this.lexer.consume('SET');
        const setting = this.lexer.consumeIdentifierLike().value;
        this.lexer.consume('LPAR');

        let value;

        if (this.lexer.match('FRACTION')) {
            const fractionStr = this.lexer.consume('FRACTION').value;
            const parts = fractionStr.split('/');
            value = [parseInt(parts[0]), parseInt(parts[1])];
        } else if (this.lexer.match('NUMBER')) {
            value = parseFloat(this.lexer.consume('NUMBER').value);
            if (this.lexer.match('SLASH')) {
                this.lexer.consume('SLASH');
                const denominator = parseFloat(this.lexer.consume('NUMBER').value);
                value = [value, denominator];
            }
        } else if (this.lexer.matchIdentifierLike()) {
            value = this.lexer.consumeIdentifierLike().value;
            if (this.lexer.match('COMMA')) {
                this.lexer.consume('COMMA');
                const secondValue = this.lexer.matchIdentifierLike() ?
                    this.lexer.consumeIdentifierLike().value :
                    this.lexer.consume('NUMBER').value;
                value = [value, secondValue];
            }
        } else {
            const nextTokens = [];
            for (let i = 0; i < 3 && (this.lexer.current + i) < this.lexer.tokens.length; i++) {
                const t = this.lexer.tokens[this.lexer.current + i];
                nextTokens.push(`${t.type}='${t.value}'`);
            }
            throw new Error(`Expected FRACTION, NUMBER, or IDENTIFIER in set statement, found: [${nextTokens.join(', ')}]`);
        }

        this.lexer.consume('RPAR');
        this.lexer.consume('SEMICOLON');
        return new SetStatement(setting, value);
    }

    parseTrackDefinition() {
        this.lexer.consume('TRACK');
        const name = this.lexer.consumeIdentifierLike().value;
        this.lexer.consume('LBRACE');

        const settings = {};
        const statements = [];

        while (!this.lexer.match('RBRACE')) {
            if (this.lexer.match('SET')) {
                const stmt = this.parseSetStatement();
                settings[stmt.setting] = stmt.value;
            } else {
                statements.push(this.parseStatement());
            }
        }

        this.lexer.consume('RBRACE');
        return new TrackDefinition(name, settings, statements);
    }

    // 小節定義本体 (name = measure[...])
    parseMeasureBody(name) {
        this.lexer.consume('MEASURE');

        let dynamic = null;
        if (this.lexer.match('DOT_CRE', 'DOT_DEC', 'DOT_COVER', 'DOT_ARPEGGIO')) {
            dynamic = this.lexer.consume().value;
        }

        this.lexer.consume('LSQB');
        const notes = this.parseNoteList();
        this.lexer.consume('RSQB');
        this.lexer.consume('SEMICOLON');

        return new MeasureDefinition(name, notes, dynamic);
    }

    // P3-8: カスタムコード定義本体 (Name = chord[C4, E4, G4])
    parseCustomChordBody(name) {
        this.lexer.consume('CHORD');
        this.lexer.consume('LSQB');

        const pitches = [];
        while (!this.lexer.match('RSQB')) {
            // NOTE トークン (C4, F#3 等)
            if (this.lexer.match('NOTE')) {
                pitches.push(this.lexer.consume('NOTE').value);
            } else if (this.lexer.match('N_NOTE')) {
                pitches.push(this.lexer.consume('N_NOTE').value.slice(1));
            } else {
                throw new Error(`Expected note pitch in chord definition, got ${this.lexer.peek()?.type}`);
            }
            if (this.lexer.match('COMMA')) {
                this.lexer.consume('COMMA');
            }
        }
        this.lexer.consume('RSQB');
        this.lexer.consume('SEMICOLON');

        // カスタムコードを登録
        this.customChords[name] = pitches;
        return new CustomChordDefinition(name, pitches);
    }

    // P3-6: 連符定義
    parseTupletBody(name) {
        this.lexer.consume('TUPLET');
        const count = parseInt(this.lexer.consume('NUMBER').value);
        this.lexer.consume('IN');
        const inBeats = parseFloat(this.lexer.consume('NUMBER').value);
        this.lexer.consume('LSQB');
        const notes = this.parseNoteList();
        this.lexer.consume('RSQB');
        this.lexer.consume('SEMICOLON');
        return new TupletDefinition(name, count, inBeats, notes);
    }

    // インライン tuplet 文 (measure内でのtuplet参照ではなくtopレベル)
    parseTupletStatement() {
        this.lexer.consume('TUPLET');
        const count = parseInt(this.lexer.consume('NUMBER').value);
        this.lexer.consume('IN');
        const inBeats = parseFloat(this.lexer.consume('NUMBER').value);
        this.lexer.consume('LSQB');
        const notes = this.parseNoteList();
        this.lexer.consume('RSQB');
        this.lexer.consume('SEMICOLON');
        return new TupletDefinition(null, count, inBeats, notes);
    }

    // P3-6: 小節内連符参照
    //   tuplet(name)                → 名前参照
    //   tuplet N in M [notes]       → インライン匿名連符
    parseTupletReference() {
        this.lexer.consume('TUPLET');

        if (this.lexer.match('LPAR')) {
            this.lexer.consume('LPAR');
            const name = this.lexer.consumeIdentifierLike().value;
            this.lexer.consume('RPAR');
            return new TupletReference(name);
        }

        // インライン: tuplet N in M [...]
        const count = parseInt(this.lexer.consume('NUMBER').value);
        this.lexer.consume('IN');
        const inBeats = parseFloat(this.lexer.consume('NUMBER').value);
        this.lexer.consume('LSQB');
        const notes = this.parseNoteList();
        this.lexer.consume('RSQB');
        return new TupletReference(null, new TupletDefinition(null, count, inBeats, notes));
    }

    parseNoteList() {
        const notes = [];

        while (!this.lexer.match('RSQB')) {
            notes.push(this.parseNoteExpression());
            if (this.lexer.match('COMMA')) {
                this.lexer.consume('COMMA');
            }
        }

        return notes;
    }

    parseNoteExpression() {
        // articulation prefix
        if (this.lexer.match('ARTICULATION')) {
            const articulation = this.lexer.consume('ARTICULATION').value;
            const note = this.parseNoteExpression();
            if (note instanceof Note || note instanceof ScaleDegreeNote) {
                note.articulation = articulation;
            }
            return note;
        }

        // n接頭辞付き音名 (既存)
        if (this.lexer.match('N_NOTE')) {
            return this.parseNNote();
        }

        // P1-1: 接頭辞なし音名 NOTE (C4, F#3 等)
        if (this.lexer.match('NOTE')) {
            return this.parseBareNote();
        }

        // 休符
        if (this.lexer.match('REST')) {
            return this.parseRest();
        }

        // 和音 [ ... ]
        if (this.lexer.match('LSQB')) {
            return this.parseChord();
        }

        // P3-6: 連符参照 tuplet(name) またはインライン tuplet N in M [...]
        if (this.lexer.match('TUPLET')) {
            return this.parseTupletReference();
        }

        // P3-7: スケール度数 1_4, 2_3 等
        if (this.lexer.match('SCALE_DEGREE')) {
            return this.parseScaleDegreeNote();
        }

        // 識別子 = 小節参照
        if (this.lexer.matchIdentifierLike()) {
            return new MeasureReference(this.lexer.consumeIdentifierLike().value);
        }

        throw new Error(`Unexpected token in note expression: ${this.lexer.peek()?.type} = '${this.lexer.peek()?.value}'`);
    }

    // 既存: nC4-1 形式
    parseNNote() {
        const noteToken = this.lexer.consume('N_NOTE').value;
        const pitch = noteToken.slice(1); // Remove 'n' prefix
        return this.parseNoteAfterPitch(pitch);
    }

    // P1-1: C4-1 形式 (nなし)
    parseBareNote() {
        const pitch = this.lexer.consume('NOTE').value;
        return this.parseNoteAfterPitch(pitch);
    }

    parseNoteAfterPitch(pitch) {
        this.lexer.consume('MINUS');
        const duration = parseFloat(this.lexer.consume('NUMBER').value);

        let dynamic = null;
        if (this.lexer.match('CARET')) {
            this.lexer.consume('CARET');
            dynamic = this.lexer.consume('DYNAMIC').value;
        }

        return new Note(pitch, duration, null, dynamic);
    }

    parseRest() {
        this.lexer.consume('REST');
        this.lexer.consume('MINUS');
        const duration = parseFloat(this.lexer.consume('NUMBER').value);
        return new Rest(duration);
    }

    // P3-7: スケール度数パース  1_4-2  → degree=1, octave=4, duration=2
    parseScaleDegreeNote() {
        const sdToken = this.lexer.consume('SCALE_DEGREE').value; // e.g. "1_4"
        const parts = sdToken.split('_');
        const degree = parseInt(parts[0]);
        const octave = parseInt(parts[1]);
        this.lexer.consume('MINUS');
        const duration = parseFloat(this.lexer.consume('NUMBER').value);

        let dynamic = null;
        if (this.lexer.match('CARET')) {
            this.lexer.consume('CARET');
            dynamic = this.lexer.consume('DYNAMIC').value;
        }

        return new ScaleDegreeNote(degree, octave, duration, null, dynamic);
    }

    parseChord() {
        this.lexer.consume('LSQB');

        if (this.lexer.match('CODE')) {
            const codeChord = this.parseCodeChord();
            this.lexer.consume('RSQB');
            return codeChord;
        }

        const notes = this.parseNoteList();
        this.lexer.consume('RSQB');
        return new Chord(notes);
    }

    parseCodeChord() {
        this.lexer.consume('CODE');
        this.lexer.consume('LPAR');

        // コード名は CHORD_NAME, IDENTIFIER, NOTE 等様々なトークンになりうる。
        // さらに C7-b9 / C7-#9 のように複数トークンに分割される場合があるため、
        // RPAR までのトークンを全て結合してコード名を再構成する。
        // (例: NOTE 'C7' + MINUS '-' + IDENTIFIER 'b9' → 'C7-b9')
        // (例: NOTE 'C7' + MINUS '-' + SHARP '#' + NUMBER '9' → 'C7-#9')
        let chordName = '';
        while (!this.lexer.match('RPAR')) {
            const token = this.lexer.peek();
            if (!token) {
                throw new Error('Unexpected EOF inside code()');
            }
            chordName += token.value;
            this.lexer.consume();
        }

        this.lexer.consume('RPAR');

        let duration = 1.0;
        if (this.lexer.match('MINUS')) {
            this.lexer.consume('MINUS');
            duration = parseFloat(this.lexer.consume('NUMBER').value);
        }

        return new CodeChord(chordName, duration);
    }

    parseLoopStatement() {
        this.lexer.consume('LOOP');
        const count = parseInt(this.lexer.consume('NUMBER').value);
        this.lexer.consume('LBRACE');

        const body = [];
        while (!this.lexer.match('RBRACE')) {
            body.push(this.parseStatement());
        }

        this.lexer.consume('RBRACE');
        return new LoopStatement(count, body);
    }

    parseReadStatement() {
        this.lexer.consume('READ');
        this.lexer.consume('LPAR');

        const measureNames = [];
        measureNames.push(this.lexer.consumeIdentifierLike().value);

        while (this.lexer.match('AMPERSAND')) {
            this.lexer.consume('AMPERSAND');
            measureNames.push(this.lexer.consumeIdentifierLike().value);
        }

        this.lexer.consume('RPAR');
        this.lexer.consume('SEMICOLON');

        return new ReadStatement(measureNames);
    }

    parseAddStatement() {
        this.lexer.consume('ADD');
        const articulation = this.lexer.consume('ARTICULATION').value;
        this.lexer.consume('LPAR');
        const target = this.lexer.consumeIdentifierLike().value;

        let index = null;
        if (this.lexer.match('LSQB')) {
            this.lexer.consume('LSQB');
            index = parseInt(this.lexer.consume('NUMBER').value);
            this.lexer.consume('RSQB');
        }

        this.lexer.consume('RPAR');
        this.lexer.consume('SEMICOLON');

        return new AddStatement(articulation, target, index);
    }
}

// ========================================
// Audio Engine
// ========================================

class UzumeAudioEngine {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 44100;
        this.masterGain = null;
        this.masterVolume = 0.5;
        this.activeSources = [];
        // ブラウザ環境のみ初期化
        if (typeof window !== 'undefined') {
            this.initAudio();
        }
    }

    async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.setMasterVolume(this.masterVolume);
        } catch (e) {
            console.error('Web Audio API not supported:', e);
        }
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            const gainValue = this.masterVolume * this.masterVolume;
            this.masterGain.gain.setValueAtTime(gainValue, this.audioContext.currentTime);
        }
    }

    noteToFrequency(note) {
        const noteMap = {
            'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
            'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
        };

        const match = note.match(/([A-G][#b]?)([0-9])/);
        if (!match) return 440; // Default A4

        const noteName = match[1];
        const octave = parseInt(match[2]);
        const semitone = noteMap[noteName];
        const midi = (octave + 1) * 12 + semitone;

        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    /**
     * 指定されたオクターブ・度数からスケール音名を返す (P3-7)
     * @param {number} degree - 1始まりの度数
     * @param {number} octave
     * @param {number[]} scaleIntervals - 半音間隔の配列
     * @param {string} rootNote - ルート音名 (e.g. 'C')
     */
    scaleDegreeToNote(degree, octave, scaleIntervals, rootNote = 'C') {
        const noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
        const noteMap = {
            'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
            'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
        };

        const rootSemitone = noteMap[rootNote] || 0;
        const degreeIndex = ((degree - 1) % scaleIntervals.length);
        const octaveShift = Math.floor((degree - 1) / scaleIntervals.length);
        const interval = scaleIntervals[degreeIndex];
        const semitone = (rootSemitone + interval) % 12;
        const actualOctave = octave + octaveShift;

        return noteNames[semitone] + actualOctave;
    }

    /**
     * @param {number} frequency
     * @param {number} durationInSeconds
     * @param {string} waveType
     * @param {number} volume  0..1
     * @param {string} articulation  stc/leg/acc/ten/null
     * @param {object} envelopeOverride  {attackRatio, releaseRatio}
     */
    generateWaveform(frequency, durationInSeconds, waveType = 'sine', volume = 0.5,
                     articulation = null, envelopeOverride = null) {
        const samples = Math.floor(durationInSeconds * this.sampleRate);
        if (samples <= 0) return new Float32Array(0);
        const buffer = new Float32Array(samples);

        for (let i = 0; i < samples; i++) {
            const t = i / this.sampleRate;
            let sample = 0;

            switch (waveType) {
                case 'sine':
                    sample = Math.sin(2 * Math.PI * frequency * t);
                    break;
                case 'square':
                    sample = Math.sign(Math.sin(2 * Math.PI * frequency * t));
                    break;
                case 'triangle':
                    sample = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * frequency * t));
                    break;
                case 'sawtooth':
                    sample = 2 * (t * frequency - Math.floor(t * frequency + 0.5));
                    break;
                case 'pulse':
                    // 25% duty cycle pulse
                    sample = ((t * frequency) % 1) < 0.25 ? 1 : -1;
                    break;
                case 'pulse50':
                    // P1-2: 50% duty cycle pulse (square と同義だが明示的)
                    sample = ((t * frequency) % 1) < 0.5 ? 1 : -1;
                    break;
                case 'bit8':
                case 'chiptune':
                    sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * 15) / 15;
                    break;
                default:
                    sample = Math.sin(2 * Math.PI * frequency * t);
            }

            buffer[i] = sample * volume * this.applyEnvelope(i, samples, articulation, envelopeOverride);
        }

        return buffer;
    }

    /**
     * P2-4: articulation に応じたエンベロープ
     */
    applyEnvelope(sample, totalSamples, articulation = null, override = null) {
        let attackRatio = 0.1;
        let releaseRatio = 0.3;
        let sustainEnd = totalSamples; // 実際に音が続く長さ

        if (override) {
            attackRatio = override.attackRatio !== undefined ? override.attackRatio : attackRatio;
            releaseRatio = override.releaseRatio !== undefined ? override.releaseRatio : releaseRatio;
        }

        // P2-4: articulation によるエンベロープ変形
        if (articulation === 'stc') {
            // staccato: 音価の50%で終わる、リリース早め
            sustainEnd = Math.floor(totalSamples * 0.5);
            releaseRatio = 0.4;
        } else if (articulation === 'leg') {
            // legato: 長めのアタック、なめらかなリリース
            attackRatio = 0.05;
            releaseRatio = 0.1;
        } else if (articulation === 'ten') {
            // tenuto: アタック短め、音価をフルに保持
            attackRatio = 0.03;
            releaseRatio = 0.15;
        }
        // acc (accent) はエンベロープより音量で対処 (renderNoteで)

        const attack = Math.min(totalSamples * attackRatio, 2000);
        const release = Math.min(totalSamples * releaseRatio, 5000);

        // staccato の場合 sustainEnd 以降は無音
        if (articulation === 'stc' && sample >= sustainEnd) {
            return 0;
        }

        if (sample < attack) {
            return sample / attack;
        } else if (sample > totalSamples - release) {
            return Math.max(0, (totalSamples - sample) / release);
        }
        return 1;
    }

    async playBuffer(buffer) {
        if (!this.audioContext) {
            await this.initAudio();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioBuffer = this.audioContext.createBuffer(1, buffer.length, this.sampleRate);
        audioBuffer.copyToChannel(buffer, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.masterGain);

        this.activeSources.push(source);
        source.onended = () => {
            const index = this.activeSources.indexOf(source);
            if (index > -1) this.activeSources.splice(index, 1);
        };

        source.start();

        return new Promise(resolve => {
            const originalOnended = source.onended;
            source.onended = () => {
                if (originalOnended) originalOnended();
                resolve();
            };
        });
    }

    stopAllSources() {
        this.activeSources.forEach(source => {
            try { source.stop(); } catch (e) {}
        });
        this.activeSources = [];
    }
}

// ========================================
// Dynamic volume mapping (P2-3)
// ========================================

const DYNAMIC_VOLUME_MAP = {
    'pp':  0.2,
    'p':   0.35,
    'mp':  0.5,
    'mf':  0.65,
    'f':   0.8,
    'ff':  1.0
};

// ========================================
// Compiler
// ========================================

class UzumeCompiler {
    constructor() {
        this.settings = {
            tempo: 120,
            beat: [4, 4],
            volume: 80,
            wave: 'sine',
            scale: null,  // P3-7
            root:  'C'    // P3-7
        };
        this.measures = new Map();
        this.measureSettings = new Map();
        this.measureDynamic = new Map(); // P2-5: .cre/.dec/.arpeggio
        this.tracks = new Map();
        this.customChords = {}; // P3-8
        this.tuplets = new Map(); // P3-6
        this.audioEngine = new UzumeAudioEngine();
    }

    async compile(source) {
        const parser = new UzumeParser();
        const ast = parser.parse(source);

        // カスタムコードをコンパイラに引き継ぐ
        this.customChords = parser.customChords;

        const hasTrackcs = ast.statements.some(stmt => stmt instanceof TrackDefinition);
        if (hasTrackcs) {
            return await this.compileMultitrack(ast);
        } else {
            return await this.compileSingleTrack(ast);
        }
    }

    async compileSingleTrack(ast) {
        // First pass: collect settings and definitions
        const addDirectives = []; // AddStatement を一時保存
        for (const stmt of ast.statements) {
            if (stmt instanceof SetStatement) {
                this.applySetStatement(stmt);
            } else if (stmt instanceof MeasureDefinition) {
                this.measures.set(stmt.name, stmt.notes);
                this.measureSettings.set(stmt.name, { ...this.settings });
                this.measureDynamic.set(stmt.name, stmt.dynamic);
            } else if (stmt instanceof CustomChordDefinition) {
                // P3-8: カスタムコードをコンパイラローカル辞書に登録
                // (グローバル CHORD_DEFINITIONS は破壊しない — 再コンパイル時の汚染を防ぐ)
                this.customChords[stmt.name] = stmt.pitches;
            } else if (stmt instanceof TupletDefinition) {
                // P3-6: 連符を登録
                if (stmt.name) {
                    this.tuplets.set(stmt.name, stmt);
                }
            } else if (stmt instanceof AddStatement) {
                addDirectives.push(stmt);
            }
        }

        // add stc/leg/acc/ten(target[idx]) の事後適用
        // 全小節定義が揃った後で適用するため、First pass の後で処理する。
        for (const dir of addDirectives) {
            if (!this.measures.has(dir.target)) {
                console.warn(`add: measure '${dir.target}' not found`);
                continue;
            }
            const notes = this.measures.get(dir.target);
            if (dir.index === null) {
                // インデックス省略時は小節内の全音符に適用
                for (const n of notes) {
                    if (n instanceof Note || n instanceof ScaleDegreeNote) {
                        n.articulation = dir.articulation;
                    }
                }
            } else if (dir.index >= 0 && dir.index < notes.length) {
                const n = notes[dir.index];
                if (n instanceof Note || n instanceof ScaleDegreeNote) {
                    n.articulation = dir.articulation;
                } else {
                    console.warn(`add: ${dir.target}[${dir.index}] is not a note`);
                }
            } else {
                console.warn(`add: ${dir.target}[${dir.index}] out of range (len=${notes.length})`);
            }
        }

        // Second pass: generate audio
        const audioBuffers = [];
        for (const stmt of ast.statements) {
            if (stmt instanceof ReadStatement) {
                const buffer = await this.renderMeasures(stmt.measureNames);
                audioBuffers.push(buffer);
            } else if (stmt instanceof LoopStatement) {
                for (let i = 0; i < stmt.count; i++) {
                    for (const bodyStmt of stmt.body) {
                        if (bodyStmt instanceof ReadStatement) {
                            const buffer = await this.renderMeasures(bodyStmt.measureNames);
                            audioBuffers.push(buffer);
                        }
                    }
                }
            }
        }

        return this.combineBuffers(audioBuffers);
    }

    applySetStatement(stmt) {
        const key = stmt.setting;
        const val = stmt.value;
        if (key === 'scale') {
            // P3-7: set scale(major) or set scale(C, minor)
            if (Array.isArray(val)) {
                this.settings.root = val[0];
                this.settings.scale = val[1];
            } else {
                this.settings.scale = val;
            }
        } else {
            this.settings[key] = val;
        }
    }

    async compileMultitrack(ast) {
        const tracks = {};
        for (const stmt of ast.statements) {
            if (stmt instanceof SetStatement) {
                this.applySetStatement(stmt);
            } else if (stmt instanceof TrackDefinition) {
                const trackCompiler = new UzumeCompiler();
                trackCompiler.settings = { ...this.settings, ...stmt.settings };
                trackCompiler.customChords = { ...this.customChords };
                const trackProgram = new Program(stmt.statements);
                const trackBuffer = await trackCompiler.compileSingleTrack(trackProgram);
                tracks[stmt.name] = trackBuffer;
            }
        }
        return tracks;
    }

    async renderMeasures(measureNames) {
        if (measureNames.length === 1) {
            return await this.renderSingleMeasure(measureNames[0]);
        } else {
            const buffers = await Promise.all(
                measureNames.map(name => this.renderSingleMeasure(name))
            );
            return this.mixBuffers(buffers);
        }
    }

    async renderSingleMeasure(measureName) {
        // P3-6: 小節だけでなく連符変数も read() / 参照の対象になる
        if (!this.measures.has(measureName)) {
            if (this.tuplets.has(measureName)) {
                return await this.renderTuplet(this.tuplets.get(measureName), this.settings);
            }
            console.warn(`Measure ${measureName} not found`);
            return new Float32Array(0);
        }

        const notes = this.measures.get(measureName);
        const settings = this.measureSettings.get(measureName) || this.settings;
        const dynamic = this.measureDynamic.get(measureName) || null;

        const buffers = [];

        if (dynamic === '.arpeggio') {
            // P2-5: アルペジオ処理
            return await this.renderArpeggio(notes, settings);
        }

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            // P2-5: .cre/.dec によるvolume変化
            let noteSettings = settings;
            if (dynamic === '.cre' || dynamic === '.dec') {
                const ratio = notes.length > 1 ? i / (notes.length - 1) : 0;
                const crescFactor = dynamic === '.cre' ? ratio : (1 - ratio);
                // 0.4 ～ 1.2 の範囲でvolumeスケール
                const volScale = 0.4 + crescFactor * 0.8;
                noteSettings = { ...settings, volume: (settings.volume || 80) * volScale };
            }

            if (note instanceof Note) {
                buffers.push(await this.renderNote(note, noteSettings));
            } else if (note instanceof Rest) {
                buffers.push(await this.renderRest(note, noteSettings));
            } else if (note instanceof CodeChord) {
                buffers.push(await this.renderCodeChord(note, noteSettings));
            } else if (note instanceof Chord) {
                buffers.push(await this.renderChord(note, noteSettings));
            } else if (note instanceof MeasureReference) {
                buffers.push(await this.renderSingleMeasure(note.measureName));
            } else if (note instanceof ScaleDegreeNote) {
                buffers.push(await this.renderScaleDegreeNote(note, noteSettings));
            } else if (note instanceof TupletReference) {
                // P3-6: 小節内連符参照
                buffers.push(await this.renderTupletReference(note, noteSettings));
            }
        }

        return this.combineBuffers(buffers);
    }

    // P3-6: TupletReference を解決してレンダリング
    async renderTupletReference(ref, settings) {
        if (ref.inlineDef) {
            return await this.renderTuplet(ref.inlineDef, settings);
        }
        if (ref.name && this.tuplets.has(ref.name)) {
            return await this.renderTuplet(this.tuplets.get(ref.name), settings);
        }
        console.warn(`Tuplet ${ref.name} not found`);
        return new Float32Array(0);
    }

    // P3-6: 連符レンダリング
    // N個の音符を inBeats 拍の時間内に圧縮して演奏する。
    // 圧縮比 = inBeats / (各音符の書かれた音価の総和)
    async renderTuplet(tupletDef, settings) {
        const notes = tupletDef.notes || [];
        // 書かれた音価の総和を計算
        let writtenTotal = 0;
        for (const n of notes) {
            writtenTotal += this.noteDurationBeats(n);
        }
        const scale = writtenTotal > 0 ? (tupletDef.inBeats / writtenTotal) : 1;

        const buffers = [];
        for (const n of notes) {
            const scaled = this.scaleNoteDuration(n, scale);
            if (scaled instanceof Note) {
                buffers.push(await this.renderNote(scaled, settings));
            } else if (scaled instanceof Rest) {
                buffers.push(await this.renderRest(scaled, settings));
            } else if (scaled instanceof CodeChord) {
                buffers.push(await this.renderCodeChord(scaled, settings));
            } else if (scaled instanceof Chord) {
                buffers.push(await this.renderChord(scaled, settings));
            } else if (scaled instanceof ScaleDegreeNote) {
                buffers.push(await this.renderScaleDegreeNote(scaled, settings));
            } else if (scaled instanceof TupletReference) {
                buffers.push(await this.renderTupletReference(scaled, settings));
            }
        }
        return this.combineBuffers(buffers);
    }

    // ノートの拍数を取得 (連符圧縮計算用)
    noteDurationBeats(n) {
        if (n instanceof Note || n instanceof Rest ||
            n instanceof CodeChord || n instanceof ScaleDegreeNote) {
            return n.duration || 0;
        }
        if (n instanceof Chord) {
            // 和音は最初の音符の音価、なければ1
            return this.noteDurationBeats(n.notes[0]);
        }
        return 0;
    }

    // ノートの音価を scale 倍したコピーを返す (元ノードは非破壊)
    scaleNoteDuration(n, scale) {
        if (n instanceof Note) {
            return new Note(n.pitch, n.duration * scale, n.articulation, n.dynamic);
        }
        if (n instanceof Rest) {
            return new Rest(n.duration * scale);
        }
        if (n instanceof CodeChord) {
            return new CodeChord(n.chordName, n.duration * scale);
        }
        if (n instanceof ScaleDegreeNote) {
            return new ScaleDegreeNote(n.degree, n.octave, n.duration * scale, n.articulation, n.dynamic);
        }
        if (n instanceof Chord) {
            const notes = n.notes.map(child => this.scaleNoteDuration(child, scale));
            return new Chord(notes);
        }
        return n;
    }

    // P2-5: アルペジオレンダリング
    // 各コードノートを時間差で鳴らす
    async renderArpeggio(notes, settings) {
        const buffers = [];
        const arpDelay = 0.05; // 各音の遅延 (秒)

        for (const note of notes) {
            if (note instanceof CodeChord) {
                const chordNotes = this.lookupChord(note.chordName);
                if (!chordNotes) {
                    buffers.push(new Float32Array(0));
                    continue;
                }
                // 各音を時間差で並べる
                const tempo = settings.tempo || 120;
                const beatDuration = 60 / tempo;
                const totalDuration = note.duration * beatDuration;
                const delaySamples = Math.floor(arpDelay * this.audioEngine.sampleRate);
                const totalSamples = Math.floor(totalDuration * this.audioEngine.sampleRate);
                const result = new Float32Array(totalSamples + delaySamples * chordNotes.length);

                for (let j = 0; j < chordNotes.length; j++) {
                    const n = new Note(chordNotes[j], note.duration);
                    const noteBuf = await this.renderNote(n, settings);
                    const offset = j * delaySamples;
                    for (let k = 0; k < noteBuf.length && (k + offset) < result.length; k++) {
                        result[k + offset] += noteBuf[k] / chordNotes.length;
                    }
                }
                buffers.push(result);
            } else if (note instanceof Chord) {
                const delaySamples = Math.floor(arpDelay * this.audioEngine.sampleRate);
                const chordLen = note.notes.length;
                let maxLen = 0;
                const noteBuffers = await Promise.all(note.notes.map(n => this.renderNote(n, settings)));
                noteBuffers.forEach(b => { if (b.length > maxLen) maxLen = b.length; });
                const result = new Float32Array(maxLen + delaySamples * chordLen);

                for (let j = 0; j < noteBuffers.length; j++) {
                    const offset = j * delaySamples;
                    for (let k = 0; k < noteBuffers[j].length && (k + offset) < result.length; k++) {
                        result[k + offset] += noteBuffers[j][k] / chordLen;
                    }
                }
                buffers.push(result);
            } else if (note instanceof Note) {
                buffers.push(await this.renderNote(note, settings));
            } else if (note instanceof Rest) {
                buffers.push(await this.renderRest(note, settings));
            }
        }

        return this.combineBuffers(buffers);
    }

    async renderNote(note, settings) {
        const frequency = this.audioEngine.noteToFrequency(note.pitch);
        const tempo = settings.tempo || 120;
        const beatDuration = 60 / tempo;
        const durationInSeconds = note.duration * beatDuration;

        // P2-3: DYNAMIC によるvolume計算
        let volume = (settings.volume || 80) / 127;
        if (note.dynamic && DYNAMIC_VOLUME_MAP[note.dynamic] !== undefined) {
            volume = DYNAMIC_VOLUME_MAP[note.dynamic];
        }

        // P2-4: accent は音量を1.3倍
        if (note.articulation === 'acc') {
            volume = Math.min(1.0, volume * 1.3);
        }

        return this.audioEngine.generateWaveform(
            frequency,
            durationInSeconds,
            settings.wave || 'sine',
            volume,
            note.articulation // P2-4
        );
    }

    // P3-7: スケール度数ノートのレンダリング
    async renderScaleDegreeNote(note, settings) {
        const scaleName = settings.scale;
        const rootNote = settings.root || 'C';
        const scaleIntervals = SCALE_DEFINITIONS[scaleName] || SCALE_DEFINITIONS['major'];
        const pitch = this.audioEngine.scaleDegreeToNote(
            note.degree, note.octave, scaleIntervals, rootNote
        );
        const syntheticNote = new Note(pitch, note.duration, note.articulation, note.dynamic);
        return await this.renderNote(syntheticNote, settings);
    }

    async renderRest(rest, settings) {
        const tempo = settings.tempo || 120;
        const beatDuration = 60 / tempo;
        const durationInSeconds = rest.duration * beatDuration;
        const samples = Math.floor(durationInSeconds * this.audioEngine.sampleRate);
        return new Float32Array(samples);
    }

    async renderCodeChord(codeChord, settings) {
        const chordNotes = this.lookupChord(codeChord.chordName);
        if (!chordNotes) {
            console.warn(`Chord ${codeChord.chordName} not found`);
            return new Float32Array(0);
        }

        const noteObjects = chordNotes.map(pitch => new Note(pitch, codeChord.duration));
        const chord = new Chord(noteObjects);
        return await this.renderChord(chord, settings);
    }

    // コード名 → 構成音。カスタム定義をビルトインより優先する。
    // (グローバル CHORD_DEFINITIONS は変更せず、コンパイラローカルで解決する)
    lookupChord(name) {
        if (Object.prototype.hasOwnProperty.call(this.customChords, name)) {
            return this.customChords[name];
        }
        return CHORD_DEFINITIONS[name];
    }

    async renderChord(chord, settings) {
        const buffers = await Promise.all(
            chord.notes.map(note => {
                if (note instanceof Note) return this.renderNote(note, settings);
                if (note instanceof ScaleDegreeNote) return this.renderScaleDegreeNote(note, settings);
                return Promise.resolve(new Float32Array(0));
            })
        );
        return this.mixBuffers(buffers);
    }

    combineBuffers(buffers) {
        if (buffers.length === 0) return new Float32Array(0);
        const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    }

    mixBuffers(buffers) {
        if (buffers.length === 0) return new Float32Array(0);
        const maxLength = Math.max(...buffers.map(b => b.length));
        const result = new Float32Array(maxLength);
        for (const buffer of buffers) {
            for (let i = 0; i < buffer.length; i++) {
                result[i] += buffer[i] / buffers.length;
            }
        }
        return result;
    }

    async play(audioData) {
        this.stop();
        if (typeof audioData === 'object' && !(audioData instanceof Float32Array)) {
            const promises = Object.values(audioData).map(buffer =>
                this.audioEngine.playBuffer(buffer)
            );
            await Promise.all(promises);
        } else {
            await this.audioEngine.playBuffer(audioData);
        }
    }

    stop() {
        this.audioEngine.stopAllSources();
    }
}

// ========================================
// Browser Integration
// ========================================

if (typeof window !== 'undefined') {
    window.UzumeCompiler = UzumeCompiler;
    window.UzumeParser = UzumeParser;
    window.UzumeAudioEngine = UzumeAudioEngine;
    window.CHORD_DEFINITIONS = CHORD_DEFINITIONS;
    window.SCALE_DEFINITIONS = SCALE_DEFINITIONS;
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UzumeCompiler,
        UzumeParser,
        UzumeAudioEngine,
        CHORD_DEFINITIONS,
        SCALE_DEFINITIONS
    };
}

// CELLWATCH: module exports; upstream source otherwise unchanged.
export { UzumeCompiler, UzumeParser, UzumeAudioEngine };
