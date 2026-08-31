
/**
 * @fileoverview App.tsx
 * 
 * 游戏的主要应用入口与 UI 叠加层控制器。
 * 负责管理整个游戏的全局状态生命周期 (MainMenu -> Cinematic -> Playing -> GameOver 等)，
 * 并按需加载底层的 GameCanvas 渲染引擎引擎。在这个层级并不处理任何 Canvas 的物理模拟计算，
 * 仅负责 React 侧的 HUD 渲染、关卡路由以及得分与隐藏秘籍的监听。
 */

import React, { useState, useEffect, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameStatus, GameState } from './types';
import { levels } from './levels';
import { Heart, Coins, Trophy, Skull, Star, Trees, Zap, Sparkles, Crown, Mountain, Home, Play, Map, Gamepad2, Move, Target, ArrowUpFromLine } from 'lucide-react';
import { MAX_HEALTH, REVIVE_COST } from './constants';
import { audio } from './audio';

/**
 * 初始化游戏状态，用于启动及重置
 */
const INITIAL_STATE: GameState = {
  status: GameStatus.MENU,
  currentLevelId: 1,
  score: 0,
  lives: MAX_HEALTH, 
  maxLives: MAX_HEALTH, // New dynamic max health state
  coinsCollected: 0,
};

// --- CINEMATIC COMPONENT ---
/**
 * 代表一个过场动画场景的结构
 */
interface Scene {
  text: string;
  subText?: string;
  icon: React.ReactNode;
  bgColor: string;
  duration: number; // 持续时间，单位毫秒 (ms)
}

const INTRO_SCENES: Scene[] = [
  {
    text: "很久很久以前...",
    subText: "在低语森林的深处，住着一只平凡的小熊。",
    icon: <Trees className="w-32 h-32 text-green-400 animate-pulse" />,
    bgColor: "bg-green-900",
    duration: 4000
  },
  {
    text: "突然!",
    subText: "一道神秘的光束从天而降!",
    icon: <Zap className="w-32 h-32 text-yellow-300 animate-bounce" />,
    bgColor: "bg-yellow-900",
    duration: 3000
  },
  {
    text: "神奇的力量涌入体内...",
    subText: "小熊感觉自己充满了勇气!",
    icon: <Sparkles className="w-32 h-32 text-red-400 animate-spin-slow" />,
    bgColor: "bg-red-900",
    duration: 4000
  },
  {
    text: "冒险开始了!",
    subText: "它被传送到了一个未知的世界...",
    icon: <div className="text-6xl animate-ping">🌀</div>,
    bgColor: "bg-blue-900",
    duration: 3000
  }
];

const OUTRO_SCENES: Scene[] = [
  {
    text: "邪恶被击败了!",
    subText: "所有的障碍都无法阻挡你的脚步。",
    icon: <Trophy className="w-32 h-32 text-yellow-400 animate-bounce" />,
    bgColor: "bg-purple-900",
    duration: 4000
  },
  {
    text: "传说诞生了",
    subText: "小熊站在了世界的顶端。",
    icon: <Mountain className="w-32 h-32 text-gray-300" />,
    bgColor: "bg-blue-800",
    duration: 4000
  },
  {
    text: "你是真正的英雄!",
    subText: "感谢你拯救了这个世界。",
    icon: <Crown className="w-32 h-32 text-yellow-300 animate-pulse" />,
    bgColor: "bg-yellow-800",
    duration: 5000
  }
];

const HIDDEN_OUTRO_SCENES: Scene[] = [
    {
      text: "终于...",
      subText: "漫长的旅程结束了。",
      icon: <Mountain className="w-32 h-32 text-blue-200" />,
      bgColor: "bg-sky-900",
      duration: 3000
    },
    {
      text: "家人的温暖",
      subText: "比任何宝藏都珍贵。",
      icon: <Heart className="w-32 h-32 text-pink-400 animate-pulse" />,
      bgColor: "bg-pink-900",
      duration: 4000
    },
    {
      text: "欢迎回家",
      subText: "小熊大冒险 - 完美落幕",
      icon: <Home className="w-32 h-32 text-yellow-300 animate-bounce" />,
      bgColor: "bg-indigo-900",
      duration: 6000
    }
  ];

/**
 * 剧情动画过场视图组件 (CinematicView)
 * 遍历并序列化地播放给定的 Scene 集合。支持用户通过点击屏幕或等待定时器跳过。
 */
