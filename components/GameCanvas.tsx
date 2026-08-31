
import React, { useEffect, useRef } from 'react';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, TILE_SIZE, COLORS, PLAYER_WIDTH, PLAYER_HEIGHT, 
  MOVE_SPEED, JUMP_FORCE, TERMINAL_VELOCITY, PROJECTILE_SPEED, PROJECTILE_SIZE, SHOOT_COOLDOWN, 
  WINE_DURATION, WINE_SPEED_MULTIPLIER, WINE_JUMP_MULTIPLIER,
  ACCELERATION, FRICTION, AIR_FRICTION, COYOTE_TIME, JUMP_BUFFER,
  SWIM_SPEED, WATER_FRICTION, MELEE_RANGE, MELEE_DURATION, MELEE_COOLDOWN, VISUALS,
  MAX_SPAWNED_ENEMIES, STATS_SYNC_INTERVAL, ENTITY_CLEANUP_INTERVAL, SPATIAL_GRID_CELL_SIZE
} from '../constants';
import { Entity, Player, EntityType, GameStatus, GameState } from '../types';
import { levels } from '../levels';
import { audio } from '../audio';
import { ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react';
import {
  ParticlePool, MAX_PARTICLES, StatsBuffer, SpatialGrid,
  checkCollision, isInCameraRange,
  addShake, updateCameraDecay, updateCameraFollow,
  countLiveEnemies, compactDeadEntities, spawnEnemy as spawnEnemyFromSpawner,
  CameraState, Cloud, Tree, Planet, CaveSpike, SunRay, Trail,
} from '../engine';

interface GameCanvasProps {
  levelId: number;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onLevelComplete: () => void;
  onPlayerHit: () => void;
  onGameOver: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ levelId, gameState, setGameState, onLevelComplete, onPlayerHit, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null); // 离屏背景画布
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null); // 光照层
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
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, shake: 0, lookAheadOffset: 0 }); 
  const keysRef = useRef<{ [key: string]: boolean }>({}); 
  const timeRef = useRef<number>(0); 
  
  const hitStopRef = useRef<number>(0);
  const gamePadIndexRef = useRef<number | null>(null);
  const particlePoolRef = useRef(new ParticlePool(MAX_PARTICLES));
  const statsBufferRef = useRef(new StatsBuffer());
  const spatialGridRef = useRef(new SpatialGrid(SPATIAL_GRID_CELL_SIZE));
  const prevGameStatusRef = useRef(gameState.status);
  const gameStatusRef = useRef(gameState.status);
  const treesRightMostRef = useRef(CANVAS_WIDTH);

  const spawnParticle = (opts: Parameters<ParticlePool['spawn']>[0]) => particlePoolRef.current.spawn(opts);
  const deactivateParticle = (particle: Parameters<ParticlePool['deactivate']>[0]) => particlePoolRef.current.deactivate(particle);
  const queueStatsUpdate = (delta: { score?: number; coins?: number }) => statsBufferRef.current.queue(delta);
  const flushStats = () => statsBufferRef.current.flush(setGameState);
  
  // --- 视觉特效 Refs ---
  const trailsRef = useRef<Trail[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const treesRef = useRef<Tree[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const caveSpikesRef = useRef<CaveSpike[]>([]); 
  const sunRaysRef = useRef<SunRay[]>([]);

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
    treesRightMostRef.current = Math.max(CANVAS_WIDTH, ...treesRef.current.map(t => t.x));

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

    sunRaysRef.current = Array.from({ length: VISUALS.sunRayCount }).map(() => ({
        x: Math.random() * CANVAS_WIDTH,
        width: 50 + Math.random() * 100,
        angle: Math.PI / 4,
        speed: 0.2 + Math.random() * 0.3,
        alpha: 0.1 + Math.random() * 0.2
    }));

    particlePoolRef.current.reset();
    trailsRef.current = [];
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
    
    if (isSpaceLevel || weather === 'CAVE') {
        bgGradient.addColorStop(0, '#000000');
        bgGradient.addColorStop(1, '#111827');
    } else if (isSeaLevel) {
        bgGradient.addColorStop(0, '#0C4A6E'); 
        bgGradient.addColorStop(1, '#0284C7'); 
    } else if (weather === 'SUNNY' || isTrainLevel) { 
        // Train level uses Sunny sky
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
    
    if (!isSpaceLevel && !isSeaLevel && weather !== 'CAVE' && !isTrainLevel) {
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
    const lighting = document.createElement('canvas');
    lighting.width = CANVAS_WIDTH;
    lighting.height = CANVAS_HEIGHT;
    lightingCanvasRef.current = lighting;
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
    particlePoolRef.current.reset();
    statsBufferRef.current.reset();
    trailsRef.current = [];
    timeRef.current = 0;
    
    let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' | 'WARM' = 'NORMAL';
    if (newLevel.weather === 'CAVE') bgmType = 'CAVE';
    if (newLevel.weather === 'TOMB') bgmType = 'TOMB';
    if (newLevel.weather === 'SPACE') bgmType = 'SPACE';
    if (newLevel.weather === 'ARCTIC') bgmType = 'WARM'; 
    audio.startBGM(bgmType);
    
    return () => {
      flushStats();
      audio.stopBGM();
    }
  }, [levelId]);

  // --- 辅助函数 ---
  const handleDamage = (targetPlayer: Player) => {
    onPlayerHit();
    targetPlayer.isInvulnerable = true;
    targetPlayer.invulnerableTimer = 120;
    
    audio.playDamage();
    addShake(cameraRef.current, 5);
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
    gameStatusRef.current = gameState.status;

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
       const prevStatus = prevGameStatusRef.current;
       if (prevStatus === GameStatus.REVIVE_PROMPT || prevStatus === GameStatus.LEVEL_COMPLETE) {
           keysRef.current = {};
       }
       prevGameStatusRef.current = gameState.status;
       
       let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' | 'WARM' = 'NORMAL';
        if (levelRef.current.weather === 'CAVE') bgmType = 'CAVE';
        if (levelRef.current.weather === 'TOMB') bgmType = 'TOMB';
        if (levelRef.current.weather === 'SPACE') bgmType = 'SPACE';
        if (levelRef.current.weather === 'ARCTIC') bgmType = 'WARM';
        audio.startBGM(bgmType);
    } else {
       flushStats();
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
      spawnEnemyFromSpawner(spawner, {
          entities: entitiesRef.current,
          player: playerRef.current,
          liveEnemyCount: countLiveEnemies(entitiesRef.current),
          maxEnemies: MAX_SPAWNED_ENEMIES,
          onRoar: () => audio.playRoar(),
      });
  };

  // --- 更新环境逻辑 (粒子/背景) ---
  const updateEnvironment = () => {
    const player = playerRef.current;
    const weather = levelRef.current.weather;
    timeRef.current += 1;

    // 0. Sun Rays Logic
    sunRaysRef.current.forEach(ray => {
        ray.x -= ray.speed;
        if (ray.x + ray.width < -100) {
            ray.x = CANVAS_WIDTH + 100 + Math.random() * 200;
        }
    });

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
                 tree.x = treesRightMostRef.current + 300 + Math.random() * 400; 
                 tree.height = 100 + Math.random() * 150;
                 tree.y = CANVAS_HEIGHT - 30; 
                 treesRightMostRef.current = Math.max(treesRightMostRef.current, tree.x);
             }
        });
        
        if (particlePoolRef.current.activeCount < MAX_PARTICLES && Math.random() > 0.8) { 
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

    if (particlePoolRef.current.activeCount < MAX_PARTICLES) {
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

    particlePoolRef.current.pool.forEach(p => {
        if (!p.active) return;
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.color && !p.color.startsWith('rgba') && p.color !== '#D97706' && p.color !== '#FFFFFF') { 
            p.life -= 0.05;
            p.size *= 0.95; 
        } else if (weather === 'SEA' && p.y < 0) {
            deactivateParticle(p);
        }

        if (p.y > CANVAS_HEIGHT && weather !== 'SEA') {
           if (p.isScreenSpace) {
               // 循环雨雪
               p.y = -10; 
               p.x = Math.random() * CANVAS_WIDTH;
           } else {
               deactivateParticle(p);
           }
        } else if (p.life <= 0) {
           deactivateParticle(p);
        }
    });

    // Update trails
    trailsRef.current.forEach(t => t.alpha -= 0.1);
    trailsRef.current = trailsRef.current.filter(t => t.alpha > 0);
  };

  // --- 主更新循环 (Logic Loop) ---
  const update = () => {
    if (hitStopRef.current > 0) {
        hitStopRef.current--;
        return; 
    }

    pollGamepad();

    updateEnvironment();

    if (gameStatusRef.current !== GameStatus.PLAYING) return;

    if (timeRef.current % STATS_SYNC_INTERVAL === 0) {
        flushStats();
    }
    if (timeRef.current % ENTITY_CLEANUP_INTERVAL === 0) {
        entitiesRef.current = compactDeadEntities(entitiesRef.current, cameraRef.current.x);
    }

    const player = playerRef.current;
    const entities = entitiesRef.current;
    const bullets = bulletsRef.current;
    const spatialGrid = spatialGridRef.current;
    const cameraX = cameraRef.current.x;
    const weather = levelRef.current.weather;
    const isSeaLevel = weather === 'SEA';
    const isSpaceLevel = weather === 'SPACE'; 
    const isTombLevel = weather === 'TOMB';
    const isArcticLevel = weather === 'ARCTIC';
    const isHiddenLevel = levelId === 999;

    // Motion Trail Generation
    if (Math.abs(player.vel.x) > 4 || Math.abs(player.vel.y) > 4) {
        if (timeRef.current % 3 === 0) {
            trailsRef.current.push({
                x: player.pos.x,
                y: player.pos.y,
                facingRight: player.facingRight,
                alpha: 0.5,
                type: 'BEAR'
            });
        }
    }

    // 动画更新
    if (player.isGrounded) {
        if (Math.abs(player.vel.x) > 0.1) {
            player.animTimer = (player.animTimer || 0) + 1;
            if (player.animTimer > 5) {
                player.animTimer = 0;
                player.animFrame = (player.animFrame === 1) ? 2 : 1;
            }
        } else {
            // Idle breathing animation
            player.renderScale.y = 1 + Math.sin(timeRef.current / 20) * 0.02;
            player.renderScale.x = 1 + Math.cos(timeRef.current / 20) * 0.02;
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
    
    updateCameraDecay(cameraRef.current);

    if (player.shootCooldown > 0) player.shootCooldown--;
    
    spatialGrid.rebuild(entities);

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
        addShake(cameraRef.current, 2); 
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
        const bulletCandidates = spatialGrid.queryRect(b.pos.x, b.pos.y, b.size.x, b.size.y, 100);

        for (const ent of bulletCandidates) {
            if (ent.isDead) continue; 
            if (!isInCameraRange(ent, cameraX, CANVAS_WIDTH, 100)) continue;

            if (ent.type === EntityType.ENEMY) {
                if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) continue;

                if (checkCollision(b, ent)) {
                    bulletHit = true;
                    ent.health = (ent.health || 1) - 1;
                    if (ent.health <= 0) {
                        ent.isDead = true;
                        const bonus = (ent.enemyVariant === 'TANK' || ent.enemyVariant === 'ZOMBIE' || ent.enemyVariant === 'UFO' ? 500 : 200);
                        queueStatsUpdate({ score: bonus });
                        audio.playKill();
                        addShake(cameraRef.current, 10);
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
                        addShake(cameraRef.current, 2);
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
                         addShake(cameraRef.current, 5);
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

    const wallQueryBuffer = 200;
    const horizontalWallCandidates = spatialGrid.queryRect(
      player.pos.x, player.pos.y, player.size.x, player.size.y, wallQueryBuffer,
    );

    for (const ent of horizontalWallCandidates) {
      if (ent.isDead) continue; 
      if (ent.type !== EntityType.PLATFORM && ent.type !== EntityType.BREAKABLE_WALL) continue;

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

    player.pos.y += player.vel.y;

    let landed = false;
    const verticalWallCandidates = spatialGrid.queryRect(
      player.pos.x, player.pos.y, player.size.x, player.size.y, wallQueryBuffer,
    );

    for (const ent of verticalWallCandidates) {
      if (ent.isDead) continue; 
      if (ent.type !== EntityType.PLATFORM && ent.type !== EntityType.BREAKABLE_WALL) continue;

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

    spatialGrid.rebuild(entities);
    const activeEntities = spatialGrid.queryViewport(
      cameraRef.current.x, CANVAS_WIDTH, levelRef.current.height, wallQueryBuffer,
    );

    activeEntities.forEach(ent => {
      if (ent.isDead) return;

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
          queueStatsUpdate({ score: 100, coins: 1 });
          audio.playCoin();
        } else if (ent.type === EntityType.WINE) {
          ent.isDead = true;
          player.drunkTimer = WINE_DURATION;
          audio.playPowerUp();
          queueStatsUpdate({ score: 500 });
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
            queueStatsUpdate({ score: 200 });
            audio.playKill();
            addShake(cameraRef.current, 5);
            hitStopRef.current = 4; 
          } else {
             if (!player.isInvulnerable) handleDamage(player);
          }
        }
      }
    });

    updateCameraFollow(cameraRef.current, player, levelRef.current.width);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const physicalWidth = Math.floor(CANVAS_WIDTH * dpr);
    const physicalHeight = Math.floor(CANVAS_HEIGHT * dpr);

    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

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

    // === 1. 绘制背景 (Background) ===
    if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    const shakeX = (Math.random() - 0.5) * cameraRef.current.shake;
    const shakeY = (Math.random() - 0.5) * cameraRef.current.shake;

    // === 2. 绘制动态远景 (Parallax) ===
    
    // Sun Rays (Atmospheric)
    if (weather === 'SUNNY' || weather === 'ARCTIC' || isTrainLevel) { // Added train level for sun rays
        ctx.save();
        sunRaysRef.current.forEach(ray => {
            const gradient = ctx.createLinearGradient(ray.x, 0, ray.x - Math.tan(ray.angle) * CANVAS_HEIGHT, CANVAS_HEIGHT);
            gradient.addColorStop(0, VISUALS.sunRayColor);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(ray.x, 0);
            ctx.lineTo(ray.x + ray.width, 0);
            ctx.lineTo(ray.x + ray.width - Math.tan(ray.angle) * CANVAS_HEIGHT, CANVAS_HEIGHT);
            ctx.lineTo(ray.x - Math.tan(ray.angle) * CANVAS_HEIGHT, CANVAS_HEIGHT);
            ctx.fill();
        });
        ctx.restore();
    }

    if (isSpaceLevel) {
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 50; i++) { 
            const starX = (i * 123 + cameraX * 0.05) % CANVAS_WIDTH; 
            const starY = (i * 87) % CANVAS_HEIGHT;
            ctx.globalAlpha = ((i * 17) % 10) / 10 * 0.5 + 0.3;
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

    spatialGridRef.current.rebuild(entitiesRef.current);
    const visibleEntities = spatialGridRef.current.queryViewport(
      cameraX, CANVAS_WIDTH, levelRef.current.height, 200,
    );

    // === 3. 绘制阴影 (Shadows Pass) ===
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    visibleEntities.forEach(ent => {
        if (ent.isDead) return;

        if (ent.type === EntityType.PLAYER || ent.type === EntityType.ENEMY || ent.type === EntityType.TROPHY || ent.type === EntityType.CHECKPOINT) {
             ctx.beginPath();
             ctx.ellipse(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y - 2, ent.size.x/2, 4, 0, 0, Math.PI*2);
             ctx.fill();
        }
    });

    // === 4. 绘制实体 (Entities Pass) ===
    visibleEntities.forEach(ent => {
      if (ent.isDead) return;
      if (ent.type === EntityType.SPAWNER) return;
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
                 ctx.shadowBlur = 50; 
                 ctx.shadowColor = '#60A5FA'; 
                 ctx.fillStyle = '#1E3A8A'; ctx.beginPath(); ctx.arc(earthX, earthY, radius, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.ellipse(earthX, earthY - 200, 220, 80, 0, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#15803D'; ctx.beginPath(); ctx.arc(earthX - 100, earthY + 50, 60, 0, Math.PI*2); ctx.fill(); 
                 ctx.beginPath(); ctx.arc(earthX + 150, earthY + 100, 80, 0, Math.PI*2); ctx.fill();
                 ctx.lineWidth = 5; ctx.strokeStyle = '#93C5FD'; ctx.beginPath(); ctx.arc(earthX, earthY, radius, 0, Math.PI*2); ctx.stroke(); 
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
            ctx.fillStyle = COLORS.trainWindow;
            for(let i = 10; i < ent.size.x - 30; i += 50) {
                ctx.fillRect(ent.pos.x + i, ent.pos.y + 10, 30, 15);
            }
        } else {
            // PROCEDURAL TERRAIN RENDERING
            // Base
            ctx.fillStyle = levelRef.current.groundColor || COLORS.groundDark;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            
            // Stone/Dirt Texture (Noise)
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            const seed = ent.pos.x; // Deterministic random based on position
            for(let i = 0; i < ent.size.x; i+= 15) {
                for(let j=10; j < ent.size.y; j+= 15) {
                     if (((seed + i * j) % 7) > 3) {
                         ctx.fillRect(ent.pos.x + i, ent.pos.y + j, 6, 6);
                     }
                }
            }

            // Top Layer (Grass/Ice)
            if (ent.size.y > 10) {
               const topColor = levelRef.current.groundColor ? (levelRef.current.groundColor === COLORS.ice ? '#D6F2FE' : '#65A30D') : COLORS.dirt;
               ctx.fillStyle = !levelRef.current.groundColor ? COLORS.groundTop : topColor;
               ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, 10);

               // Procedural Grass Blades
               if (!levelRef.current.groundColor || levelRef.current.groundColor === COLORS.ground) {
                   ctx.fillStyle = COLORS.groundTop;
                   for(let g = 0; g < ent.size.x; g += 8) {
                       const h = 4 + ((g + ent.pos.x) % 5); 
                       ctx.fillRect(ent.pos.x + g, ent.pos.y - h, 4, h);
                   }
               }
            }
        }
      } 
      else if (ent.type === EntityType.BREAKABLE_WALL) {
          ctx.fillStyle = COLORS.sandWall; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
          ctx.strokeStyle = '#B45309'; ctx.lineWidth = 2; ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
          // Texture
          ctx.fillStyle = '#B45309';
          ctx.beginPath();
          ctx.moveTo(ent.pos.x + 10, ent.pos.y + 10); ctx.lineTo(ent.pos.x + ent.size.x - 10, ent.pos.y + ent.size.y - 10);
          ctx.moveTo(ent.pos.x + ent.size.x - 10, ent.pos.y + 10); ctx.lineTo(ent.pos.x + 10, ent.pos.y + ent.size.y - 10);
          ctx.stroke();
      }
      else if (ent.type === EntityType.COIN) {
        ctx.shadowBlur = 10; ctx.shadowColor = COLORS.coinShine;
        ctx.fillStyle = COLORS.coin; ctx.beginPath(); ctx.arc(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y/2, ent.size.x/2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      else if (ent.type === EntityType.CHECKPOINT) {
          ctx.fillStyle = '#9CA3AF'; ctx.fillRect(ent.pos.x + 5, ent.pos.y, 4, 40);
          ctx.fillStyle = ent.isChecked ? '#10B981' : '#EF4444'; 
          ctx.shadowBlur = ent.isChecked ? 15 : 0; ctx.shadowColor = ent.isChecked ? '#10B981' : 'transparent';
          ctx.beginPath(); ctx.moveTo(ent.pos.x + 9, ent.pos.y + 2); ctx.lineTo(ent.pos.x + 35, ent.pos.y + 10); ctx.lineTo(ent.pos.x + 9, ent.pos.y + 18); ctx.fill();
          if (ent.isChecked) { ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2; ctx.stroke(); }
          ctx.shadowBlur = 0;
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
             const hx = ent.pos.x + 10; const hy = ent.pos.y + 40;
             ctx.fillStyle = '#78350F'; ctx.fillRect(hx, hy, 80, 60);
             ctx.fillStyle = '#991B1B'; ctx.beginPath(); ctx.moveTo(hx - 10, hy); ctx.lineTo(hx + 40, hy - 40); ctx.lineTo(hx + 90, hy); ctx.fill();
             ctx.fillStyle = '#D97706'; ctx.fillRect(hx + 30, hy + 20, 20, 40);
             ctx.fillStyle = '#F59E0B'; ctx.beginPath(); ctx.arc(hx + 45, hy + 40, 2, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#FDE047'; ctx.fillRect(hx + 10, hy + 10, 15, 15); ctx.fillRect(hx + 55, hy + 10, 15, 15);
             const smokeY = hy - 50 - (Date.now() % 1000) / 20;
             ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(hx + 60, smokeY, 5 + Math.sin(Date.now()/200)*2, 0, Math.PI*2); ctx.fill();
         } else {
             ctx.fillStyle = '#5D4037'; ctx.fillRect(ent.pos.x, ent.pos.y + 30, 40, 10);
             ctx.fillStyle = '#8D6E63'; ctx.fillRect(ent.pos.x - 5, ent.pos.y + 25, 50, 5);
             ctx.shadowBlur = 15; ctx.shadowColor = '#FDE047';
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
             const isMovingRight = ent.vel.x > 0.1;
             const isMovingLeft = ent.vel.x < -0.1;
             const isFacingLeft = isMovingLeft || (!isMovingRight && true); 
             
             ctx.save();
             if (!isFacingLeft) {
                 ctx.translate(ent.pos.x + ent.size.x, ent.pos.y); ctx.scale(-1, 1); ctx.translate(-(ent.pos.x + ent.size.x), -ent.pos.y);
             }
             ctx.fillStyle = COLORS.bear;
             ctx.beginPath(); ctx.roundRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y, 6); ctx.fill();
             ctx.beginPath(); ctx.arc(ent.pos.x + 4, ent.pos.y + 2, 5, 0, Math.PI * 2); ctx.arc(ent.pos.x + ent.size.x - 4, ent.pos.y + 2, 5, 0, Math.PI * 2); ctx.fill();
             ctx.fillStyle = COLORS.bearFace;
             const faceWidth = ent.size.x * 0.55; const faceHeight = ent.size.y * 0.4; const faceX = ent.pos.x + 2; const faceY = ent.pos.y + ent.size.y * 0.25;
             ctx.beginPath(); ctx.roundRect(faceX, faceY, faceWidth, faceHeight, 4); ctx.fill();
             ctx.fillStyle = '#000'; const eyeY = faceY + faceHeight * 0.4; const eyeSize = Math.max(1.5, ent.size.x * 0.08); 
             ctx.beginPath(); ctx.arc(faceX + 4, eyeY, eyeSize, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(faceX + faceWidth - 4, eyeY, eyeSize, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.ellipse(faceX + faceWidth/2 - 2, eyeY + 4, eyeSize, eyeSize*0.6, 0, 0, Math.PI*2); ctx.fill();

             if (ent.enemyVariant === 'FAMILY_DAD') {
                 ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
                 ctx.beginPath(); ctx.arc(faceX + 4, eyeY, eyeSize + 1, 0, Math.PI*2); ctx.stroke();
                 ctx.beginPath(); ctx.arc(faceX + faceWidth - 4, eyeY, eyeSize + 1, 0, Math.PI*2); ctx.stroke();
                 ctx.beginPath(); ctx.moveTo(faceX + 4 + eyeSize + 1, eyeY); ctx.lineTo(faceX + faceWidth - 4 - eyeSize - 1, eyeY); ctx.stroke();
             } else if (ent.enemyVariant === 'FAMILY_MOM') {
                 ctx.fillStyle = '#DC2626'; ctx.fillRect(ent.pos.x + 2, ent.pos.y + ent.size.y * 0.65, ent.size.x - 4, 4);
                 ctx.beginPath(); ctx.moveTo(ent.pos.x + ent.size.x - 2, ent.pos.y + ent.size.y * 0.65); ctx.quadraticCurveTo(ent.pos.x + ent.size.x + 10, ent.pos.y + ent.size.y * 0.7, ent.pos.x + ent.size.x + 15, ent.pos.y + ent.size.y * 0.8 + Math.sin(time/200)*3); ctx.lineTo(ent.pos.x + ent.size.x - 2, ent.pos.y + ent.size.y * 0.75); ctx.fill();
             }
             ctx.restore();
         }
         else if (ent.enemyVariant === 'BAT' || ent.enemyVariant === 'BIRD') {
             const isBird = ent.enemyVariant === 'BIRD';
             const flap = Math.sin(time / 50) * 8;
             ctx.fillStyle = isBird ? '#FFF' : COLORS.enemyBat; 
             ctx.beginPath(); ctx.ellipse(cx, cy, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
             ctx.fillStyle = isBird ? '#93C5FD' : '#000';
             ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx - 20, cy - 10 + flap); ctx.lineTo(cx - 10, cy + 5); ctx.fill();
             ctx.beginPath(); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 20, cy - 10 + flap); ctx.lineTo(cx + 10, cy + 5); ctx.fill();
             ctx.fillStyle = isBird ? '#000' : '#F59E0B';
             ctx.beginPath(); ctx.arc(cx - 4, cy - 2, isBird ? 2 : 1.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 4, cy - 2, isBird ? 2 : 1.5, 0, Math.PI*2); ctx.fill();
             if (isBird) {
                 ctx.fillStyle = '#F59E0B'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (ent.vel.x > 0 ? 8 : -8), cy + 2); ctx.lineTo(cx, cy + 4); ctx.fill();
             }
         } 
         else if (ent.enemyVariant === 'FISH') {
             ctx.fillStyle = COLORS.enemyFish;
             ctx.beginPath(); ctx.ellipse(cx, cy, 16, 10, 0, 0, Math.PI*2); ctx.fill();
             const tailWag = Math.sin(time / 100) * 3;
             ctx.beginPath();
             if (ent.vel.x > 0) { ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 24, cy - 6 + tailWag); ctx.lineTo(cx - 24, cy + 6 + tailWag); } 
             else { ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 24, cy - 6 + tailWag); ctx.lineTo(cx + 24, cy + 6 + tailWag); }
             ctx.fill();
             ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(cx + (ent.vel.x > 0 ? 8 : -8), cy - 2, 4, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx + (ent.vel.x > 0 ? 9 : -9), cy - 2, 1.5, 0, Math.PI*2); ctx.fill();
         }
         else if (ent.enemyVariant === 'SLIME') {
             ctx.fillStyle = COLORS.enemySlime; const wobble = Math.sin(time / 150) * 2;
             ctx.beginPath(); ctx.arc(cx, cy + 5, 12 + wobble, Math.PI, 0); ctx.lineTo(ent.pos.x + ent.size.x, ent.pos.y + ent.size.y); ctx.lineTo(ent.pos.x, ent.pos.y + ent.size.y); ctx.fill();
             ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(cx - 5, cy, 3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 5, cy, 3, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx - 5, cy, 1, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 5, cy, 1, 0, Math.PI*2); ctx.fill();
         }
         else if (ent.enemyVariant === 'TANK' || ent.enemyVariant === 'SKELETON' || ent.enemyVariant === 'MUMMY' || ent.enemyVariant === 'ZOMBIE') {
             if (ent.enemyVariant === 'TANK') {
                 ctx.fillStyle = '#52525B'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
                 ctx.fillStyle = '#3F3F46'; ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 10, ent.size.x, 10); 
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 5, ent.pos.y + 10, ent.size.x - 10, 5); 
                 ctx.fillStyle = '#EF4444'; ctx.fillRect(ent.pos.x + 15, ent.pos.y + 10, 4, 5); 
             } else if (ent.enemyVariant === 'SKELETON') {
                 ctx.fillStyle = '#E2E8F0'; ctx.fillRect(ent.pos.x + 8, ent.pos.y, 14, 14); 
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 10, ent.pos.y + 4, 3, 3); ctx.fillRect(ent.pos.x + 17, ent.pos.y + 4, 3, 3); 
                 ctx.fillStyle = '#E2E8F0'; ctx.fillRect(ent.pos.x + 12, ent.pos.y + 14, 6, 20); ctx.fillRect(ent.pos.x + 4, ent.pos.y + 18, 22, 2); ctx.fillRect(ent.pos.x + 6, ent.pos.y + 22, 18, 2); 
             } else if (ent.enemyVariant === 'MUMMY') {
                 ctx.fillStyle = '#FDE68A'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
                 ctx.fillStyle = '#D97706'; for(let i=5; i<ent.size.y; i+=8) ctx.fillRect(ent.pos.x, ent.pos.y + i, ent.size.x, 2);
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + 5, ent.pos.y + 10, 20, 6); 
                 ctx.fillStyle = '#EF4444'; ctx.fillRect(ent.pos.x + 8, ent.pos.y + 12, 3, 3); ctx.fillRect(ent.pos.x + 18, ent.pos.y + 12, 3, 3);
             } else if (ent.enemyVariant === 'ZOMBIE') {
                 ctx.fillStyle = '#4D7C0F'; ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y); 
                 ctx.fillStyle = '#3F6212'; ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 15, ent.size.x, 15); 
                 ctx.fillStyle = '#4D7C0F'; if (ent.vel.x > 0) ctx.fillRect(ent.pos.x + ent.size.x, ent.pos.y + 15, 10, 6); else ctx.fillRect(ent.pos.x - 10, ent.pos.y + 15, 10, 6);
                 ctx.fillStyle = '#000'; ctx.fillRect(ent.pos.x + (ent.vel.x > 0 ? 18 : 4), ent.pos.y + 8, 4, 4); 
                 ctx.fillStyle = '#DC2626'; ctx.fillRect(ent.pos.x + (ent.vel.x > 0 ? 18 : 4), ent.pos.y + 18, 6, 2); 
             }
         }
         else if (ent.enemyVariant === 'ALIEN' || ent.enemyVariant === 'UFO') {
             if (ent.enemyVariant === 'UFO') {
                 ctx.fillStyle = '#94A3B8'; ctx.beginPath(); ctx.ellipse(cx, cy + 5, 20, 8, 0, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#60A5FA'; ctx.beginPath(); ctx.arc(cx, cy - 2, 10, Math.PI, 0); ctx.fill();
                 const blink = Math.floor(time / 200) % 2 === 0; ctx.fillStyle = blink ? '#FACC15' : '#EF4444';
                 ctx.beginPath(); ctx.arc(cx - 12, cy + 5, 2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + 8, 2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 12, cy + 5, 2, 0, Math.PI*2); ctx.fill();
             } else {
                 ctx.fillStyle = '#84CC16'; ctx.beginPath(); ctx.arc(cx, cy - 5, 10, 0, Math.PI*2); ctx.fill(); ctx.fillRect(cx - 5, cy, 10, 15); 
                 ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx - 4, cy - 5, 3, 5, -0.2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 4, cy - 5, 3, 5, 0.2, 0, Math.PI*2); ctx.fill();
             }
         }
         else {
             ctx.fillStyle = '#B45309'; ctx.beginPath(); 
             ctx.moveTo(ent.pos.x + 5, ent.pos.y + ent.size.y); ctx.lineTo(ent.pos.x, ent.pos.y + 10); ctx.quadraticCurveTo(ent.pos.x + ent.size.x/2, ent.pos.y - 5, ent.pos.x + ent.size.x, ent.pos.y + 10); ctx.lineTo(ent.pos.x + ent.size.x - 5, ent.pos.y + ent.size.y); ctx.fill();
             const step = Math.floor(time / 100) % 2; ctx.fillStyle = '#000';
             if (step === 0) { ctx.fillRect(ent.pos.x - 2, ent.pos.y + ent.size.y - 6, 8, 6); ctx.fillRect(ent.pos.x + ent.size.x - 6, ent.pos.y + ent.size.y - 6, 8, 6); } else { ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y - 6, 8, 6); ctx.fillRect(ent.pos.x + ent.size.x - 8, ent.pos.y + ent.size.y - 6, 8, 6); }
             ctx.fillStyle = '#FFF'; const eyeY = ent.pos.y + 10; const eyeOffset = ent.vel.x > 0 ? 4 : -4; ctx.beginPath(); ctx.arc(cx - 5 + eyeOffset, eyeY, 4, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 5 + eyeOffset, eyeY, 4, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx - 5 + eyeOffset + (ent.vel.x>0?1:-1), eyeY, 1.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 5 + eyeOffset + (ent.vel.x>0?1:-1), eyeY, 1.5, 0, Math.PI*2); ctx.fill();
         }
      }
    });

    // Draw Bullets
    bullets.forEach(b => {
        // Glow for projectiles
        ctx.shadowBlur = 15; ctx.shadowColor = '#F43F5E';
        if (isLevel5) { 
            ctx.save(); ctx.translate(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2); ctx.rotate((Date.now() / 50) % (Math.PI * 2));
            ctx.fillStyle = COLORS.shovelHandle; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = COLORS.shovel; ctx.fillRect(5, -6, 12, 12); ctx.restore();
        } else if (isLevel7) { 
            ctx.strokeStyle = COLORS.laserBeam; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y); ctx.lineTo(b.pos.x + (b.vel.x > 0 ? 40 : -40), b.pos.y); ctx.stroke();
        } else if (isLevel6) { 
             ctx.save(); ctx.translate(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2); ctx.rotate((Date.now() / 30) % (Math.PI * 2));
             ctx.fillStyle = COLORS.shuriken; ctx.beginPath(); for(let i=0; i<4; i++) { ctx.rotate(Math.PI/2); ctx.moveTo(0, 0); ctx.lineTo(10, 3); ctx.lineTo(0, 6); ctx.lineTo(-10, 3); } ctx.fill(); ctx.restore();
        } else if (isLevel4) { 
            ctx.save(); ctx.translate(b.pos.x, b.pos.y); if (b.vel.x < 0) ctx.scale(-1, 1);
            ctx.fillStyle = COLORS.harpoonShaft; ctx.fillRect(-10, -2, 30, 4); ctx.fillStyle = COLORS.harpoonTip; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(10, -5); ctx.lineTo(12, 0); ctx.lineTo(10, 5); ctx.fill(); ctx.restore();
        } else if (isLevel2) { 
            ctx.fillStyle = '#78350F'; ctx.fillRect(b.pos.x, b.pos.y - 2, 15, 4); ctx.fillStyle = Math.random() > 0.5 ? '#F59E0B' : '#EF4444'; ctx.beginPath(); ctx.arc(b.pos.x + (b.vel.x > 0 ? 15 : 0), b.pos.y, 6 + Math.random()*2, 0, Math.PI*2); ctx.fill();
        } else if (isLevel3) { 
            ctx.fillStyle = '#FEF08A'; ctx.beginPath(); ctx.arc(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2, b.size.x, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.pos.x - 5, b.pos.y - 5); ctx.lineTo(b.pos.x + 5, b.pos.y); ctx.lineTo(b.pos.x - 5, b.pos.y + 5); ctx.lineTo(b.pos.x + 5, b.pos.y + 10); ctx.stroke();
        } else { 
            ctx.fillStyle = COLORS.projectile; ctx.beginPath(); ctx.arc(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2, b.size.x/2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
    });

    // 5. 绘制玩家 (Player)
    if (player.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
       ctx.globalAlpha = 0.5; 
    }

    // Motion Trails
    trailsRef.current.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.alpha * 0.3;
        ctx.translate(t.x + player.size.x/2, t.y + player.size.y);
        ctx.scale(t.facingRight ? 1 : -1, 1); // Not quite right if player flipped scale
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.roundRect(-player.size.x/2, -player.size.y, player.size.x, player.size.y, 6);
        ctx.fill();
        ctx.restore();
    });
    
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
            if (isLevel6) ctx.fillStyle = COLORS.ninjaBody; 
            ctx.beginPath(); ctx.roundRect(player.pos.x, player.pos.y, player.size.x, player.size.y, 6); ctx.fill();
            ctx.fillStyle = isLevel6 ? COLORS.ninjaBody : COLORS.bear;
            ctx.beginPath(); ctx.arc(player.pos.x + 4, player.pos.y + 2, 5, 0, Math.PI * 2); ctx.arc(player.pos.x + player.size.x - 4, player.pos.y + 2, 5, 0, Math.PI * 2); ctx.fill();
        }
        
        ctx.fillStyle = player.drunkTimer > 0 ? COLORS.bearFaceDrunk : COLORS.bearFace; 
        const faceX = player.facingRight ? player.pos.x + 12 : player.pos.x + 2; 
        
        if (isLevel6) {
             ctx.fillStyle = '#FDE047'; ctx.fillRect(faceX, player.pos.y + 10, 16, 6);
        } else {
             ctx.beginPath(); ctx.roundRect(faceX, player.pos.y + 8, 16, 12, 4); ctx.fill();
        }
        
        ctx.fillStyle = '#000'; const eyeOffsetX = player.facingRight ? 4 : 0; 
        ctx.beginPath(); ctx.arc(faceX + 4 + eyeOffsetX, player.pos.y + 11, 2, 0, Math.PI*2); ctx.arc(faceX + 11 + eyeOffsetX, player.pos.y + 11, 2, 0, Math.PI*2); ctx.fill();

        if (!isLevel6) {
            ctx.beginPath(); ctx.ellipse(faceX + 7.5 + eyeOffsetX, player.pos.y + 15, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        }

        if (isLevel5) {
             ctx.fillStyle = '#78350F'; ctx.fillRect(player.pos.x - 5, player.pos.y - 5, player.size.x + 10, 6); ctx.fillRect(player.pos.x + 5, player.pos.y - 12, player.size.x - 10, 8);
        } else if (isLevel6) {
             ctx.fillStyle = COLORS.ninjaSash; ctx.fillRect(player.pos.x, player.pos.y + 2, player.size.x, 4);
             const tailY = player.pos.y + 4 + Math.sin(Date.now()/100)*2;
             if (player.facingRight) { ctx.beginPath(); ctx.moveTo(player.pos.x, player.pos.y + 4); ctx.lineTo(player.pos.x - 15, tailY); ctx.lineTo(player.pos.x - 15, tailY + 5); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(player.pos.x + player.size.x, player.pos.y + 4); ctx.lineTo(player.pos.x + player.size.x + 15, tailY); ctx.lineTo(player.pos.x + player.size.x + 15, tailY + 5); ctx.fill(); }
        }
    }
    
    ctx.restore();

    if (!isLevel6 && !isSpaceLevel && !isHiddenLevel) { 
        const gunX = player.facingRight ? player.pos.x + 20 : player.pos.x - 5; const gunY = player.pos.y + 18;
        if (isLevel2) { 
             ctx.fillStyle = '#78350F'; ctx.fillRect(gunX, gunY, 4, 12); ctx.fillStyle = Math.random() > 0.5 ? '#F59E0B' : '#EF4444'; ctx.beginPath(); ctx.arc(gunX + 2, gunY - 2, 4, 0, Math.PI*2); ctx.fill();
        } else if (isLevel3) { 
             ctx.fillStyle = '#374151'; ctx.fillRect(gunX, gunY - 10, 2, 20); ctx.fillStyle = '#6366F1'; ctx.beginPath(); ctx.arc(gunX + 1, gunY - 10, 12, Math.PI, 0); ctx.fill();
        } else if (isLevel5) { 
             ctx.fillStyle = '#78350F'; ctx.save(); ctx.translate(gunX, gunY); ctx.rotate(player.facingRight ? -0.5 : 0.5); ctx.fillRect(0, 0, 4, 15); ctx.fillStyle = '#94A3B8'; ctx.fillRect(-3, 15, 10, 8); ctx.restore();
        } else if (isLevel4) { 
             ctx.save(); ctx.translate(gunX, gunY); if (!player.facingRight) ctx.scale(-1, 1);
             ctx.fillStyle = '#78350F'; ctx.fillRect(-5, 0, 10, 4); ctx.fillStyle = '#9CA3AF'; ctx.fillRect(0, -2, 20, 3); ctx.fillStyle = '#4B5563'; ctx.fillRect(0, 0, 5, 5); ctx.fillStyle = COLORS.harpoonTip; ctx.beginPath(); ctx.moveTo(20, -0.5); ctx.lineTo(25, -0.5); ctx.stroke(); ctx.restore();
        } else { 
             ctx.fillStyle = COLORS.gun; ctx.fillRect(gunX, gunY, 15, 6);
        }
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();

    // === Post-Processing: Lighting Overlay ===
    const overlayCtx = lightingCanvasRef.current?.getContext('2d');
    if (overlayCtx && lightingCanvasRef.current) {
        overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Base Ambient Darkness
        let ambientDarkness = 0.05; // Bright Day
        if (weather === 'CAVE') ambientDarkness = 0.85; // Reduced from 0.95
        if (weather === 'TOMB') ambientDarkness = 0.7;  // Reduced from 0.8
        if (weather === 'SPACE') ambientDarkness = 0.3; // Reduced significantly from 0.6
        if (weather === 'TRAIN') ambientDarkness = 0.1; // Reduced significantly from 0.7 for Daylight
        if (weather === 'RAIN') ambientDarkness = 0.4;
        
        overlayCtx.fillStyle = `rgba(0, 0, 0, ${ambientDarkness})`;
        overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Cut out lights
        overlayCtx.globalCompositeOperation = 'destination-out';
        
        // Player Light
        const px = player.pos.x - cameraX + player.size.x / 2 + shakeX;
        const py = player.pos.y + player.size.y / 2 + shakeY;
        const radius = weather === 'CAVE' ? 250 : 150;
        
        const pGrad = overlayCtx.createRadialGradient(px, py, 20, px, py, radius);
        pGrad.addColorStop(0, 'rgba(0,0,0,1)');
        pGrad.addColorStop(1, 'rgba(0,0,0,0)');
        overlayCtx.fillStyle = pGrad;
        overlayCtx.beginPath(); overlayCtx.arc(px, py, radius, 0, Math.PI*2); overlayCtx.fill();
        
        // Bullet Lights
        bullets.forEach(b => {
             // Shovels (Level 5) and Shurikens (Level 6) do not emit light
             if (isLevel5 || isLevel6) return;

             const bx = b.pos.x - cameraX + b.size.x / 2 + shakeX;
             const by = b.pos.y + b.size.y / 2 + shakeY;
             if (bx < -50 || bx > CANVAS_WIDTH + 50) return;
             const bGrad = overlayCtx.createRadialGradient(bx, by, 10, bx, by, 100);
             bGrad.addColorStop(0, 'rgba(0,0,0,1)');
             bGrad.addColorStop(1, 'rgba(0,0,0,0)');
             overlayCtx.fillStyle = bGrad;
             overlayCtx.beginPath(); overlayCtx.arc(bx, by, 100, 0, Math.PI*2); overlayCtx.fill();
        });

        // Collectable Lights (Coins, Checkpoints)
        visibleEntities.forEach(e => {
            if (e.isDead) return;
            const ex = e.pos.x - cameraX + e.size.x/2 + shakeX;
            const ey = e.pos.y + e.size.y/2 + shakeY;
            if (ex < -50 || ex > CANVAS_WIDTH + 50) return;

            if (e.type === EntityType.COIN || e.type === EntityType.CHECKPOINT || e.type === EntityType.POTION || e.type === EntityType.WINE) {
                const glowSize = 60;
                const cGrad = overlayCtx.createRadialGradient(ex, ey, 5, ex, ey, glowSize);
                cGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
                cGrad.addColorStop(1, 'rgba(0,0,0,0)');
                overlayCtx.fillStyle = cGrad;
                overlayCtx.beginPath(); overlayCtx.arc(ex, ey, glowSize, 0, Math.PI*2); overlayCtx.fill();
            }
        });

        overlayCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(lightingCanvasRef.current, 0, 0);
    }

    // === Post-Processing: Vignette & Chromatic Aberration ===
    
    // Vignette
    const vignette = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT/3, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT * 0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${VISUALS.vignetteStrength})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Chromatic Aberration (Fake RGB split on edges)
    // We only simulate this by drawing the canvas over itself with slight offsets and color blending if we had more layers, 
    // but a simpler way in 2D context without heavy perf hit is harder. 
    // Instead, let's just do a color tint overlay for atmosphere.
    if (weather === 'CAVE') {
        ctx.fillStyle = 'rgba(0, 0, 20, 0.1)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else if (weather === 'SUNNY') {
        ctx.fillStyle = 'rgba(255, 255, 200, 0.05)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

    particlePoolRef.current.pool.forEach(p => {
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
                ctx.fillStyle = p.color || '#FFF'; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
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

    ctx.restore();
  };

  const loop = () => {
    if (gameStatusRef.current === GameStatus.PLAYING) {
      update();
      draw();
      requestRef.current = requestAnimationFrame(loop);
    }
  };

  useEffect(() => {
    gameStatusRef.current = gameState.status;
    if (gameState.status === GameStatus.PLAYING) {
      requestRef.current = requestAnimationFrame(loop);
    }
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
