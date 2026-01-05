
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, TILE_SIZE, COLORS, PLAYER_WIDTH, PLAYER_HEIGHT, 
  MOVE_SPEED, JUMP_FORCE, TERMINAL_VELOCITY, PROJECTILE_SPEED, PROJECTILE_SIZE, SHOOT_COOLDOWN, 
  WINE_DURATION, WINE_SPEED_MULTIPLIER, WINE_JUMP_MULTIPLIER,
  ACCELERATION, FRICTION, AIR_FRICTION, COYOTE_TIME, JUMP_BUFFER,
  SWIM_SPEED, WATER_FRICTION, MELEE_RANGE, MELEE_DURATION, MELEE_COOLDOWN
} from '../constants';
import { Entity, Player, EntityType, GameStatus, GameState, EnemyVariant } from '../types';
import { levels } from '../levels';
import { audio } from '../audio';
import { ArrowLeft, ArrowRight, ArrowUp, Crosshair, Gamepad2 } from 'lucide-react';

// --- 接口定义 ---
interface GameCanvasProps {
  levelId: number;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onLevelComplete: () => void;
  onPlayerHit: () => void;
  onGameOver: () => void;
}

// 视觉效果接口
interface Cloud { x: number; y: number; speed: number; size: number; }
interface Tree { x: number; y: number; width: number; height: number; color: string; }
interface Planet { 
    x: number; y: number; size: number; 
    color: string; type: 'RING' | 'GAS' | 'CRATER' | 'SOLID'; 
    speed: number; 
}
interface CaveSpike { x: number; height: number; type: 'CEILING' | 'FLOOR'; width: number; }

// --- 对象池优化：粒子系统 ---
interface Particle { 
    active: boolean;
    x: number; y: number; speedX: number; speedY: number; 
    size: number; life: number; color?: string; alpha?: number;
    isScreenSpace?: boolean; // 新增：标记粒子是否在屏幕空间（用于雨雪）
}
const MAX_PARTICLES = 300;