const CinematicView: React.FC<{ scenes: Scene[], onComplete: () => void }> = ({ scenes, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    // Play transition sound on scene change
    if (currentIndex > 0) audio.playCoin(); 
    
    setFadeIn(true);
    const timer = setTimeout(() => {
      setFadeIn(false); // Start fade out
      setTimeout(() => {
        if (currentIndex < scenes.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          onComplete();
        }
      }, 500); // Wait for fade out animation
    }, scenes[currentIndex].duration);

    return () => clearTimeout(timer);
  }, [currentIndex, scenes, onComplete]);

  const scene = scenes[currentIndex];

  return (
    <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center text-center p-8 transition-colors duration-1000 ${scene.bgColor}`}>
      <div className={`transition-opacity duration-500 transform ${fadeIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="mb-8 flex justify-center drop-shadow-2xl">
          {scene.icon}
        </div>
        <h2 className="pixel-font text-3xl md:text-4xl text-white mb-4 drop-shadow-md leading-relaxed">
          {scene.text}
        </h2>
        {scene.subText && (
          <p className="text-white/80 text-lg pixel-font">
            {scene.subText}
          </p>
        )}
      </div>
      <div className="absolute bottom-8 right-8 text-white/30 text-xs animate-pulse">
        点击跳过 &gt;&gt;
      </div>
      {/* Invisible overlay to skip on click */}
      <div className="absolute inset-0 cursor-pointer" onClick={onComplete}></div>
    </div>
  );
};

// --- MAIN APP ---

/**
 * 游戏根组件
 * 包含所有视图状态机以及顶部 HUD / UI。
 */
