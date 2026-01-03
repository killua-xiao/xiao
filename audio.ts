
/**
 * 音频控制器
 * 使用 Web Audio API 生成简单的波形声音，无需加载外部MP3文件。
 * 包含背景音乐(BGM)音序器和音效生成器。
 */
class AudioController {
  ctx: AudioContext | null = null;
  bgmNodes: { osc: OscillatorNode, gain: GainNode }[] = [];
  isMuted: boolean = false;
  isPlayingBGM: boolean = false;
  bgmInterval: number | null = null;

  // 初始化音频上下文（通常需要用户交互触发）
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * 播放单音
   * @param freq 频率 (Hz)
   * @param type 波形类型 ('sine', 'square', 'sawtooth', 'triangle')
   * @param duration 持续时间 (秒)
   * @param vol 音量 (0-1)
   * @param slideTo 滑音目标频率 (可选)
   */
  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1, slideTo: number | null = null) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    // 如果有滑音效果
    if (slideTo) {
      osc.frequency.linearRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    }

    // 设置音量包络 (Attack/Release)
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // --- 游戏音效 ---

  playJump() {
    this.playTone(150, 'square', 0.1, 0.1, 300); // 类似马里奥的跳跃音效
  }

  playShoot() {
    this.playTone(800, 'sawtooth', 0.1, 0.05, 100); // 类似激光/射击
  }

  playDig() {
    // 挖掘音效：先低沉后轻
    this.playTone(100, 'square', 0.1, 0.2, 50);
    setTimeout(() => this.playTone(80, 'sawtooth', 0.1, 0.1), 50);
  }

  playCoin() {
    if (!this.ctx || this.isMuted) return;
    // 经典的双音硬币声 (B5 -> E6)
    this.playTone(987, 'sine', 0.1, 0.1); 
    setTimeout(() => this.playTone(1318, 'sine', 0.2, 0.1), 100); 
  }

  playKill() {
    this.playTone(100, 'square', 0.1, 0.1, 50); // 踩扁敌人的低频声
  }

  playDamage() {
    this.playTone(200, 'sawtooth', 0.3, 0.1, 50); // 受伤时的刺耳声
  }

  playPowerUp() {
    // 吃到道具的上升滑音
    this.playTone(300, 'sine', 0.4, 0.2, 800);
    setTimeout(() => this.playTone(400, 'square', 0.4, 0.1, 900), 100);
  }

  playHeal() {
    // 治愈的琶音
    if (!this.ctx || this.isMuted) return;
    [440, 554, 659].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 'sine', 0.3, 0.1), i * 100);
    });
  }

  playRoar() {
    this.playTone(150, 'sawtooth', 0.4, 0.15, 50); // 怪物低吼
  }

  playWin() {
    if (!this.ctx || this.isMuted) return;
    // 胜利旋律
    [523, 659, 783, 1046].forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 'square', 0.2, 0.1), i * 150);
    });
  }

  // --- 背景音乐 (BGM) 序列器 ---
  startBGM(type: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' = 'NORMAL') {
    this.stopBGM();
    
    if (!this.ctx || this.isMuted) return;
    this.isPlayingBGM = true;
    
    let beat = 0;
    let sequence: number[] = [];
    let speed = 250;
    
    // 根据关卡类型定义不同的旋律序列
    if (type === 'CAVE') {
        sequence = [73, 0, 87, 0, 110, 0, 146, 0, 110, 0, 87, 0]; 
        speed = 400; 
    } else if (type === 'TOMB') {
        sequence = [65, 0, 69, 0, 65, 0, 61, 0, 73, 0, 61, 0]; 
        speed = 350;
    } else if (type === 'SPACE') {
        // 科幻琶音
        sequence = [220, 261, 329, 392, 329, 261, 220, 196];
        speed = 200;
    } else if (type === 'CREDITS') {
        // 欢快的C大调结尾曲 ("You-You" Theme)
        sequence = [523, 392, 330, 261, 330, 392, 523, 523, 0, 523, 392, 330];
        speed = 180; // 更快，更活力
    } else {
        // 默认欢快旋律
        sequence = [110, 0, 110, 0, 130, 0, 146, 130];
        speed = 250;
    }
    
    // 设置循环计时器
    this.bgmInterval = window.setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const freq = sequence[beat % sequence.length];
        if (freq > 0) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            // 根据风格选择波形
            osc.type = type === 'TOMB' ? 'sawtooth' : (type === 'SPACE' || type === 'CAVE' ? 'sine' : type === 'CREDITS' ? 'triangle' : 'triangle');
            
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            // 古墓增加失真感
            if (type === 'TOMB') {
                osc.detune.setValueAtTime(Math.random() * 50 - 25, this.ctx.currentTime);
            }
            // 太空增加颤音
            if (type === 'SPACE') {
                const vibrato = this.ctx.createOscillator();
                const vibratoGain = this.ctx.createGain();
                vibrato.frequency.value = 5;
                vibratoGain.gain.value = 10;
                vibrato.connect(vibratoGain);
                vibratoGain.connect(osc.frequency);
                vibrato.start();
                vibrato.stop(this.ctx.currentTime + 0.5);
            }

            // 音量与衰减控制
            const volume = type === 'CREDITS' ? 0.08 : (type === 'TOMB' ? 0.1 : 0.05);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            
            const release = type === 'CAVE' || type === 'SPACE' ? 0.8 : 0.2;
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + release);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + release);
        }
        beat++;
    }, speed);
  }

  stopBGM() {
    this.isPlayingBGM = false;
    if (this.bgmInterval) {
        clearInterval(this.bgmInterval);
        this.bgmInterval = null;
    }
  }
}

export const audio = new AudioController();