export const GameCanvas: React.FC<GameCanvasProps> = ({ levelId, gameState, setGameState, onLevelComplete, onPlayerHit, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null); // 离屏背景画布
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null); // 离屏光照画布
  const requestRef = useRef<number>(0);
  
  // --- 游戏状态 Refs ---
  const levelRef = useRef(levels.find(l => l.id === levelId) || levels[0]);
  const activeCheckpointRef = useRef<Entity | null>(null); // 当前存档点
  
  // 玩家初始状态
  const playerRef = useRef<Player>({
    id: 'hero',
    type: EntityType.PLAYER,
    pos: { ...levelRef.current.spawnPoint },
    size: { x: PLAYER_WIDTH, y: PLAYER_HEIGHT },
    vel: { x: 0, y: 0 },
    isGrounded: false,
    facingRight: true,
    isInvulnerable: false,
    invulnerableTimer: 0,
    shootCooldown: 0,
    drunkTimer: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    isAttacking: false,
    attackTimer: 0,
    renderScale: { x: 1, y: 1 },
    animFrame: 0,
    animTimer: 0
  });

  const entitiesRef = useRef<Entity[]>(JSON.parse(JSON.stringify(levelRef.current.entities)));
  const bulletsRef = useRef<Entity[]>([]); 
  const cameraRef = useRef({ x: 0, y: 0, shake: 0, lookAheadOffset: 0 }); 
  const keysRef = useRef<{ [key: string]: boolean }>({}); 
  const timeRef = useRef<number>(0); 
  
  // --- 新增：游戏手感优化 Refs ---
  const hitStopRef = useRef<number>(0); // 顿帧计时器
  const gamePadIndexRef = useRef<number | null>(null); // 手柄索引
  const particlePoolRef = useRef<Particle[]>(
      new Array(MAX_PARTICLES).fill(null).map(() => ({ 
          active: false, x: 0, y: 0, speedX: 0, speedY: 0, size: 0, life: 0 
      }))
  );

  // --- 环境与装饰 Refs ---
  const cloudsRef = useRef<Cloud[]>([]);
  const treesRef = useRef<Tree[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const caveSpikesRef = useRef<CaveSpike[]>([]); 

  // --- 粒子系统方法 ---
  const spawnParticle = (opts: Partial<Omit<Particle, 'active'>>) => {
      const pool = particlePoolRef.current;
      for (let i = 0; i < pool.length; i++) {
          if (!pool[i].active) {
              pool[i] = { 
                  active: true, 
                  x: opts.x || 0, 
                  y: opts.y || 0, 
                  speedX: opts.speedX || 0, 
                  speedY: opts.speedY || 0, 
                  size: opts.size || 2, 
                  life: opts.life || 1, 
                  color: opts.color, 
                  alpha: opts.alpha,
                  isScreenSpace: opts.isScreenSpace || false
              };
              return;
          }
      }
  };

  // --- 挤压与拉伸助手 ---
  const squashAndStretch = (scaleX: number, scaleY: number) => {
      playerRef.current.renderScale.x = scaleX;
      playerRef.current.renderScale.y = scaleY;
  };

  // --- 手柄检测 ---
  const pollGamepad = () => {
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    if (gamePadIndexRef.current === null) {
        for (const gp of gamepads) {
            if (gp && gp.connected) {
                gamePadIndexRef.current = gp.index;
                break;
            }
        }
    }

    if (gamePadIndexRef.current !== null) {
        const gp = gamepads[gamePadIndexRef.current];
        if (gp) {
            if (gp.axes[0] < -0.5) keysRef.current['ArrowLeft'] = true;
            else if (gp.axes[0] > 0.5) keysRef.current['ArrowRight'] = true;
            else {
                if (!keysRef.current['KeyA'] && !keysRef.current['ArrowLeft_K']) keysRef.current['ArrowLeft'] = false;
                if (!keysRef.current['KeyD'] && !keysRef.current['ArrowRight_K']) keysRef.current['ArrowRight'] = false;
            }
            if (gp.buttons[14].pressed) keysRef.current['ArrowLeft'] = true;
            if (gp.buttons[15].pressed) keysRef.current['ArrowRight'] = true;

            if (gp.buttons[0].pressed) {
                if (!keysRef.current['Space_Held']) { 
                    keysRef.current['Space'] = true;
                    playerRef.current.jumpBufferTimer = JUMP_BUFFER;
                    keysRef.current['Space_Held'] = true;
                }
            } else {
                keysRef.current['Space'] = false;
                keysRef.current['Space_Held'] = false;
            }

            if (gp.buttons[2].pressed || gp.buttons[1].pressed) {
                keysRef.current['KeyF'] = true;
            } else {
                keysRef.current['KeyF'] = false;
            }
        }
    }
  };


  // --- 初始化环境装饰 (Mount时执行) ---
  useEffect(() => {
    cloudsRef.current = Array.from({ length: 8 }).map(() => ({
      x: Math.random() * CANVAS_WIDTH * 2,
      y: Math.random() * (CANVAS_HEIGHT / 2),
      speed: 0.2 + Math.random() * 0.5,
      size: 30 + Math.random() * 40
    }));

    treesRef.current = Array.from({ length: 10 }).map((_, i) => ({
       x: i * (CANVAS_WIDTH / 2) + Math.random() * 200,
       y: CANVAS_HEIGHT - 50, 
       width: 20 + Math.random() * 10,
       height: 100 + Math.random() * 150,
       color: '#171717' 
    }));

    const planetColors = [COLORS.planetRed, COLORS.planetBlue, '#D1D5DB', '#FCD34D', '#A78BFA', '#F472B6', '#34D399'];
    const planetTypes: ('RING' | 'GAS' | 'CRATER' | 'SOLID')[] = ['RING', 'GAS', 'CRATER', 'SOLID', 'SOLID', 'GAS'];
    
    planetsRef.current = Array.from({ length: 8 }).map((_, i) => ({
       x: Math.random() * CANVAS_WIDTH * 2,
       y: Math.random() * (CANVAS_HEIGHT * 0.8),
       size: 15 + Math.random() * 50,
       color: planetColors[Math.floor(Math.random() * planetColors.length)],
       type: planetTypes[Math.floor(Math.random() * planetTypes.length)],
       speed: 0.05 + Math.random() * 0.2
    }));

    caveSpikesRef.current = [];
    for(let i=0; i<40; i++) {
        caveSpikesRef.current.push({
            x: Math.random() * CANVAS_WIDTH * 2,
            height: 50 + Math.random() * 200,
            width: 30 + Math.random() * 50,
            type: Math.random() > 0.5 ? 'CEILING' : 'FLOOR'
        });
    }

    particlePoolRef.current.forEach(p => p.active = false);
  }, []);

  // --- 性能优化：生成离屏背景画布 & 光照画布 ---
  useEffect(() => {
    const bg = document.createElement('canvas');
    bg.width = CANVAS_WIDTH;
    bg.height = CANVAS_HEIGHT;
    const ctx = bg.getContext('2d');
    if (!ctx) return;

    const weather = levelRef.current.weather;
    const isSeaLevel = weather === 'SEA';
    const isSpaceLevel = weather === 'SPACE';
    const isTrainLevel = weather === 'TRAIN';
    const isArcticLevel = weather === 'ARCTIC';

    let bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    if (isSpaceLevel || weather === 'CAVE' || isTrainLevel) {
        bgGradient.addColorStop(0, '#000000');
        bgGradient.addColorStop(1, '#111827');
    } else if (isSeaLevel) {
        bgGradient.addColorStop(0, '#0C4A6E'); 
        bgGradient.addColorStop(1, '#0284C7'); 
    } else if (weather === 'SUNNY') {
        bgGradient.addColorStop(0, '#38BDF8'); 
        bgGradient.addColorStop(1, '#BAE6FD'); 
    } else if (weather === 'RAIN') {
        bgGradient.addColorStop(0, '#334155'); 
        bgGradient.addColorStop(1, '#475569');
    } else if (isArcticLevel) {
        bgGradient.addColorStop(0, '#0F172A'); 
        bgGradient.addColorStop(0.5, '#1E3A8A'); 
        bgGradient.addColorStop(1, '#60A5FA'); 
    } else {
        bgGradient.addColorStop(0, levelRef.current.backgroundColor);
        bgGradient.addColorStop(1, levelRef.current.backgroundColor);
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    if (!isSpaceLevel && !isSeaLevel && weather !== 'CAVE' && weather !== 'TRAIN') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, CANVAS_HEIGHT);
        for(let i=0; i<=CANVAS_WIDTH; i+=50) {
            ctx.lineTo(i, CANVAS_HEIGHT - 150 - Math.random()*100);
        }
        ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fill();
    }

    bgCanvasRef.current = bg;
    
    // 初始化光照画布
    const ov = document.createElement('canvas');
    ov.width = CANVAS_WIDTH;
    ov.height = CANVAS_HEIGHT;
    overlayCanvasRef.current = ov;
  }, [levelId]); 

  // --- 关卡切换逻辑 ---
  useEffect(() => {
    const newLevel = levels.find(l => l.id === levelId) || levels[0];
    levelRef.current = newLevel;
    activeCheckpointRef.current = null; // 重置存档点

    entitiesRef.current = JSON.parse(JSON.stringify(newLevel.entities));
    bulletsRef.current = [];
    playerRef.current = {
      id: 'hero',
      type: EntityType.PLAYER,
      pos: { ...newLevel.spawnPoint },
      size: { x: PLAYER_WIDTH, y: PLAYER_HEIGHT },
      vel: { x: 0, y: 0 },
      isGrounded: false,
      facingRight: true,
      isInvulnerable: true, 
      invulnerableTimer: 60,
      shootCooldown: 0,
      drunkTimer: 0,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      isAttacking: false,
      attackTimer: 0,
      renderScale: { x: 1, y: 1 },
      animFrame: 0,
      animTimer: 0
    };
    cameraRef.current.x = 0;
    cameraRef.current.shake = 0;
    cameraRef.current.lookAheadOffset = 0;
    particlePoolRef.current.forEach(p => p.active = false);
    timeRef.current = 0;
    
    let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' | 'WARM' = 'NORMAL';
    if (newLevel.weather === 'CAVE') bgmType = 'CAVE';
    if (newLevel.weather === 'TOMB') bgmType = 'TOMB';
    if (newLevel.weather === 'SPACE') bgmType = 'SPACE';
    if (newLevel.weather === 'ARCTIC') bgmType = 'WARM'; 
    audio.startBGM(bgmType);
    
    return () => {
      audio.stopBGM();
    }
  }, [levelId]);

  // --- 辅助函数 (提前定义) ---
  const checkCollision = (rect1: Entity, rect2: Entity) => {
    return (
      rect1.pos.x < rect2.pos.x + rect2.size.x &&
      rect1.pos.x + rect1.size.x > rect2.pos.x &&
      rect1.pos.y < rect2.pos.y + rect2.size.y &&
      rect1.pos.y + rect1.size.y > rect2.pos.y
    );
  };

  const addShake = (amount: number) => {
      cameraRef.current.shake = amount;
  };

  const handleDamage = (targetPlayer: Player) => {
    onPlayerHit();
    targetPlayer.isInvulnerable = true;
    targetPlayer.invulnerableTimer = 120;
    
    audio.playDamage();
    addShake(5);
    hitStopRef.current = 5;
    
    for (let k = 0; k < 8; k++) {
        spawnParticle({
            x: targetPlayer.pos.x + targetPlayer.size.x/2, y: targetPlayer.pos.y + targetPlayer.size.y/2,
            speedX: (Math.random() - 0.5) * 10, speedY: (Math.random() - 0.5) * 10,
            size: 3, life: 0.5, color: '#EF4444'
        });
    }
  };

  // --- 复活/状态同步逻辑 ---
  useEffect(() => {
    if (gameState.status === GameStatus.PLAYING) {
        if (playerRef.current.invulnerableTimer === 0) {
             playerRef.current.isInvulnerable = true;
             playerRef.current.invulnerableTimer = 120;
        }

       const isFreeFly = levelRef.current.weather === 'SEA' || levelRef.current.weather === 'SPACE';
       const limit = isFreeFly ? levelRef.current.height + 200 : levelRef.current.height + 50;
       
       if (playerRef.current.pos.y > limit) {
           if (isFreeFly) {
               playerRef.current.pos.y = limit - 10;
               playerRef.current.vel.y = -1;
           } else {
               if (activeCheckpointRef.current) {
                   playerRef.current.pos = { ...activeCheckpointRef.current.pos };
               } else {
                   playerRef.current.pos = { ...levelRef.current.spawnPoint };
               }
               playerRef.current.vel = { x: 0, y: 0 };
               cameraRef.current.x = Math.max(0, playerRef.current.pos.x - CANVAS_WIDTH / 3);
               handleDamage(playerRef.current); 
           }
       }
       keysRef.current = {}; 
       
       let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' | 'WARM' = 'NORMAL';
        if (levelRef.current.weather === 'CAVE') bgmType = 'CAVE';
        if (levelRef.current.weather === 'TOMB') bgmType = 'TOMB';
        if (levelRef.current.weather === 'SPACE') bgmType = 'SPACE';
        if (levelRef.current.weather === 'ARCTIC') bgmType = 'WARM';
        audio.startBGM(bgmType);
    } else {
       audio.stopBGM();
    }
  }, [gameState.status]);

  // --- 输入监听 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
        keysRef.current[e.code] = true;
        if(e.code === 'ArrowLeft') keysRef.current['ArrowLeft_K'] = true;
        if(e.code === 'ArrowRight') keysRef.current['ArrowRight_K'] = true;

        if (e.code === 'Space' || e.code === 'ArrowUp') {
            playerRef.current.jumpBufferTimer = JUMP_BUFFER;
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => { 
        keysRef.current[e.code] = false; 
        if(e.code === 'ArrowLeft') keysRef.current['ArrowLeft_K'] = false;
        if(e.code === 'ArrowRight') keysRef.current['ArrowRight_K'] = false;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener("gamepadconnected", (e) => {
        gamePadIndexRef.current = e.gamepad.index;
    });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spawnEnemy = (spawner: Entity) => {
      const variant = spawner.spawnVariant || 'NORMAL';
      let width = 30;
      let height = 30;
      let speed = 2;
      let health = 1;
      let color = COLORS.enemy;

      if (variant === 'TANK') { width = 50; height = 50; speed = 1; health = 3; color = COLORS.enemyTank; } 
      else if (variant === 'FAST') { width = 25; height = 25; speed = 4; health = 1; color = COLORS.enemyFast; } 
      else if (variant === 'BAT' || variant === 'BIRD') { width = 30; height = 20; speed = 3; health = 1; color = variant === 'BIRD' ? COLORS.enemyBird : COLORS.enemyBat; } 
      else if (variant === 'SLIME') { width = 30; height = 20; speed = 1; health = 2; color = COLORS.enemySlime; } 
      else if (variant === 'FISH') { width = 35; height = 25; speed = 2.5; health = 1; color = COLORS.enemyFish; } 
      else if (variant === 'SKELETON') { width = 25; height = 45; speed = 2; health = 2; color = COLORS.enemySkeleton; } 
      else if (variant === 'MUMMY') { width = 30; height = 45; speed = 1; health = 4; color = COLORS.enemyMummy; } 
      else if (variant === 'ZOMBIE') { width = 30; height = 45; speed = 1.5; health = 3; color = COLORS.enemyZombie; } 
      else if (variant === 'SPIDER') { width = 30; height = 25; speed = 2; health = 1; color = COLORS.enemySpider; } 
      else if (variant === 'ALIEN') { width = 25; height = 35; speed = 2; health = 2; color = COLORS.enemyAlien; } 
      else if (variant === 'UFO') { width = 40; height = 25; speed = 4; health = 2; color = COLORS.enemyUfo; } 
      else if (variant === 'METEOR') { width = 35; height = 35; speed = 4; health = 1; color = COLORS.meteor; }

      const dir = Math.random() > 0.5 ? 1 : -1;
      let spawnY = spawner.pos.y - height + spawner.size.y; 
      
      if (variant === 'BAT' || variant === 'BIRD' || variant === 'UFO') {
          spawnY -= (variant === 'UFO' ? 100 + Math.random() * 50 : 100); 
      }
      if (variant === 'METEOR') {
          spawnY = spawner.pos.y - 300 + Math.random() * 400;
      }

      const enemy: Entity = {
        id: `spawned_${Date.now()}_${Math.random()}`,
        type: EntityType.ENEMY,
        pos: { x: spawner.pos.x, y: spawnY }, 
        size: { x: width, y: height },
        vel: { x: speed * dir, y: 0 },
        patrolStart: spawner.pos.x - 400,
        patrolEnd: spawner.pos.x + 400,
        enemyVariant: variant,
        health,
        maxHealth: health,
        color
      };

      if (variant === 'SPIDER') { enemy.vel.x = 0; enemy.vel.y = speed; enemy.initialY = spawnY; }
      if (variant === 'METEOR') {
          enemy.vel.x = -speed - Math.random() * 2; 
          enemy.vel.y = (Math.random() - 0.5) * 1; 
          enemy.patrolStart = -99999;
          enemy.patrolEnd = 99999;
      }

      entitiesRef.current.push(enemy);
      
      const dist = Math.abs(spawner.pos.x - playerRef.current.pos.x);
      if (dist < 800 && variant !== 'METEOR') { 
          audio.playRoar();
      }
  };

  // --- 更新环境逻辑 (粒子/背景) ---
  const updateEnvironment = () => {
    const player = playerRef.current;
    const weather = levelRef.current.weather;
    timeRef.current += 1;

    // 1. 动态背景元素
    if (weather === 'TRAIN') {
        const trainSpeed = 6; 

        cloudsRef.current.forEach(cloud => {
            cloud.x -= cloud.speed * 2 + trainSpeed * 0.2; 
            if (cloud.x + cloud.size * 2 < 0) {
                cloud.x = CANVAS_WIDTH * 2 + Math.random() * 200;
                cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
            }
        });
        
        treesRef.current.forEach(tree => {
             tree.x -= trainSpeed; 
             if (tree.x + tree.width < -100) {
                 const rightMostX = Math.max(...treesRef.current.map(t => t.x), CANVAS_WIDTH);
                 tree.x = rightMostX + 300 + Math.random() * 400; 
                 tree.height = 100 + Math.random() * 150;
                 tree.y = CANVAS_HEIGHT - 30; 
             }
        });
        
        const activeParticles = particlePoolRef.current.filter(p => p.active).length;
        if (activeParticles < MAX_PARTICLES && Math.random() > 0.8) { 
            const spawnX = cameraRef.current.x + CANVAS_WIDTH + Math.random() * 100;
            spawnParticle({
                x: spawnX, y: Math.random() * CANVAS_HEIGHT,
                speedX: -15 - Math.random() * 10, speedY: 0,
                size: 1 + Math.random() * 2, life: 0.5, color: 'rgba(255, 255, 255, 0.4)'
            });
        }
    }
    else if (weather === 'SPACE') {
        planetsRef.current.forEach(p => {
             p.x -= p.speed;
             if (p.x + p.size < 0) {
                 p.x = CANVAS_WIDTH * 1.5 + Math.random() * 500;
                 p.y = Math.random() * (CANVAS_HEIGHT * 0.8);
             }
        });
    }
    else if (weather === 'CAVE') {
        caveSpikesRef.current.forEach((spike, i) => {
             const parallaxSpeed = 0.5 + (i % 3) * 0.2;
             spike.x -= parallaxSpeed;
             if (spike.x + spike.width < -100) {
                 spike.x = CANVAS_WIDTH * 2 + Math.random() * 100;
             }
        });
    }
    else if (weather !== 'SEA' && weather !== 'TOMB') {
        cloudsRef.current.forEach(cloud => {
            cloud.x -= cloud.speed;
            if (cloud.x + cloud.size * 2 < 0) {
                cloud.x = CANVAS_WIDTH * 2 + Math.random() * 200;
                cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
            }
        });
    }

    const activeCount = particlePoolRef.current.filter(p => p.active).length;
    if (activeCount < MAX_PARTICLES) {
        if (weather === 'SEA' && Math.random() > 0.9) { 
             const spawnX = cameraRef.current.x + Math.random() * CANVAS_WIDTH;
             spawnParticle({
                 x: spawnX, y: CANVAS_HEIGHT + 10,
                 speedX: (Math.random() - 0.5) * 0.5, speedY: -1 - Math.random(),
                 size: 2 + Math.random() * 4, life: 1, color: 'rgba(255, 255, 255, 0.4)'
             });
        } 
        else if ((weather === 'ARCTIC' || weather === 'SNOW') && Math.random() > 0.8) { 
             // 修复：雪花现在是在屏幕空间生成的 (0 - CANVAS_WIDTH)，不需要加 CameraX
             const spawnX = Math.random() * CANVAS_WIDTH;
             spawnParticle({
                 x: spawnX, y: -10,
                 speedX: (Math.random() - 0.5) * 1, speedY: 1 + Math.random() * 2,
                 size: 2 + Math.random() * 3, life: 1, color: '#FFFFFF',
                 alpha: 0.8,
                 isScreenSpace: true // 标记为屏幕空间粒子
             });
        }
        else if (weather === 'RAIN') { 
           // 暴雨：每帧多次生成
           for(let i=0; i<3; i++) {
               const spawnX = Math.random() * CANVAS_WIDTH;
               spawnParticle({
                  x: spawnX, y: -20,
                  speedX: -2, 
                  speedY: 12 + Math.random() * 6, // Faster rain
                  size: 2, life: 1,
                  color: '#A7F3D0', alpha: 0.6,
                  isScreenSpace: true
               });
           }
        }
    }
    
    if (player.drunkTimer > 0 && Math.random() > 0.8) {
       spawnParticle({
           x: player.pos.x + Math.random() * player.size.x,
           y: player.pos.y + player.size.y,
           speedX: (Math.random() - 0.5) * 2, speedY: -1 - Math.random() * 3, 
           size: Math.random() * 6 + 2, life: 0.8,
           color: Math.random() > 0.5 ? '#EF4444' : '#F59E0B'
       });
    }

    particlePoolRef.current.forEach(p => {
        if (!p.active) return;
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.color && !p.color.startsWith('rgba') && p.color !== '#D97706' && p.color !== '#FFFFFF') { 
            p.life -= 0.05;
            p.size *= 0.95; 
        } else if (weather === 'SEA' && p.y < 0) {
            p.active = false;
        }

        if (p.y > CANVAS_HEIGHT && weather !== 'SEA') {
           if (p.isScreenSpace) {
               // 循环雨雪
               p.y = -10; 
               p.x = Math.random() * CANVAS_WIDTH;
           } else {
               p.active = false;
           }
        } else if (p.life <= 0) {
           p.active = false;
        }
    });
  };

  // --- 主更新循环 (Logic Loop) ---
  const update = () => {
    if (hitStopRef.current > 0) {
        hitStopRef.current--;
        return; 
    }

    pollGamepad();

    updateEnvironment();

    if (gameState.status !== GameStatus.PLAYING) return;

    const player = playerRef.current;
    const entities = entitiesRef.current;
    const bullets = bulletsRef.current;
    const weather = levelRef.current.weather;
    const isSeaLevel = weather === 'SEA';
    const isSpaceLevel = weather === 'SPACE'; 
    const isTombLevel = weather === 'TOMB';
    const isArcticLevel = weather === 'ARCTIC';
    const isHiddenLevel = levelId === 999;

    // 动画更新
    if (player.isGrounded) {
        if (Math.abs(player.vel.x) > 0.1) {
            player.animTimer = (player.animTimer || 0) + 1;
            if (player.animTimer > 5) {
                player.animTimer = 0;
                player.animFrame = (player.animFrame === 1) ? 2 : 1;
            }
        } else {
            player.animFrame = 0;
        }
    } else {
        player.animFrame = 1; 
    }

    player.renderScale.x += (1 - player.renderScale.x) * 0.1;
    player.renderScale.y += (1 - player.renderScale.y) * 0.1;

    if (player.drunkTimer > 0) player.drunkTimer--;
    if (player.jumpBufferTimer > 0) player.jumpBufferTimer--;
    if (player.attackTimer && player.attackTimer > 0) {
        player.attackTimer--;
        if (player.attackTimer <= 0) player.isAttacking = false;
    }
    
    if (cameraRef.current.shake > 0) {
        cameraRef.current.shake *= 0.9;
        if (cameraRef.current.shake < 0.5) cameraRef.current.shake = 0;
    }

    if (player.shootCooldown > 0) player.shootCooldown--;
    
    // 隐藏关禁止射击
    if (!isHiddenLevel && !isArcticLevel && (keysRef.current['KeyF'] || keysRef.current['KeyJ']) && player.shootCooldown <= 0) {
        player.shootCooldown = SHOOT_COOLDOWN;
        if (player.drunkTimer > 0) player.shootCooldown = SHOOT_COOLDOWN / 2; 

        const bVelX = player.facingRight ? PROJECTILE_SPEED : -PROJECTILE_SPEED;
        let spawnY = player.pos.y + player.size.y / 2 - 4;
        const bPosX = player.facingRight ? player.pos.x + player.size.x : player.pos.x - PROJECTILE_SIZE;

        bullets.push({
            id: `b_${Date.now()}`,
            type: EntityType.PROJECTILE,
            pos: { x: bPosX, y: spawnY },
            size: { x: PROJECTILE_SIZE, y: PROJECTILE_SIZE }, 
            vel: { x: bVelX, y: 0 }
        });
        
        audio.playShoot();
        addShake(2); 
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.pos.x += b.vel.x;
        
        // 旋转动画 (Shuriken/Shovel)
        if (levelId === 6 || levelId === 5) {
            // Use velocity x to increment rotation stored in dummy variable if needed, 
            // or just use time in draw.
        }

        const distFromCam = Math.abs(b.pos.x - cameraRef.current.x);
        if (distFromCam > CANVAS_WIDTH + 100) {
            bullets.splice(i, 1);
            continue;
        }

        let bulletHit = false;

        // 性能优化：剔除检测 BUG修复 - 增加物体宽度的判断
        for (const ent of entities) {
            if (ent.isDead) continue; 
            
            // 修复：确保物体左右边界都在考虑范围内，避免长平台被错误剔除
            const entRight = ent.pos.x + ent.size.x;
            if (entRight < cameraRef.current.x - 100 || ent.pos.x > cameraRef.current.x + CANVAS_WIDTH + 100) continue;

            if (ent.type === EntityType.ENEMY) {
                if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) continue;

                if (checkCollision(b, ent)) {
                    bulletHit = true;
                    ent.health = (ent.health || 1) - 1;
                    if (ent.health <= 0) {
                        ent.isDead = true;
                        const bonus = (ent.enemyVariant === 'TANK' || ent.enemyVariant === 'ZOMBIE' || ent.enemyVariant === 'UFO' ? 500 : 200);
                        setGameState(prev => ({ ...prev, score: prev.score + bonus }));
                        audio.playKill();
                        addShake(10);
                        hitStopRef.current = 5; 
                        
                        for (let k = 0; k < 8; k++) {
                            spawnParticle({
                                x: ent.pos.x + ent.size.x/2, y: ent.pos.y + ent.size.y/2,
                                speedX: (Math.random() - 0.5) * 8, speedY: (Math.random() - 0.5) * 8,
                                size: 4, life: 0.5, color: '#F87171'
                            });
                        }

                    } else {
                        ent.pos.x += b.vel.x > 0 ? 5 : -5;
                        audio.playDamage();
                        addShake(2);
                        hitStopRef.current = 2; 
                    }
                    break;
                }
            } else if (ent.type === EntityType.PLATFORM) {
                if (checkCollision(b, ent)) {
                    bulletHit = true; 
                    spawnParticle({
                        x: b.pos.x, y: b.pos.y, speedX: -b.vel.x * 0.2, speedY: (Math.random()-0.5)*4,
                        size: 2, life: 0.3, color: '#FFF'
                    });
                    break;
                }
            } else if (ent.type === EntityType.BREAKABLE_WALL) {
                if (checkCollision(b, ent)) {
                    bulletHit = true;
                    if (isTombLevel) {
                         ent.isDead = true;
                         audio.playDig();
                         addShake(5);
                         for (let k = 0; k < 5; k++) {
                            spawnParticle({
                                x: ent.pos.x + Math.random() * ent.size.x, y: ent.pos.y + Math.random() * ent.size.y,
                                speedX: (Math.random() - 0.5) * 5, speedY: (Math.random() - 0.5) * 5,
                                size: 3, life: 1, color: COLORS.sandWall
                            });
                         }
                    }
                    break;
                }
            }
        }
        if (bulletHit) {
            bullets.splice(i, 1);
        }
    }

    const maxSpeed = player.drunkTimer > 0 ? MOVE_SPEED * WINE_SPEED_MULTIPLIER : MOVE_SPEED;
    const jumpForce = player.drunkTimer > 0 ? JUMP_FORCE * WINE_JUMP_MULTIPLIER : JUMP_FORCE;
    const isFreeFly = isSeaLevel || isSpaceLevel; 

    if (isFreeFly) {
        if (keysRef.current['ArrowLeft']) {
            player.vel.x -= ACCELERATION;
            player.facingRight = false;
        } else if (keysRef.current['ArrowRight']) {
            player.vel.x += ACCELERATION;
            player.facingRight = true;
        }
        if (keysRef.current['ArrowUp']) player.vel.y -= ACCELERATION;
        else if (keysRef.current['ArrowDown']) player.vel.y += ACCELERATION;

        player.vel.x *= WATER_FRICTION;
        player.vel.y *= WATER_FRICTION;
        if (player.vel.x > SWIM_SPEED) player.vel.x = SWIM_SPEED;
        if (player.vel.x < -SWIM_SPEED) player.vel.x = -SWIM_SPEED;
        if (player.vel.y > SWIM_SPEED) player.vel.y = SWIM_SPEED;
        if (player.vel.y < -SWIM_SPEED) player.vel.y = -SWIM_SPEED;

    } else {
        if (keysRef.current['ArrowLeft']) {
            player.vel.x -= ACCELERATION;
            player.facingRight = false;
        } else if (keysRef.current['ArrowRight']) {
            player.vel.x += ACCELERATION;
            player.facingRight = true;
        } else {
            const friction = player.isGrounded ? FRICTION : AIR_FRICTION;
            player.vel.x *= friction;
            if (Math.abs(player.vel.x) < 0.1) player.vel.x = 0;
        }

        if (player.vel.x > maxSpeed) player.vel.x = maxSpeed;
        if (player.vel.x < -maxSpeed) player.vel.x = -maxSpeed;

        if (player.isGrounded) {
            player.coyoteTimer = COYOTE_TIME;
        } else {
            if (player.coyoteTimer > 0) player.coyoteTimer--;
        }

        if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
            player.vel.y = jumpForce;
            player.isGrounded = false;
            player.coyoteTimer = 0; 
            player.jumpBufferTimer = 0; 
            squashAndStretch(0.8, 1.3); 
            audio.playJump();
            for(let k=0; k<3; k++) {
                spawnParticle({
                    x: player.pos.x + player.size.x/2, y: player.pos.y + player.size.y,
                    speedX: (Math.random()-0.5)*2, speedY: 0,
                    size: 2 + Math.random()*2, life: 0.3, color: '#E5E7EB'
                });
            }
        }

        if (player.vel.y < 0 && !keysRef.current['Space'] && !keysRef.current['ArrowUp']) {
            player.vel.y *= 0.5;
        }

        player.vel.y += GRAVITY;
        if (player.vel.y > TERMINAL_VELOCITY) player.vel.y = TERMINAL_VELOCITY;
    }

    player.pos.x += player.vel.x;
    if (isFreeFly) player.isGrounded = false; 
    
    if (player.pos.x < 0) player.pos.x = 0;
    if (player.pos.x > levelRef.current.width - player.size.x) player.pos.x = levelRef.current.width - player.size.x;

    for (const ent of entities) {
      if (ent.isDead) continue; 
      
      // 修复：剔除检测逻辑修复
      const entRight = ent.pos.x + ent.size.x;
      if (entRight < cameraRef.current.x - 200 || ent.pos.x > cameraRef.current.x + CANVAS_WIDTH + 200) continue;
      
      if (ent.type === EntityType.PLATFORM || ent.type === EntityType.BREAKABLE_WALL) {
        if (checkCollision(player, ent)) {
          if (player.vel.x > 0) {
            player.pos.x = ent.pos.x - player.size.x;
            player.vel.x = 0; 
          } else if (player.vel.x < 0) {
            player.pos.x = ent.pos.x + ent.size.x;
            player.vel.x = 0;
          }
        }
      }
    }

    player.pos.y += player.vel.y;

    let landed = false;
    for (const ent of entities) {
      if (ent.isDead) continue; 
      // 修复：剔除检测逻辑修复
      const entRight = ent.pos.x + ent.size.x;
      if (entRight < cameraRef.current.x - 200 || ent.pos.x > cameraRef.current.x + CANVAS_WIDTH + 200) continue;

      if (ent.type === EntityType.PLATFORM || ent.type === EntityType.BREAKABLE_WALL) {
        if (checkCollision(player, ent)) {
          if (player.vel.y > 0) { 
            player.pos.y = ent.pos.y - player.size.y;
            player.vel.y = 0;
            landed = true;
            if (!player.isGrounded) { 
                squashAndStretch(1.3, 0.7); 
            }
          } else if (player.vel.y < 0) { 
            player.pos.y = ent.pos.y + ent.size.y;
            player.vel.y = 0;
          }
        }
      }
    }
    player.isGrounded = landed;

    if (!isFreeFly && player.pos.y > levelRef.current.height + 100) {
       if (activeCheckpointRef.current) {
            playerRef.current.pos = { ...activeCheckpointRef.current.pos };
            playerRef.current.vel = { x: 0, y: 0 };
            cameraRef.current.x = Math.max(0, playerRef.current.pos.x - CANVAS_WIDTH / 3);
            handleDamage(playerRef.current);
       } else {
            onGameOver();
       }
       return;
    }

    if (player.isInvulnerable) {
      player.invulnerableTimer--;
      if (player.invulnerableTimer <= 0) player.isInvulnerable = false;
    }

    entities.forEach(ent => {
      if (ent.isDead) return;
      // 修复：剔除检测逻辑修复
      const entRight = ent.pos.x + ent.size.x;
      if (entRight < cameraRef.current.x - 200 || ent.pos.x > cameraRef.current.x + CANVAS_WIDTH + 200) return;

      if (ent.type === EntityType.ENEMY) {
        if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) {
             if (!ent.isFollowing) {
                 if (checkCollision(player, ent) || Math.abs(player.pos.x - ent.pos.x) < 50) {
                     ent.isFollowing = true;
                     for(let k=0; k<5; k++) {
                         spawnParticle({
                            x: ent.pos.x + ent.size.x / 2, y: ent.pos.y,
                            speedX: (Math.random()-0.5) * 2, speedY: -2,
                            size: 3, life: 1.0, color: '#F472B6'
                        });
                     }
                     audio.playCoin(); 
                 }
             } else {
                 const targetX = player.pos.x - (player.facingRight ? 40 : -40) - (ent.followOffset || 0) * (player.facingRight ? 1 : -1);
                 const dx = targetX - ent.pos.x;
                 if (Math.abs(dx) > 10) {
                     ent.vel.x = dx * 0.05;
                     if (ent.vel.x > 5) ent.vel.x = 5; 
                     if (ent.vel.x < -5) ent.vel.x = -5;
                 } else {
                     ent.vel.x = 0;
                 }
                 ent.pos.x += ent.vel.x;
                 ent.pos.y = player.pos.y + (player.size.y - ent.size.y); 
             }
             return; 
        } 
        
        else if (ent.enemyVariant === 'BAT' || ent.enemyVariant === 'BIRD') {
             ent.pos.y += Math.sin(Date.now() / 200) * 1; 
             ent.pos.x += ent.vel.x;
        } else if (ent.enemyVariant === 'FISH') {
             ent.pos.x += ent.vel.x;
             ent.pos.y += Math.cos(Date.now() / 400) * 0.5;
        } else if (ent.enemyVariant === 'UFO') {
             ent.pos.x += ent.vel.x;
             ent.pos.y += Math.sin(Date.now() / 300) * 1.5; 
        } else if (ent.enemyVariant === 'SPIDER') {
             const yOffset = Math.sin(Date.now() / 500) * 80;
             ent.pos.y = (ent.initialY || ent.pos.y) + yOffset;
        } else if (ent.enemyVariant === 'MUMMY') {
             ent.pos.x += ent.vel.x * 0.5; 
        } else if (ent.enemyVariant === 'METEOR') {
             ent.pos.x += ent.vel.x;
             ent.pos.y += ent.vel.y;
        } else {
             ent.pos.x += ent.vel.x; 
        }

        if (ent.patrolEnd && ent.pos.x >= ent.patrolEnd) ent.vel.x = -Math.abs(ent.vel.x);
        if (ent.patrolStart && ent.pos.x <= ent.patrolStart) ent.vel.x = Math.abs(ent.vel.x);
      } 
      
      else if (ent.type === EntityType.SPAWNER) {
          if (ent.spawnCooldown) {
              ent.timeUntilSpawn = (ent.timeUntilSpawn || 0) + 1;
              if (ent.timeUntilSpawn >= ent.spawnCooldown) {
                  const dist = Math.abs(ent.pos.x - player.pos.x);
                  let shouldSpawn = false;
                  if (ent.spawnVariant === 'METEOR') {
                      if (dist < 1000) shouldSpawn = true;
                  } else {
                      if (dist < 800 && dist > 100) shouldSpawn = true;
                  }

                  if (shouldSpawn) {
                      spawnEnemy(ent);
                      ent.timeUntilSpawn = 0;
                  }
              }
          }
      }

      if (checkCollision(player, ent)) {
        if (ent.type === EntityType.COIN) {
          ent.isDead = true;
          setGameState(prev => ({ ...prev, score: prev.score + 100, coinsCollected: prev.coinsCollected + 1 }));
          audio.playCoin();
        } else if (ent.type === EntityType.WINE) {
          ent.isDead = true;
          player.drunkTimer = WINE_DURATION;
          audio.playPowerUp();
          setGameState(prev => ({ ...prev, score: prev.score + 500 }));
          for (let k = 0; k < 20; k++) {
             spawnParticle({
                 x: player.pos.x + player.size.x / 2, y: player.pos.y + player.size.y / 2,
                 speedX: (Math.random() - 0.5) * 15, speedY: (Math.random() - 0.5) * 15,
                 size: Math.random() * 6 + 4, life: 1.0, color: Math.random() > 0.5 ? '#EF4444' : '#F59E0B'
             });
          }
        } else if (ent.type === EntityType.POTION) {
            ent.isDead = true;
            audio.playHeal();
            setGameState(prev => {
                let newLives = prev.lives;
                let newMaxLives = prev.maxLives;
                if (newLives < newMaxLives) {
                    newLives += 1;
                } else {
                    newMaxLives += 1;
                    newLives = newMaxLives;
                }
                return { ...prev, lives: newLives, maxLives: newMaxLives };
            });
            for (let k = 0; k < 15; k++) {
                spawnParticle({
                    x: ent.pos.x + ent.size.x / 2, y: ent.pos.y + ent.size.y / 2,
                    speedX: (Math.random() - 0.5) * 4, speedY: -2 - Math.random() * 4,
                    size: Math.random() * 4 + 2, life: 1.5, color: '#F472B6'
                });
            }
        } else if (ent.type === EntityType.CHECKPOINT) {
             if (!ent.isChecked) {
                 ent.isChecked = true;
                 activeCheckpointRef.current = ent;
                 audio.playPowerUp();
                 for (let k = 0; k < 10; k++) {
                     spawnParticle({
                         x: ent.pos.x + ent.size.x/2, y: ent.pos.y,
                         speedX: (Math.random()-0.5)*5, speedY: -5-Math.random()*5,
                         size: 4, life: 2, color: '#FACC15'
                     });
                 }
             }
        } else if (ent.type === EntityType.FLAG || ent.type === EntityType.TROPHY) {
          onLevelComplete();
          audio.playWin();
        } else if (ent.type === EntityType.SPIKE) {
           if (!player.isInvulnerable) handleDamage(player);
        } else if (ent.type === EntityType.ENEMY) {
          if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) return; 

          const hitFromTop = !isFreeFly && player.vel.y > 0 && (player.pos.y + player.size.y) < (ent.pos.y + ent.size.y * 0.7);
          if (hitFromTop) {
            ent.isDead = true;
            player.vel.y = JUMP_FORCE / 2; 
            setGameState(prev => ({ ...prev, score: prev.score + 200 }));
            audio.playKill();
            addShake(5);
            hitStopRef.current = 4; 
          } else {
             if (!player.isInvulnerable) handleDamage(player);
          }
        }
      }
    });

    const targetLookAhead = player.facingRight ? 100 : -50;
    cameraRef.current.lookAheadOffset += (targetLookAhead - cameraRef.current.lookAheadOffset) * 0.05;
    
    const targetCamX = player.pos.x - CANVAS_WIDTH / 3 + cameraRef.current.lookAheadOffset;
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.05; 
    
    if (cameraRef.current.x < 0) cameraRef.current.x = 0;
    const maxCamX = levelRef.current.width - CANVAS_WIDTH;
    if (cameraRef.current.x > maxCamX) cameraRef.current.x = maxCamX;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cameraX = Math.floor(cameraRef.current.x);
    const player = playerRef.current;
    const weather = levelRef.current.weather;
    const bullets = bulletsRef.current;
    const isSeaLevel = weather === 'SEA';
    const isSpaceLevel = weather === 'SPACE';
    const isTrainLevel = weather === 'TRAIN';
    const isArcticLevel = weather === 'ARCTIC';
    
    // Level specific flags
    const isLevel2 = levelId === 2; // Torch
    const isLevel3 = levelId === 3; // Umbrella + Lightning
    const isLevel4 = levelId === 4; // Mermaid + Harpoon
    const isLevel5 = levelId === 5; // Archaeologist + Shovel
    const isLevel6 = levelId === 6; // Ninja + Shuriken
    const isLevel7 = levelId === 7; // Space + Laser
    const isHiddenLevel = levelId === 999;

    // === 1. 绘制背景 (Background) - 使用离屏 Canvas 优化 ===
    if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    const shakeX = (Math.random() - 0.5) * cameraRef.current.shake;
    const shakeY = (Math.random() - 0.5) * cameraRef.current.shake;

    // === 2. 绘制动态远景 (Parallax) ===
    if (isSpaceLevel) {
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 50; i++) { 
            const starX = (i * 123 + cameraX * 0.05) % CANVAS_WIDTH; 
            const starY = (i * 87) % CANVAS_HEIGHT;
            ctx.globalAlpha = Math.random() * 0.5 + 0.3;
            ctx.fillRect(starX, starY, 1, 1);
        }
        ctx.globalAlpha = 1.0;

        planetsRef.current.forEach(p => {
             const parallaxX = p.x - (cameraX * 0.1); 
             const renderX = ((parallaxX % (CANVAS_WIDTH * 2)) + (CANVAS_WIDTH * 2)) % (CANVAS_WIDTH * 2) - 100;
             if (renderX < -100 || renderX > CANVAS_WIDTH + 100) return;

             ctx.fillStyle = p.color;
             ctx.beginPath();
             ctx.arc(renderX, p.y, p.size, 0, Math.PI * 2);
             ctx.fill();
             
             // Planet Detail based on type
             if (p.type === 'RING') {
                 ctx.strokeStyle = COLORS.planetRing;
                 ctx.lineWidth = 4;
                 ctx.beginPath();
                 ctx.ellipse(renderX, p.y, p.size * 1.6, p.size * 0.4, 0.2, 0, Math.PI * 2);
                 ctx.stroke();
             } else if (p.type === 'GAS') {
                 ctx.fillStyle = 'rgba(0,0,0,0.1)';
                 ctx.beginPath();
                 ctx.rect(renderX - p.size, p.y - p.size * 0.2, p.size * 2, p.size * 0.4);
                 ctx.fill();
             } else if (p.type === 'CRATER') {
                 ctx.fillStyle = 'rgba(0,0,0,0.2)';
                 ctx.beginPath();
                 ctx.arc(renderX - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.2, 0, Math.PI*2);
                 ctx.fill();
                 ctx.beginPath();
                 ctx.arc(renderX + p.size * 0.4, p.y + p.size * 0.2, p.size * 0.15, 0, Math.PI*2);
                 ctx.fill();
             }
        });
    }

    if (weather === 'CAVE') {
        ctx.fillStyle = '#262626'; 
        caveSpikesRef.current.forEach((spike, i) => {
             const parallaxX = spike.x - (cameraX * 0.2); 
             const renderX = ((parallaxX % (CANVAS_WIDTH * 2)) + (CANVAS_WIDTH * 2)) % (CANVAS_WIDTH * 2) - 100;
             if (renderX < -100 || renderX > CANVAS_WIDTH + 100) return;
             
             ctx.beginPath();
             if (spike.type === 'CEILING') {
                 ctx.moveTo(renderX, 0);
                 ctx.lineTo(renderX + spike.width / 2, spike.height);
                 ctx.lineTo(renderX + spike.width, 0);
             } else {
                 ctx.moveTo(renderX, CANVAS_HEIGHT);
                 ctx.lineTo(renderX + spike.width / 2, CANVAS_HEIGHT - spike.height);
                 ctx.lineTo(renderX + spike.width, CANVAS_HEIGHT);
             }
             ctx.fill();
        });
    }

    if (weather !== 'CAVE' && weather !== 'SEA' && weather !== 'TOMB' && weather !== 'SPACE') {
        if (isTrainLevel) {
            treesRef.current.forEach(tree => {
                const renderX = tree.x - cameraX; 
                if (renderX < -50 || renderX > CANVAS_WIDTH + 50) return;
                ctx.fillStyle = '#171717';
                ctx.fillRect(renderX, tree.y - tree.height, 10, tree.height);
                ctx.fillRect(renderX - 10, tree.y - tree.height + 10, 30, 4);
            });
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; 
        cloudsRef.current.forEach(cloud => {
            const parallaxX = cloud.x - (cameraX * 0.2); 
            const renderX = ((parallaxX % (CANVAS_WIDTH * 2)) + (CANVAS_WIDTH * 2)) % (CANVAS_WIDTH * 2) - 200;
             if (renderX < -200 || renderX > CANVAS_WIDTH + 200) return;

            ctx.beginPath();
            ctx.arc(renderX, cloud.y, cloud.size, 0, Math.PI * 2);
            ctx.arc(renderX + cloud.size * 0.8, cloud.y + cloud.size * 0.2, cloud.size * 0.9, 0, Math.PI * 2);
            ctx.arc(renderX - cloud.size * 0.8, cloud.y + cloud.size * 0.1, cloud.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    ctx.save();
    ctx.translate(-cameraX + shakeX, shakeY); 

    // === 3. 绘制阴影 (Shadows Pass) ===
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    entitiesRef.current.forEach(ent => {
        if (ent.isDead) return;
        // 修复：剔除检测逻辑修复
        const entRight = ent.pos.x + ent.size.x;
        if (entRight < cameraX - 100 || ent.pos.x > cameraX + CANVAS_WIDTH + 100) return;

        if (ent.type === EntityType.PLAYER || ent.type === EntityType.ENEMY || ent.type === EntityType.TROPHY || ent.type === EntityType.CHECKPOINT) {
             ctx.beginPath();
             ctx.ellipse(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y - 2, ent.size.x/2, 4, 0, 0, Math.PI*2);
             ctx.fill();
        }
    });

    // === 4. 绘制实体 (Entities Pass) ===
    entitiesRef.current.forEach(ent => {
      if (ent.isDead) return;
      if (ent.type === EntityType.SPAWNER) return;
      // 修复：剔除检测逻辑修复
      const entRight = ent.pos.x + ent.size.x;
      if (entRight < cameraX - 200 || ent.pos.x > cameraX + CANVAS_WIDTH + 200) return;

      if (ent.type === EntityType.PLATFORM) {
        if (ent.id.startsWith('end_gate')) {
             if (ent.id === 'end_gate_sakura') { 
                 const tx = ent.pos.x + 50;
                 const ty = CANVAS_HEIGHT - 40; 
                 ctx.fillStyle = '#5D4037';
                 ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 40, ty); ctx.lineTo(tx + 30, ty - 200); ctx.lineTo(tx + 10, ty - 200); ctx.fill();
                 
                 const canopyCenters = [{x: 20, y: -220, r: 80}, {x: -30, y: -200, r: 60}, {x: 70, y: -210, r: 70}, {x: 20, y: -280, r: 60}, {x: -20, y: -250, r: 50}];
                 canopyCenters.forEach((c, idx) => {
                     ctx.fillStyle = idx % 2 === 0 ? '#F472B6' : '#FBCFE8'; 
                     ctx.beginPath(); ctx.arc(tx + c.x, ty + c.y, c.r, 0, Math.PI*2); ctx.fill();
                 });
                 return;
             }
             else if (ent.id === 'end_gate_cave') { 
                 const gradient = ctx.createLinearGradient(ent.pos.x - 50, 0, ent.pos.x + 100, 0);
                 gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                 gradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
                 ctx.fillStyle = gradient;
                 ctx.fillRect(ent.pos.x - 100, 0, 300, CANVAS_HEIGHT);
                 return;
             }
             else if (ent.id === 'end_gate_house') { 
                 const hx = ent.pos.x + 20; const hy = CANVAS_HEIGHT - 160; 
                 ctx.fillStyle = '#7F1D1D'; ctx.beginPath(); ctx.moveTo(hx-20, hy+40); ctx.lineTo(hx+60, hy); ctx.lineTo(hx+140, hy+40); ctx.fill();
                 ctx.fillStyle = '#451A03'; ctx.fillRect(hx, hy+40, 120, 80);
                 ctx.fillStyle = '#F59E0B'; ctx.fillRect(hx+40, hy+70, 40, 50); 
                 return;
             }
             else if (ent.id === 'end_gate_beach') { 
                 ctx.fillStyle = '#3E2723'; ctx.fillRect(ent.pos.x - 50, CANVAS_HEIGHT - 100, 10, 100); ctx.fillRect(ent.pos.x + 50, CANVAS_HEIGHT - 100, 10, 100);
                 ctx.fillStyle = '#5D4037'; ctx.fillRect(ent.pos.x - 80, CANVAS_HEIGHT - 110, 200, 10);
                 ctx.fillStyle = 'rgba(255, 255, 200, 0.4)'; ctx.beginPath(); ctx.arc(ent.pos.x + 50, 100, 80, 0, Math.PI*2); ctx.fill();
                 return;
             }
             else if (ent.id === 'end_gate_stairs') { 
                 ctx.fillStyle = '#78350F'; for(let i=0; i<10; i++) ctx.fillRect(ent.pos.x + i*20, CANVAS_HEIGHT - i*20, 40, 20);
                 ctx.fillStyle = '#FFF'; ctx.globalAlpha = 0.5; ctx.fillRect(ent.pos.x + 180, 0, 100, CANVAS_HEIGHT - 180); ctx.globalAlpha = 1.0;
                 return;
             }
             else if (ent.id === 'end_gate_station') { 
                 ctx.fillStyle = '#475569'; ctx.fillRect(ent.pos.x + 10, 50, 10, CANVAS_HEIGHT - 50); ctx.fillRect(ent.pos.x + 100, 50, 10, CANVAS_HEIGHT - 50); 
                 ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.moveTo(ent.pos.x - 20, 50); ctx.lineTo(ent.pos.x + 140, 50); ctx.lineTo(ent.pos.x + 130, 20); ctx.lineTo(ent.pos.x - 10, 20); ctx.fill();
                 ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(ent.pos.x + 60, 50, 15, 0, Math.PI*2); ctx.fill();
                 ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ent.pos.x + 60, 50, 15, 0, Math.PI*2); ctx.stroke();
                 ctx.beginPath(); ctx.moveTo(ent.pos.x + 60, 50); ctx.lineTo(ent.pos.x + 60, 40); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ent.pos.x + 60, 50); ctx.lineTo(ent.pos.x + 68, 50); ctx.stroke(); 
                 ctx.fillStyle = '#1E40AF'; ctx.fillRect(ent.pos.x + 85, 80, 40, 20); ctx.fillStyle = '#FFF'; ctx.font = 'bold 8px Arial'; ctx.fillText("STATION", ent.pos.x + 88, 93);
                 return;
             }
             else if (ent.id === 'end_gate_earth_arctic') { 
                 const earthX = ent.pos.x + 200; 
                 const earthY = CANVAS_HEIGHT/2; 
                 const radius = 300;
                 // Atmosphere glow
                 ctx.shadowBlur = 50; 
                 ctx.shadowColor = '#60A5FA'; 
                 
                 // Ocean
                 ctx.fillStyle = '#1E3A8A'; 
                 ctx.beginPath(); 
                 ctx.arc(earthX, earthY, radius, 0, Math.PI*2); 
                 ctx.fill();
                 
                 // Ice cap
                 ctx.fillStyle = '#F8FAFC'; 
                 ctx.beginPath(); 
                 ctx.ellipse(earthX, earthY - 200, 220, 80, 0, 0, Math.PI*2); 
                 ctx.fill();
                 
                 // Landmasses
                 ctx.fillStyle = '#15803D'; 
                 ctx.beginPath(); 
                 ctx.arc(earthX - 100, earthY + 50, 60, 0, Math.PI*2); 
                 ctx.fill(); 
                 ctx.beginPath(); 
                 ctx.arc(earthX + 150, earthY + 100, 80, 0, Math.PI*2); 
                 ctx.fill();
                 
                 // Atmosphere stroke
                 ctx.lineWidth = 5;
                 ctx.strokeStyle = '#93C5FD';
                 ctx.beginPath(); 
                 ctx.arc(earthX, earthY, radius, 0, Math.PI*2); 
                 ctx.stroke(); 
                 
                 ctx.shadowBlur = 0;
                 return;
             }
             
             ctx.fillStyle = '#111827'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
             return; 
        }
        
        if (ent.id === 'station_platform') {
            ctx.fillStyle = '#94A3B8'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            ctx.fillStyle = '#FACC15'; ctx.fillRect(ent.pos.x, ent.pos.y, 100, 4);
            return;
        }

        if (isSeaLevel) {
            ctx.fillStyle = COLORS.rock;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
        } else if (isSpaceLevel) {
             ctx.fillStyle = COLORS.asteroid; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
             ctx.strokeStyle = '#64748B'; ctx.lineWidth = 2; ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
        } else if (isTrainLevel && ent.id.includes('passengercar')) {
            ctx.fillStyle = COLORS.trainCarBody; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            ctx.fillStyle = COLORS.trainCarStripe; ctx.fillRect(ent.pos.x, ent.pos.y + 30, ent.size.x, 10);
            const wheelY = ent.pos.y + ent.size.y; 
            ctx.fillStyle = '#334155'; ctx.fillRect(ent.pos.x + 25, wheelY, 40, 5); ctx.fillRect(ent.pos.x + ent.size.x - 65, wheelY, 40, 5);
            
            // Draw Windows
            ctx.fillStyle = COLORS.trainWindow;
            for(let i = 10; i < ent.size.x - 30; i += 50) {
                ctx.fillRect(ent.pos.x + i, ent.pos.y + 10, 30, 15);
            }

        } else {
            ctx.fillStyle = levelRef.current.groundColor || COLORS.groundDark;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            if (ent.size.y > 10) {
               ctx.fillStyle = levelRef.current.groundColor ? (levelRef.current.groundColor === COLORS.ice ? '#D6F2FE' : '#65A30D') : COLORS.dirt;
               if (!levelRef.current.groundColor) ctx.fillStyle = COLORS.ground;
               ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, 10);
            }
        }
      } 
      else if (ent.type === EntityType.BREAKABLE_WALL) {
          ctx.fillStyle = COLORS.sandWall; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
          ctx.strokeStyle = '#B45309'; ctx.lineWidth = 2; ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
      }
      else if (ent.type === EntityType.COIN) {
        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.coinShine;
        ctx.fillStyle = COLORS.coin; ctx.beginPath(); ctx.arc(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y/2, ent.size.x/2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      else if (ent.type === EntityType.CHECKPOINT) {
          ctx.fillStyle = '#9CA3AF';
          ctx.fillRect(ent.pos.x + 5, ent.pos.y, 4, 40);
          ctx.fillStyle = ent.isChecked ? '#10B981' : '#EF4444'; 
          ctx.beginPath();
          ctx.moveTo(ent.pos.x + 9, ent.pos.y + 2);
          ctx.lineTo(ent.pos.x + 35, ent.pos.y + 10);
          ctx.lineTo(ent.pos.x + 9, ent.pos.y + 18);
          ctx.fill();
          if (ent.isChecked) {
              ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2; ctx.stroke();
          }
      }
      else if (ent.type === EntityType.WINE) {
        ctx.fillStyle = COLORS.wine; ctx.fillRect(ent.pos.x + 4, ent.pos.y + 10, 12, 20); ctx.fillRect(ent.pos.x + 7, ent.pos.y, 6, 10);
        ctx.fillStyle = COLORS.wineLabel; ctx.fillRect(ent.pos.x + 5, ent.pos.y + 15, 10, 8);
        ent.pos.y += Math.sin(Date.now() / 150) * 0.3; 
      }
      else if (ent.type === EntityType.POTION) {
        const bob = Math.sin(Date.now() / 300) * 2; ctx.fillStyle = COLORS.potion; ctx.beginPath(); ctx.arc(ent.pos.x + 10, ent.pos.y + 15 + bob, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ent.pos.x + 7, ent.pos.y + bob, 6, 10);
      }
      else if (ent.type === EntityType.SPIKE) {
        ctx.fillStyle = levelRef.current.spikeColor || COLORS.spike; ctx.beginPath(); const numSpikes = Math.floor(ent.size.x / 10);
        for(let i=0; i<numSpikes; i++) { ctx.moveTo(ent.pos.x + i * 10, ent.pos.y + ent.size.y); ctx.lineTo(ent.pos.x + i * 10 + 5, ent.pos.y); ctx.lineTo(ent.pos.x + i * 10 + 10, ent.pos.y + ent.size.y); } ctx.fill();
      }
      else if (ent.type === EntityType.TROPHY) {
         if (ent.id === 'home_trigger') {
             // 绘制温馨小屋
             const hx = ent.pos.x + 10;
             const hy = ent.pos.y + 40;
             // House Body
             ctx.fillStyle = '#78350F'; // Dark Wood
             ctx.fillRect(hx, hy, 80, 60);
             // Roof
             ctx.fillStyle = '#991B1B'; // Red Roof
             ctx.beginPath(); ctx.moveTo(hx - 10, hy); ctx.lineTo(hx + 40, hy - 40); ctx.lineTo(hx + 90, hy); ctx.fill();
             // Door
             ctx.fillStyle = '#D97706'; // Wood door
             ctx.fillRect(hx + 30, hy + 20, 20, 40);
             ctx.fillStyle = '#F59E0B'; // Knob
             ctx.beginPath(); ctx.arc(hx + 45, hy + 40, 2, 0, Math.PI*2); ctx.fill();
             // Window with warm light
             ctx.fillStyle = '#FDE047'; // Light
             ctx.fillRect(hx + 10, hy + 10, 15, 15);
             ctx.fillRect(hx + 55, hy + 10, 15, 15);
             // Chimney smoke
             const smokeY = hy - 50 - (Date.now() % 1000) / 20;
             ctx.fillStyle = 'rgba(255,255,255,0.5)';
             ctx.beginPath(); ctx.arc(hx + 60, smokeY, 5 + Math.sin(Date.now()/200)*2, 0, Math.PI*2); ctx.fill();
         } else {
             // Draw Podium
             ctx.fillStyle = '#5D4037'; // Dark wood
             ctx.fillRect(ent.pos.x, ent.pos.y + 30, 40, 10);
             ctx.fillStyle = '#8D6E63'; // Lighter wood top
             ctx.fillRect(ent.pos.x - 5, ent.pos.y + 25, 50, 5);

             // Normal Trophy with Glow
             ctx.shadowBlur = 15;
             ctx.shadowColor = '#FDE047';
             ctx.fillStyle = COLORS.trophy; ctx.beginPath(); ctx.moveTo(ent.pos.x + 5, ent.pos.y + 5); ctx.lineTo(ent.pos.x + 35, ent.pos.y + 5); ctx.bezierCurveTo(ent.pos.x + 35, ent.pos.y + 25, ent.pos.x + 5, ent.pos.y + 25, ent.pos.x + 5, ent.pos.y + 5); ctx.fill();
             ctx.fillStyle = COLORS.trophyBase; ctx.fillRect(ent.pos.x + 15, ent.pos.y + 25, 10, 5); ctx.fillRect(ent.pos.x + 10, ent.pos.y + 30, 20, 5);
             ctx.shadowBlur = 0;
         }
      }
      else if (ent.type === EntityType.ENEMY) {
         const cx = ent.pos.x + ent.size.x / 2;
         const cy = ent.pos.y + ent.size.y / 2;
         const time = Date.now();

         if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) {
             // 绘制家人 (45度侧身小熊形象)
             // 检测移动方向：如果正在跟随 (vel.x !== 0)，朝向移动方向；否则默认朝左看小熊
             const isMovingRight = ent.vel.x > 0.1;
             const isMovingLeft = ent.vel.x < -0.1;
             const isFacingLeft = isMovingLeft || (!isMovingRight && true); // 默认朝左
             
             ctx.save();
             // 如果朝右，翻转画布
             if (!isFacingLeft) {
                 ctx.translate(ent.pos.x + ent.size.x, ent.pos.y);
                 ctx.scale(-1, 1);
                 ctx.translate(-(ent.pos.x + ent.size.x), -ent.pos.y);
             }

             // Draw Family Member (Standard visual logic assumes Left Facing now)
             // Because we handle flipping via transform, we draw as if facing left.
             // But wait, the original drawing code was hardcoded for "Left Facing".
             // Let's adapt the previous drawing code to be generic and let transform handle flip.
             
             // Adjusted X coordinates for local space (relative to pos.x)
             // Face is on the Left side of the body
             
             ctx.fillStyle = COLORS.bear;
             // Body
             ctx.beginPath(); ctx.roundRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y, 6); ctx.fill();
             
             // Ears
             ctx.beginPath();
             ctx.arc(ent.pos.x + 4, ent.pos.y + 2, 5, 0, Math.PI * 2); 
             ctx.arc(ent.pos.x + ent.size.x - 4, ent.pos.y + 2, 5, 0, Math.PI * 2); 
             ctx.fill();
             
             // Face (On Left)
             ctx.fillStyle = COLORS.bearFace;
             const faceWidth = ent.size.x * 0.55;
             const faceHeight = ent.size.y * 0.4;
             const faceX = ent.pos.x + 2; 
             const faceY = ent.pos.y + ent.size.y * 0.25;
             ctx.beginPath(); ctx.roundRect(faceX, faceY, faceWidth, faceHeight, 4); ctx.fill();
             
             // Eyes
             ctx.fillStyle = '#000';
             const eyeY = faceY + faceHeight * 0.4;
             const eyeSize = Math.max(1.5, ent.size.x * 0.08); 
             ctx.beginPath(); ctx.arc(faceX + 4, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(faceX + faceWidth - 4, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
             
             // Nose
             ctx.beginPath();
             ctx.ellipse(faceX + faceWidth/2 - 2, eyeY + 4, eyeSize, eyeSize*0.6, 0, 0, Math.PI*2);
             ctx.fill();

             // Accessories
             if (ent.enemyVariant === 'FAMILY_DAD') {
                 ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
                 ctx.beginPath(); ctx.arc(faceX + 4, eyeY, eyeSize + 1, 0, Math.PI*2); ctx.stroke();
                 ctx.beginPath(); ctx.arc(faceX + faceWidth - 4, eyeY, eyeSize + 1, 0, Math.PI*2); ctx.stroke();
                 ctx.beginPath(); ctx.moveTo(faceX + 4 + eyeSize + 1, eyeY); ctx.lineTo(faceX + faceWidth - 4 - eyeSize - 1, eyeY); ctx.stroke();
             } else if (ent.enemyVariant === 'FAMILY_MOM') {
                 ctx.fillStyle = '#DC2626'; 
                 ctx.fillRect(ent.pos.x + 2, ent.pos.y + ent.size.y * 0.65, ent.size.x - 4, 4);
                 ctx.beginPath();
                 ctx.moveTo(ent.pos.x + ent.size.x - 2, ent.pos.y + ent.size.y * 0.65);
                 ctx.quadraticCurveTo(ent.pos.x + ent.size.x + 10, ent.pos.y + ent.size.y * 0.7, ent.pos.x + ent.size.x + 15, ent.pos.y + ent.size.y * 0.8 + Math.sin(time/200)*3);
                 ctx.lineTo(ent.pos.x + ent.size.x - 2, ent.pos.y + ent.size.y * 0.75);
                 ctx.fill();
             }

             ctx.restore();
         }
         else if (ent.enemyVariant === 'BAT' || ent.enemyVariant === 'BIRD') {
             const isBird = ent.enemyVariant === 'BIRD';
             const flap = Math.sin(time / 50) * 8;
             
             ctx.fillStyle = isBird ? '#FFF' : COLORS.enemyBat; 
             ctx.beginPath();
             ctx.ellipse(cx, cy, 12, 10, 0, 0, Math.PI * 2); // Body
             ctx.fill();
             
             // Wings
             ctx.fillStyle = isBird ? '#93C5FD' : '#000';
             ctx.beginPath();
             ctx.moveTo(cx - 5, cy);
             ctx.lineTo(cx - 20, cy - 10 + flap);
             ctx.lineTo(cx - 10, cy + 5);
             ctx.fill();
             ctx.beginPath();
             ctx.moveTo(cx + 5, cy);
             ctx.lineTo(cx + 20, cy - 10 + flap);
             ctx.lineTo(cx + 10, cy + 5);
             ctx.fill();

             // Eyes
             ctx.fillStyle = isBird ? '#000' : '#F59E0B';
             ctx.beginPath(); ctx.arc(cx - 4, cy - 2, isBird ? 2 : 1.5, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 4, cy - 2, isBird ? 2 : 1.5, 0, Math.PI*2); ctx.fill();
             
             if (isBird) {
                 ctx.fillStyle = '#F59E0B'; // Beak
                 ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (ent.vel.x > 0 ? 8 : -8), cy + 2); ctx.lineTo(cx, cy + 4); ctx.fill();
             }
         } 
         else if (ent.enemyVariant === 'FISH') {
             ctx.fillStyle = COLORS.enemyFish;
             // Fish body
             ctx.beginPath();
             if (ent.vel.x > 0) {
                 ctx.ellipse(cx, cy, 16, 10, 0, 0, Math.PI*2);
             } else {
                 ctx.ellipse(cx, cy, 16, 10, 0, 0, Math.PI*2);
             }
             ctx.fill();
             // Tail
             const tailWag = Math.sin(time / 100) * 3;
             ctx.beginPath();
             if (ent.vel.x > 0) {
                 ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 24, cy - 6 + tailWag); ctx.lineTo(cx - 24, cy + 6 + tailWag);
             } else {
                 ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 24, cy - 6 + tailWag); ctx.lineTo(cx + 24, cy + 6 + tailWag);
             }
             ctx.fill();
             // Eye
             ctx.fillStyle = '#FFF';
             ctx.beginPath(); ctx.arc(cx + (ent.vel.x > 0 ? 8 : -8), cy - 2, 4, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#000';
             ctx.beginPath(); ctx.arc(cx + (ent.vel.x > 0 ? 9 : -9), cy - 2, 1.5, 0, Math.PI*2); ctx.fill();
         }
         else if (ent.enemyVariant === 'SLIME') {
             ctx.fillStyle = COLORS.enemySlime;
             const wobble = Math.sin(time / 150) * 2;
             ctx.beginPath();
             ctx.arc(cx, cy + 5, 12 + wobble, Math.PI, 0); // Top half
             ctx.lineTo(ent.pos.x + ent.size.x, ent.pos.y + ent.size.y);
             ctx.lineTo(ent.pos.x, ent.pos.y + ent.size.y);
             ctx.fill();
             
             ctx.fillStyle = '#FFF';
             ctx.beginPath(); ctx.arc(cx - 5, cy, 3, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 5, cy, 3, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#000';
             ctx.beginPath(); ctx.arc(cx - 5, cy, 1, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 5, cy, 1, 0, Math.PI*2); ctx.fill();
         }
         else if (ent.enemyVariant === 'TANK' || ent.enemyVariant === 'SKELETON' || ent.enemyVariant === 'MUMMY' || ent.enemyVariant === 'ZOMBIE') {
             if (ent.enemyVariant === 'TANK') {
                 // Knight/Tank
                 ctx.fillStyle = '#52525B'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
                 ctx.fillStyle = '#3F3F46'; ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 10, ent.size.x, 10); // Treads
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 5, ent.pos.y + 10, ent.size.x - 10, 5); // Visor
                 ctx.fillStyle = '#EF4444'; ctx.fillRect(ent.pos.x + 15, ent.pos.y + 10, 4, 5); // Eye glow
             } else if (ent.enemyVariant === 'SKELETON') {
                 ctx.fillStyle = '#E2E8F0'; ctx.fillRect(ent.pos.x + 8, ent.pos.y, 14, 14); // Skull
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 10, ent.pos.y + 4, 3, 3); ctx.fillRect(ent.pos.x + 17, ent.pos.y + 4, 3, 3); // Eyes
                 ctx.fillStyle = '#E2E8F0'; ctx.fillRect(ent.pos.x + 12, ent.pos.y + 14, 6, 20); // Spine
                 ctx.fillRect(ent.pos.x + 4, ent.pos.y + 18, 22, 2); // Rib
                 ctx.fillRect(ent.pos.x + 6, ent.pos.y + 22, 18, 2); // Rib
             } else if (ent.enemyVariant === 'MUMMY') {
                 ctx.fillStyle = '#FDE68A'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
                 ctx.fillStyle = '#D97706'; // Bandage lines
                 for(let i=5; i<ent.size.y; i+=8) ctx.fillRect(ent.pos.x, ent.pos.y + i, ent.size.x, 2);
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 5, ent.pos.y + 10, 20, 6); // Eye slit
                 ctx.fillStyle = '#EF4444'; ctx.fillRect(ent.pos.x + 8, ent.pos.y + 12, 3, 3); ctx.fillRect(ent.pos.x + 18, ent.pos.y + 12, 3, 3);
             } else if (ent.enemyVariant === 'ZOMBIE') {
                 ctx.fillStyle = '#4D7C0F'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y); // Green skin
                 ctx.fillStyle = '#3F6212'; ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 15, ent.size.x, 15); // Pants
                 // Arms out
                 ctx.fillStyle = '#4D7C0F'; 
                 if (ent.vel.x > 0) ctx.fillRect(ent.pos.x + ent.size.x, ent.pos.y + 15, 10, 6);
                 else ctx.fillRect(ent.pos.x - 10, ent.pos.y + 15, 10, 6);
                 // Face
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + (ent.vel.x > 0 ? 18 : 4), ent.pos.y + 8, 4, 4); // Eye
                 ctx.fillStyle = '#DC2626'; ctx.fillRect(ent.pos.x + (ent.vel.x > 0 ? 18 : 4), ent.pos.y + 18, 6, 2); // Mouth
             }
         }
         else if (ent.enemyVariant === 'ALIEN' || ent.enemyVariant === 'UFO') {
             if (ent.enemyVariant === 'UFO') {
                 ctx.fillStyle = '#94A3B8'; // Saucer
                 ctx.beginPath(); ctx.ellipse(cx, cy + 5, 20, 8, 0, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#60A5FA'; // Dome
                 ctx.beginPath(); ctx.arc(cx, cy - 2, 10, Math.PI, 0); ctx.fill();
                 // Lights
                 const blink = Math.floor(time / 200) % 2 === 0;
                 ctx.fillStyle = blink ? '#FACC15' : '#EF4444';
                 ctx.beginPath(); ctx.arc(cx - 12, cy + 5, 2, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.arc(cx, cy + 8, 2, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.arc(cx + 12, cy + 5, 2, 0, Math.PI*2); ctx.fill();
             } else {
                 // Alien
                 ctx.fillStyle = '#84CC16'; // Head
                 ctx.beginPath(); ctx.arc(cx, cy - 5, 10, 0, Math.PI*2); ctx.fill();
                 ctx.fillRect(cx - 5, cy, 10, 15); // Body
                 // Eyes
                 ctx.fillStyle = '#000';
                 ctx.beginPath(); ctx.ellipse(cx - 4, cy - 5, 3, 5, -0.2, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.ellipse(cx + 4, cy - 5, 3, 5, 0.2, 0, Math.PI*2); ctx.fill();
             }
         }
         else {
             // Standard / Normal Enemy (Goomba-ish)
             ctx.fillStyle = '#B45309'; // Brown body
             ctx.beginPath(); 
             ctx.moveTo(ent.pos.x + 5, ent.pos.y + ent.size.y);
             ctx.lineTo(ent.pos.x, ent.pos.y + 10);
             ctx.quadraticCurveTo(ent.pos.x + ent.size.x/2, ent.pos.y - 5, ent.pos.x + ent.size.x, ent.pos.y + 10);
             ctx.lineTo(ent.pos.x + ent.size.x - 5, ent.pos.y + ent.size.y);
             ctx.fill();
             
             // Feet walking animation
             const step = Math.floor(time / 100) % 2;
             ctx.fillStyle = '#000';
             if (step === 0) {
                 ctx.fillRect(ent.pos.x - 2, ent.pos.y + ent.size.y - 6, 8, 6);
                 ctx.fillRect(ent.pos.x + ent.size.x - 6, ent.pos.y + ent.size.y - 6, 8, 6);
             } else {
                 ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 6, 8, 6);
                 ctx.fillRect(ent.pos.x + ent.size.x - 8, ent.pos.y + ent.size.y - 6, 8, 6);
             }

             // Eyes
             ctx.fillStyle = '#FFF';
             const eyeY = ent.pos.y + 10;
             const eyeOffset = ent.vel.x > 0 ? 4 : -4;
             ctx.beginPath(); ctx.arc(cx - 5 + eyeOffset, eyeY, 4, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 5 + eyeOffset, eyeY, 4, 0, Math.PI*2); ctx.fill();
             
             ctx.fillStyle = '#000';
             ctx.beginPath(); ctx.arc(cx - 5 + eyeOffset + (ent.vel.x>0?1:-1), eyeY, 1.5, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 5 + eyeOffset + (ent.vel.x>0?1:-1), eyeY, 1.5, 0, Math.PI*2); ctx.fill();
         }
      }
    });

    bullets.forEach(b => {
        if (isLevel5) { // Shovel
            ctx.save(); ctx.translate(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2); 
            ctx.rotate((Date.now() / 50) % (Math.PI * 2));
            ctx.fillStyle = COLORS.shovelHandle; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = COLORS.shovel; ctx.fillRect(5, -6, 12, 12); 
            ctx.restore();
        } else if (isLevel7) { // Laser
            ctx.strokeStyle = COLORS.laserBeam; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y); ctx.lineTo(b.pos.x + (b.vel.x > 0 ? 40 : -40), b.pos.y); ctx.stroke();
            // Glow for laser
            ctx.shadowBlur = 10; ctx.shadowColor = COLORS.laserBeam; ctx.stroke(); ctx.shadowBlur = 0;
        } else if (isLevel6) { // Shuriken
             ctx.save(); ctx.translate(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2);
             ctx.rotate((Date.now() / 30) % (Math.PI * 2));
             ctx.fillStyle = COLORS.shuriken;
             ctx.beginPath();
             // 4-point star
             for(let i=0; i<4; i++) {
                 ctx.rotate(Math.PI/2);
                 ctx.moveTo(0, 0); ctx.lineTo(10, 3); ctx.lineTo(0, 6); ctx.lineTo(-10, 3);
             }
             ctx.fill();
             ctx.restore();
        } else if (isLevel4) { // Harpoon Projectile
            ctx.save();
            ctx.translate(b.pos.x, b.pos.y);
            // Rotate if moving left
            if (b.vel.x < 0) ctx.scale(-1, 1);
            
            // Shaft
            ctx.fillStyle = COLORS.harpoonShaft;
            ctx.fillRect(-10, -2, 30, 4);
            // Tip (Barbed)
            ctx.fillStyle = COLORS.harpoonTip;
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(10, -5);
            ctx.lineTo(12, 0);
            ctx.lineTo(10, 5);
            ctx.fill();
            
            ctx.restore();
        } else if (isLevel2) { // Torch projectile
            ctx.fillStyle = '#78350F'; // Wood stick
            ctx.fillRect(b.pos.x, b.pos.y - 2, 15, 4);
            // Flame
            ctx.fillStyle = Math.random() > 0.5 ? '#F59E0B' : '#EF4444';
            ctx.beginPath(); ctx.arc(b.pos.x + (b.vel.x > 0 ? 15 : 0), b.pos.y, 6 + Math.random()*2, 0, Math.PI*2); ctx.fill();
        } else if (isLevel3) { // Lightning Ball
            ctx.fillStyle = '#FEF08A';
            ctx.beginPath(); ctx.arc(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2, b.size.x, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.pos.x - 5, b.pos.y - 5);
            ctx.lineTo(b.pos.x + 5, b.pos.y);
            ctx.lineTo(b.pos.x - 5, b.pos.y + 5);
            ctx.lineTo(b.pos.x + 5, b.pos.y + 10);
            ctx.stroke();
        } else { // Bullet
            ctx.fillStyle = COLORS.projectile; ctx.beginPath(); ctx.arc(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2, b.size.x/2, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 5. 绘制玩家 (Player) - 矢量可爱风格 (重构回原来的圆润风格)
    if (player.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
       ctx.globalAlpha = 0.5; 
    }
    
    // 应用挤压与拉伸 (Squash & Stretch)
    ctx.save();
    const pivotX = player.pos.x + player.size.x / 2;
    const pivotY = player.pos.y + player.size.y;
    ctx.translate(pivotX, pivotY);
    ctx.scale(player.renderScale.x, player.renderScale.y);
    ctx.translate(-pivotX, -pivotY);

    if (isSpaceLevel) { 
        // Astronaut Skin
        ctx.fillStyle = COLORS.astroSuit; ctx.beginPath(); ctx.roundRect(player.pos.x - 2, player.pos.y - 2, player.size.x + 4, player.size.y + 4, 8); ctx.fill();
        ctx.fillStyle = '#CBD5E1'; ctx.fillRect(player.facingRight ? player.pos.x - 6 : player.pos.x + player.size.x, player.pos.y + 5, 6, 15);
        ctx.fillStyle = COLORS.astroVisor; const faceX = player.facingRight ? player.pos.x + 8 : player.pos.x + 2; ctx.beginPath(); ctx.roundRect(faceX, player.pos.y + 4, 20, 14, 6); ctx.fill();
    } else { 
        // Base Bear Skin
        ctx.fillStyle = COLORS.bear;
        if (isLevel4) { 
            // Mermaid Tail
            const tailWiggle = Math.sin(Date.now() / 100) * 3; ctx.fillStyle = COLORS.tail; ctx.beginPath();
            if (player.facingRight) { ctx.moveTo(player.pos.x + 10, player.pos.y + 20); ctx.lineTo(player.pos.x - 10, player.pos.y + 35 + tailWiggle); ctx.lineTo(player.pos.x - 10, player.pos.y + 15 + tailWiggle); } 
            else { ctx.moveTo(player.pos.x + 20, player.pos.y + 20); ctx.lineTo(player.pos.x + 40, player.pos.y + 35 + tailWiggle); ctx.lineTo(player.pos.x + 40, player.pos.y + 15 + tailWiggle); }
            ctx.fill(); ctx.fillStyle = COLORS.bear; ctx.beginPath(); ctx.roundRect(player.pos.x, player.pos.y, player.size.x, 20, 5); ctx.fill();
        } else {
            // Normal Body
            if (isLevel6) ctx.fillStyle = COLORS.ninjaBody; // Ninja Suit
            ctx.beginPath(); ctx.roundRect(player.pos.x, player.pos.y, player.size.x, player.size.y, 6); ctx.fill();
            // Ears
            ctx.fillStyle = isLevel6 ? COLORS.ninjaBody : COLORS.bear;
            ctx.beginPath();
            ctx.arc(player.pos.x + 4, player.pos.y + 2, 5, 0, Math.PI * 2); // L Ear
            ctx.arc(player.pos.x + player.size.x - 4, player.pos.y + 2, 5, 0, Math.PI * 2); // R Ear
            ctx.fill();
        }
        
        // Face Area
        ctx.fillStyle = player.drunkTimer > 0 ? COLORS.bearFaceDrunk : COLORS.bearFace; 
        const faceX = player.facingRight ? player.pos.x + 12 : player.pos.x + 2; 
        
        if (isLevel6) {
             // Ninja Mask (Only eyes visible)
             ctx.fillStyle = '#FDE047'; // Skin tone for eyes
             ctx.fillRect(faceX, player.pos.y + 10, 16, 6);
        } else {
             ctx.beginPath(); ctx.roundRect(faceX, player.pos.y + 8, 16, 12, 4); ctx.fill();
        }
        
        // Eyes
        ctx.fillStyle = '#000'; 
        const eyeOffsetX = player.facingRight ? 4 : 0; 
        ctx.beginPath(); 
        ctx.arc(faceX + 4 + eyeOffsetX, player.pos.y + 11, 2, 0, Math.PI*2); // L Eye
        ctx.arc(faceX + 11 + eyeOffsetX, player.pos.y + 11, 2, 0, Math.PI*2); // R Eye
        ctx.fill();

        if (!isLevel6) {
            // Nose
            ctx.beginPath();
            ctx.ellipse(faceX + 7.5 + eyeOffsetX, player.pos.y + 15, 2.5, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- Accessories ---
        if (isLevel5) {
             // Archaeologist Hat
             ctx.fillStyle = '#78350F'; // Brown
             ctx.fillRect(player.pos.x - 5, player.pos.y - 5, player.size.x + 10, 6); // Brim
             ctx.fillRect(player.pos.x + 5, player.pos.y - 12, player.size.x - 10, 8); // Top
        } else if (isLevel6) {
             // Ninja Headband
             ctx.fillStyle = COLORS.ninjaSash;
             ctx.fillRect(player.pos.x, player.pos.y + 2, player.size.x, 4);
             // Flowing tails
             const tailY = player.pos.y + 4 + Math.sin(Date.now()/100)*2;
             if (player.facingRight) {
                 ctx.beginPath(); ctx.moveTo(player.pos.x, player.pos.y + 4); ctx.lineTo(player.pos.x - 15, tailY); ctx.lineTo(player.pos.x - 15, tailY + 5); ctx.fill();
             } else {
                 ctx.beginPath(); ctx.moveTo(player.pos.x + player.size.x, player.pos.y + 4); ctx.lineTo(player.pos.x + player.size.x + 15, tailY); ctx.lineTo(player.pos.x + player.size.x + 15, tailY + 5); ctx.fill();
             }
        }
    }
    
    ctx.restore();

    // Held Items
    if (!isLevel6 && !isSpaceLevel && !isHiddenLevel) { 
        // Default / Torch / Umbrella / Shovel
        const gunX = player.facingRight ? player.pos.x + 20 : player.pos.x - 5;
        const gunY = player.pos.y + 18;
        
        if (isLevel2) { // Torch
             ctx.fillStyle = '#78350F'; ctx.fillRect(gunX, gunY, 4, 12);
             ctx.fillStyle = Math.random() > 0.5 ? '#F59E0B' : '#EF4444';
             ctx.beginPath(); ctx.arc(gunX + 2, gunY - 2, 4, 0, Math.PI*2); ctx.fill();
        } else if (isLevel3) { // Umbrella
             ctx.fillStyle = '#374151'; // Pole
             ctx.fillRect(gunX, gunY - 10, 2, 20);
             ctx.fillStyle = '#6366F1'; // Top
             ctx.beginPath(); ctx.arc(gunX + 1, gunY - 10, 12, Math.PI, 0); ctx.fill();
        } else if (isLevel5) { // Shovel
             ctx.fillStyle = '#78350F';
             ctx.save(); ctx.translate(gunX, gunY); ctx.rotate(player.facingRight ? -0.5 : 0.5);
             ctx.fillRect(0, 0, 4, 15); ctx.fillStyle = '#94A3B8'; ctx.fillRect(-3, 15, 10, 8);
             ctx.restore();
        } else if (isLevel4) { // Harpoon Gun
             ctx.save(); ctx.translate(gunX, gunY); 
             if (!player.facingRight) ctx.scale(-1, 1);
             // Stock
             ctx.fillStyle = '#78350F'; ctx.fillRect(-5, 0, 10, 4);
             // Barrel
             ctx.fillStyle = '#9CA3AF'; ctx.fillRect(0, -2, 20, 3);
             // Trigger mech
             ctx.fillStyle = '#4B5563'; ctx.fillRect(0, 0, 5, 5);
             // Spear tip loaded
             ctx.fillStyle = COLORS.harpoonTip; ctx.beginPath(); ctx.moveTo(20, -0.5); ctx.lineTo(25, -0.5); ctx.stroke();
             ctx.restore();
        } else { // Gun
             ctx.fillStyle = COLORS.gun;
             ctx.fillRect(gunX, gunY, 15, 6);
        }
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();

    // === Post-Processing Overlays (Screen Space) ===
    if (weather === 'CAVE') {
         // Multi-light support for Cave
         const overlayCtx = overlayCanvasRef.current?.getContext('2d');
         if (overlayCtx && overlayCanvasRef.current) {
             overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
             
             // 1. Fill darkness
             overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.95)';
             overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
             
             // 2. Cut holes
             overlayCtx.globalCompositeOperation = 'destination-out';
             
             // Player Light
             const px = player.pos.x - cameraX + player.size.x / 2;
             const py = player.pos.y + player.size.y / 2;
             const pGrad = overlayCtx.createRadialGradient(px, py, 40, px, py, 250);
             pGrad.addColorStop(0, 'rgba(0,0,0,1)');
             pGrad.addColorStop(1, 'rgba(0,0,0,0)');
             overlayCtx.fillStyle = pGrad;
             overlayCtx.beginPath(); overlayCtx.arc(px, py, 250, 0, Math.PI*2); overlayCtx.fill();
             
             // Projectile Lights (Torches)
             if (isLevel2) {
                 bullets.forEach(b => {
                     const bx = b.pos.x - cameraX + b.size.x / 2;
                     const by = b.pos.y + b.size.y / 2;
                     // Skip if offscreen
                     if (bx < -50 || bx > CANVAS_WIDTH + 50) return;

                     const bGrad = overlayCtx.createRadialGradient(bx, by, 20, bx, by, 150);
                     bGrad.addColorStop(0, 'rgba(0,0,0,1)');
                     bGrad.addColorStop(1, 'rgba(0,0,0,0)');
                     overlayCtx.fillStyle = bGrad;
                     overlayCtx.beginPath(); overlayCtx.arc(bx, by, 150, 0, Math.PI*2); overlayCtx.fill();
                 });
             }

             overlayCtx.globalCompositeOperation = 'source-over';
             
             // Draw overlay to main canvas
             ctx.drawImage(overlayCanvasRef.current, 0, 0);
         }
    } else if (isSeaLevel) {
         // Simple vignette for sea
         const playerScreenX = player.pos.x - cameraX + player.size.x / 2;
         const playerScreenY = player.pos.y + player.size.y / 2;
         const gradient = ctx.createRadialGradient(playerScreenX, playerScreenY, 60, playerScreenX, playerScreenY, 500);
         gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,0.8)'); 
         ctx.fillStyle = gradient; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    const boss = entitiesRef.current.find(e => e.type === EntityType.ENEMY && e.maxHealth && e.maxHealth > 2 && Math.abs(e.pos.x - player.pos.x) < 500 && !e.isDead);
    if (boss) {
        const hpPct = (boss.health || 0) / (boss.maxHealth || 1);
        const barWidth = 400; const barX = (CANVAS_WIDTH - barWidth) / 2; const barY = CANVAS_HEIGHT - 30;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(barX - 2, barY - 2, barWidth + 4, 14);
        ctx.fillStyle = '#1F2937'; ctx.fillRect(barX, barY, barWidth, 10);
        ctx.fillStyle = '#DC2626'; ctx.fillRect(barX, barY, barWidth * hpPct, 10);
        ctx.fillStyle = '#FFF'; ctx.font = '10px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText("BOSS", barX + barWidth/2, barY - 5);
    }

    particlePoolRef.current.forEach(p => {
        if (!p.active) return;
        if (p.isScreenSpace) {
            // 屏幕空间绘制（雨/雪）
            if (p.color && (p.color.startsWith('rgba') || p.color === '#D97706' || p.color === '#FFFFFF')) {
                ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            } else if (p.alpha) {
                ctx.fillStyle = p.color || '#FFF'; ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
            }
        } else {
            // 世界空间绘制（需要手动减去相机偏移，因为现在是在restore之后）
            const screenX = p.x - cameraX + shakeX;
            const screenY = p.y + shakeY;
            
            if (screenX < -10 || screenX > CANVAS_WIDTH + 10) return;

            if (p.color && (p.color.startsWith('rgba') || p.color === '#D97706' || p.color === '#FFFFFF')) {
                ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2); ctx.fill();
            } else if (p.alpha) { 
                ctx.fillStyle = p.color || '#FFF'; ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
            } else { 
                ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
            }
        }
    });
    
    if (activeCheckpointRef.current && timeRef.current < 200) {
        ctx.fillStyle = '#FFF';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText("CHECKPOINT!", CANVAS_WIDTH/2, 100);
        ctx.textAlign = 'left';
    }
  };

  const loop = () => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState.status]);

  const handleTouchStart = (key: string) => { keysRef.current[key] = true; };
  const handleTouchEnd = (key: string) => { keysRef.current[key] = false; };

  return (
    <div className="relative w-full max-w-[800px] mx-auto">
        <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block bg-black rounded-lg shadow-2xl border-4 border-gray-700 w-full h-auto"
        style={{ imageRendering: 'pixelated' }}
        />
        
        {/* 移动端虚拟按键 */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-end pb-4 px-4 md:hidden">
            <div className="flex justify-between w-full pointer-events-auto">
                <div className="flex gap-4">
                    <button 
                        className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-white/40 touch-none"
                        onTouchStart={() => handleTouchStart('ArrowLeft')}
                        onTouchEnd={() => handleTouchEnd('ArrowLeft')}
                    >
                        <ArrowLeft className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-white/40 touch-none"
                        onTouchStart={() => handleTouchStart('ArrowRight')}
                        onTouchEnd={() => handleTouchEnd('ArrowRight')}
                    >
                        <ArrowRight className="w-8 h-8 text-white" />
                    </button>
                </div>
                <div className="flex gap-4">
                    <button 
                        className="w-16 h-16 bg-red-500/30 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-red-500/50 touch-none"
                        onTouchStart={() => {
                            keysRef.current['KeyF'] = true;
                            setTimeout(() => keysRef.current['KeyF'] = false, 100);
                        }}
                    >
                        <Crosshair className="w-8 h-8 text-white" />
                    </button>
                    <button 
                        className="w-16 h-16 bg-blue-500/30 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-blue-500/50 touch-none"
                        onTouchStart={() => {
                            keysRef.current['Space'] = true;
                            playerRef.current.jumpBufferTimer = JUMP_BUFFER;
                        }}
                        onTouchEnd={() => handleTouchEnd('Space')}
                    >
                        <ArrowUp className="w-8 h-8 text-white" />
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};