const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [highScore, setHighScore] = useState(0);
  const [gameSessionId, setGameSessionId] = useState(0); // Used to force component remount
  const cheatBufferRef = useRef("");

  useEffect(() => {
    const saved = localStorage.getItem('bear_adventure_highscore');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) setHighScore(parsed);
    }
  }, []);

  useEffect(() => {
    if (gameState.score > highScore) {
      setHighScore(gameState.score);
      localStorage.setItem('bear_adventure_highscore', gameState.score.toString());
    }
  }, [gameState.score, highScore]);

  // KEYBOARD & SECRET CODE LISTENER
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              if (gameState.status === GameStatus.PLAYING) {
                  setGameState(prev => ({ ...prev, status: GameStatus.PAUSED }));
                  audio.pause();
              } else if (gameState.status === GameStatus.PAUSED) {
                  setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
                  audio.resume();
              }
          }

          if (gameState.status === GameStatus.CREDITS) {
              const newBuffer = (cheatBufferRef.current + e.key).slice(-8);
              cheatBufferRef.current = newBuffer;
              
              if (newBuffer === "20181018") {
                  audio.playPowerUp();
                  cheatBufferRef.current = "";
                  startGame(999); 
              }
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.status]);

  // PAUSE ON BLUR
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && gameState.status === GameStatus.PLAYING) {
        setGameState(prev => ({ ...prev, status: GameStatus.PAUSED }));
        audio.pause();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [gameState.status]);

  const startGame = (levelId: number = 1) => {
    audio.init(); 
    setGameSessionId(prev => prev + 1); 
    
    cheatBufferRef.current = "";

    // Only play intro for the first level
    if (levelId === 1) {
        setGameState({
            ...INITIAL_STATE,
            status: GameStatus.INTRO,
            currentLevelId: levelId
        });
        // Play mystery music for intro
        audio.startBGM('SPACE'); 
    } else {
        setGameState({
            ...INITIAL_STATE,
            status: GameStatus.PLAYING,
            currentLevelId: levelId
        });
        // GameCanvas will handle BGM initialization for the specific level
    }
  };

  const handleCinematicComplete = () => {
    if (gameState.status === GameStatus.INTRO) {
      setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
      // Music will be handled by GameCanvas mounting
    } else if (gameState.status === GameStatus.OUTRO) {
      setGameState(prev => ({ ...prev, status: GameStatus.CREDITS }));
      audio.startBGM('CREDITS'); // Special Cheerful 'YouYou' Theme
    } else if (gameState.status === GameStatus.HIDDEN_OUTRO) {
      setGameState(prev => ({ ...prev, status: GameStatus.CREDITS }));
      audio.startBGM('CREDITS');
    }
  };

  const handleLevelComplete = () => {
    // Hidden Level Check
    if (gameState.currentLevelId === 999) {
        setGameState(prev => ({ ...prev, status: GameStatus.HIDDEN_OUTRO }));
        audio.playWin();
        return;
    }

    // Normal Progression
    if (gameState.currentLevelId >= levels.length - 1) { // -1 because hidden level is in array
       setGameState(prev => ({ ...prev, status: GameStatus.OUTRO }));
       audio.playWin();
    } else {
       setGameState(prev => ({ ...prev, status: GameStatus.LEVEL_COMPLETE }));
    }
  };

  const handleNextLevel = () => {
    setGameState(prev => ({
      ...prev,
      status: GameStatus.PLAYING,
      currentLevelId: prev.currentLevelId + 1
    }));
  };

  const handlePlayerHit = () => {
     setGameState(prev => {
        const newLives = prev.lives - 1;
        if (newLives <= 0) {
            return { ...prev, lives: 0, status: GameStatus.REVIVE_PROMPT };
        }
        return { ...prev, lives: newLives };
     });
  };

  const handleRevive = () => {
    if (gameState.coinsCollected >= REVIVE_COST) {
        setGameState(prev => ({
            ...prev,
            lives: prev.maxLives, 
            coinsCollected: prev.coinsCollected - REVIVE_COST,
            status: GameStatus.PLAYING
        }));
    }
  };

  const handleGiveUp = () => {
    setGameState(prev => ({ ...prev, status: GameStatus.GAME_OVER }));
  };

  const currentLevel = levels.find(l => l.id === gameState.currentLevelId);

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-4 font-sans select-none text-white">
      
      {/* Header / HUD */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-4 px-4 py-2 bg-zinc-800/80 backdrop-blur rounded-xl border-2 border-zinc-700 shadow-lg z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-red-400">
            {/* Dynamic Heart Rendering */}
            {Array.from({ length: gameState.maxLives }).map((_, i) => (
                <Heart 
                    key={i} 
                    className={`w-6 h-6 ${i < gameState.lives ? 'fill-current text-red-500' : 'text-red-900/50 fill-none'}`} 
                />
            ))}
          </div>
          <div className="flex items-center gap-2 text-yellow-400">
            <Coins className="w-6 h-6 fill-current" />
            <span className="pixel-font text-xl">{gameState.coinsCollected}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
            {/* Bilingual Level Name */}
            <span className="text-[10px] md:text-xs text-gray-400 font-bold tracking-widest uppercase">{currentLevel?.name || "ADVENTURE"}</span>
            <span className="text-xs md:text-sm text-yellow-400 pixel-font tracking-wide">{currentLevel?.nameCn || "冒险模式"}</span>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">分数 (SCORE)</span>
          <span className="pixel-font text-xl text-white">{gameState.score.toString().padStart(6, '0')}</span>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="relative group w-full max-w-[800px] h-[450px] bg-black rounded-lg shadow-2xl overflow-hidden border-4 border-gray-700">
        
        {/* Render Game Canvas */}
        {/* Only render game canvas if playing or complete/gameover overlay is on top, NOT during cinematic to save resources */}
        {gameState.status !== GameStatus.MENU && gameState.status !== GameStatus.INTRO && gameState.status !== GameStatus.OUTRO && gameState.status !== GameStatus.HIDDEN_OUTRO && gameState.status !== GameStatus.CREDITS && (
            <GameCanvas 
            key={`${gameState.currentLevelId}-${gameSessionId}`} 
            levelId={gameState.currentLevelId}
            gameState={gameState}
            setGameState={setGameState}
            onLevelComplete={handleLevelComplete}
            onPlayerHit={handlePlayerHit}
            onGameOver={() => setGameState(prev => ({ ...prev, lives: 0, status: GameStatus.REVIVE_PROMPT }))} 
            />
        )}

        {/* OVERLAYS */}
        
        {/* CINEMATICS */}
        {gameState.status === GameStatus.INTRO && (
            <CinematicView scenes={INTRO_SCENES} onComplete={handleCinematicComplete} />
        )}
        
        {gameState.status === GameStatus.OUTRO && (
            <CinematicView scenes={OUTRO_SCENES} onComplete={handleCinematicComplete} />
        )}
        
        {gameState.status === GameStatus.HIDDEN_OUTRO && (
            <CinematicView scenes={HIDDEN_OUTRO_SCENES} onComplete={handleCinematicComplete} />
        )}

        {/* MENU - REDESIGNED */}
        {gameState.status === GameStatus.MENU && (
          <div className="absolute inset-0 flex flex-col justify-between items-center z-10 menu-bg overflow-hidden">
            <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>

            {/* --- TOP SECTION: TITLE LOGO --- */}
            <div className="relative z-20 mt-16 flex flex-col items-center">
                <div className="relative group cursor-default">
                    {/* Main Title - Clean, Bold, International Style */}
                    <h1 className="pixel-font text-6xl md:text-8xl font-black text-white drop-shadow-[0_6px_0_rgba(0,0,0,1)] tracking-tighter">
                        小熊大冒险
                    </h1>
                    {/* Subtitle */}
                    <div className="mt-4 text-center">
                        <span className="pixel-font text-[10px] md:text-xs text-yellow-300 tracking-[0.6em] font-bold uppercase drop-shadow-md">
                            Little Bear's Adventure
                        </span>
                    </div>
                </div>
            </div>

            {/* --- MIDDLE SECTION: SPACER --- */}
            <div className="flex-grow"></div>

            {/* --- BOTTOM SECTION: ACTIONS --- */}
            <div className="relative z-20 w-full max-w-md px-6 pb-8 flex flex-col items-center gap-6">
                
                {/* Main Play Button */}
                <button 
                    onClick={() => startGame(1)}
                    className="group relative w-full max-w-[280px] h-16 transition-all hover:scale-105 active:scale-95"
                >
                    {/* Button Shadow */}
                    <div className="absolute inset-0 bg-yellow-700 rounded-full translate-y-1"></div>
                    {/* Button Face */}
                    <div className="relative h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full border-2 border-yellow-300 flex items-center justify-center gap-3 shadow-xl">
                        <Play className="w-6 h-6 text-yellow-900 fill-current" />
                        <span className="pixel-font text-2xl text-yellow-900 tracking-widest font-bold">开始游戏</span>
                    </div>
                </button>

                {/* Level Selection Panel */}
                <div className="w-full bg-black/70 backdrop-blur-sm p-4 rounded-xl border border-white/10 shadow-2xl">
                    <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2 text-gray-300">
                            <Map className="w-4 h-4 text-yellow-500" />
                            <span className="text-xs font-bold">章节选择</span>
                        </div>
                        <span className="text-[10px] text-gray-500">SELECT CHAPTER</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                        {levels.filter(l => l.id !== 999).map((level) => (
                        <button 
                            key={level.id}
                            onClick={() => startGame(level.id)}
                            className="group relative h-10 overflow-hidden rounded bg-white/10 hover:bg-yellow-500 hover:text-black border border-white/20 transition-all flex items-center justify-center"
                        >
                            <span className="pixel-font text-sm font-bold group-hover:scale-110 transition-transform">{level.id}</span>
                        </button>
                        ))}
                        
                        {/* Hidden Level Hint Placeholder */}
                        <div className="h-10 rounded border-2 border-dashed border-white/10 flex items-center justify-center cursor-not-allowed group" title="???">
                            <span className="pixel-font text-xs text-white/20 group-hover:text-white/40 transition-colors">?</span>
                        </div>
                    </div>
                </div>
                
                {/* Footer Controls Info - CHINESE */}
                <div className="flex gap-4 text-[10px] text-gray-300 font-bold bg-black/60 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                    <div className="flex items-center gap-1">
                        <Move className="w-3 h-3 text-yellow-400" /> 
                        <span>移动: 方向键</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <ArrowUpFromLine className="w-3 h-3 text-green-400" />
                        <span>跳跃: 空格</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Target className="w-3 h-3 text-red-400" />
                        <span>攻击: F</span>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* GAME PAUSED */}
        {gameState.status === GameStatus.PAUSED && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center rounded-lg z-20">
             <h2 className="pixel-font text-4xl text-white mb-6">游戏暂停</h2>
             <button 
                  onClick={() => {
                      setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
                      audio.resume();
                  }}
                  className="bg-white text-black hover:bg-gray-200 border-b-4 border-gray-400 font-bold py-3 px-8 rounded-lg pixel-font"
                >
                  继续游戏
             </button>
             <p className="text-white/50 text-xs mt-4">或按 ESC 键继续</p>
          </div>
        )}

        {/* REVIVE PROMPT */}
        {gameState.status === GameStatus.REVIVE_PROMPT && (
          <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-center rounded-lg z-10">
             <Heart className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
             <h2 className="pixel-font text-3xl text-white mb-4">你受伤了!</h2>
             <p className="text-white/80 mb-6">生命值已耗尽。</p>
             
             <div className="flex flex-col gap-4 w-64">
                <button 
                  onClick={handleRevive}
                  disabled={gameState.coinsCollected < REVIVE_COST}
                  className={`border-b-4 font-bold py-3 px-4 rounded-lg pixel-font transition-all ${
                    gameState.coinsCollected >= REVIVE_COST 
                    ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-300 border-yellow-600 cursor-pointer' 
                    : 'bg-gray-600 text-gray-400 border-gray-700 cursor-not-allowed opacity-50'
                  }`}
                >
                  原地复活 ({REVIVE_COST} 金币)
                </button>
                
                <button 
                  onClick={handleGiveUp}
                  className="bg-transparent border-2 border-white/20 text-white hover:bg-white/10 font-bold py-2 px-4 rounded-lg pixel-font text-sm"
                >
                  放弃 (重新开始)
                </button>
             </div>
             
             {gameState.coinsCollected < REVIVE_COST && (
                <p className="text-red-300 text-xs mt-2">金币不足!</p>
             )}
          </div>
        )}

        {/* GAME OVER */}
        {gameState.status === GameStatus.GAME_OVER && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-center rounded-lg z-10">
             <Skull className="w-16 h-16 text-gray-400 mb-4" />
             <h2 className="pixel-font text-4xl text-white mb-2">游戏结束</h2>
             <p className="text-white/80 mb-6">本次收集金币: {gameState.coinsCollected}</p>
             <button 
                  onClick={() => setGameState(INITIAL_STATE)}
                  className="bg-white text-black hover:bg-gray-200 border-b-4 border-gray-400 font-bold py-3 px-8 rounded-lg pixel-font"
                >
                  返回标题
             </button>
          </div>
        )}

        {/* LEVEL COMPLETE */}
        {gameState.status === GameStatus.LEVEL_COMPLETE && (
          <div className="absolute inset-0 bg-blue-900/90 flex flex-col items-center justify-center text-center rounded-lg z-10">
             <Trophy className="w-16 h-16 text-yellow-400 mb-4 animate-pulse" />
             <h2 className="pixel-font text-4xl text-white mb-2">关卡完成!</h2>
             <p className="text-white/80 mb-6">准备好迎接下一个挑战了吗?</p>
             <button 
                  onClick={handleNextLevel}
                  className="bg-yellow-400 text-yellow-900 hover:bg-yellow-300 border-b-4 border-yellow-600 font-bold py-3 px-8 rounded-lg pixel-font"
                >
                  下一关
             </button>
          </div>
        )}

        {/* CREDITS */}
        {gameState.status === GameStatus.CREDITS && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-center rounded-lg z-20 animate-fade-in">
             <Star className="w-16 h-16 text-yellow-300 mb-6 animate-spin-slow" />
             
             <h2 className="pixel-font text-2xl text-white mb-8">THE END</h2>
             
             <div className="space-y-6 mb-12">
                 <div>
                    <p className="text-gray-400 text-sm mb-1">感谢制作者</p>
                    <p className="text-xl font-bold text-white">Gemini AI</p>
                 </div>
                 
                 <div>
                    <p className="text-gray-400 text-sm mb-1">特别鸣谢</p>
                    <p className="text-2xl font-bold text-pink-400 pixel-font">右右小朋友</p>
                 </div>
                 
                 <div className="mt-4">
                    <p className="text-gray-500 text-xs">最终得分: {gameState.score}</p>
                 </div>
             </div>

             <button 
                  onClick={() => setGameState(INITIAL_STATE)}
                  className="bg-white text-black hover:bg-gray-200 border-b-4 border-gray-400 font-bold py-3 px-8 rounded-lg pixel-font"
                >
                  回到主菜单
             </button>
          </div>
        )}

      </div>
      
      <div className="mt-4 text-gray-500 text-xs">
         最高分: {highScore}
      </div>
    </div>
  );
};

export default App;
