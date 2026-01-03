
import React, { useEffect, useRef, useState } from 'react';
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
import { ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react';

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
interface Planet { x: number; y: number; size: number; color: string; hasRing: boolean; speed: number; }
interface Particle { 
    x: number; y: number; speedX: number; speedY: number; 
    size: number; life: number; color?: string; 
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ levelId, gameState, setGameState, onLevelComplete, onPlayerHit, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // --- 游戏状态 Refs (使用Ref以避免闭包陷阱) ---
  const levelRef = useRef(levels.find(l => l.id === levelId) || levels[0]);
  
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
    attackTimer: 0
  });

  const entitiesRef = useRef<Entity[]>(JSON.parse(JSON.stringify(levelRef.current.entities)));
  const bulletsRef = useRef<Entity[]>([]); // 活跃子弹列表
  const cameraRef = useRef({ x: 0, y: 0, shake: 0 }); // 摄像机与屏幕震动
  const keysRef = useRef<{ [key: string]: boolean }>({}); // 按键状态

  // --- 环境与装饰 Refs ---
  const cloudsRef = useRef<Cloud[]>([]);
  const treesRef = useRef<Tree[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // --- 初始化环境装饰 (Mount时执行) ---
  useEffect(() => {
    // 生成云朵
    cloudsRef.current = Array.from({ length: 8 }).map(() => ({
      x: Math.random() * CANVAS_WIDTH * 2,
      y: Math.random() * (CANVAS_HEIGHT / 2),
      speed: 0.2 + Math.random() * 0.5,
      size: 30 + Math.random() * 40
    }));

    // 生成火车关卡的树木
    treesRef.current = Array.from({ length: 15 }).map((_, i) => ({
       x: i * (CANVAS_WIDTH / 3) + Math.random() * 100,
       y: CANVAS_HEIGHT - 50, 
       width: 40 + Math.random() * 40,
       height: 100 + Math.random() * 150,
       color: Math.random() > 0.5 ? '#166534' : '#14532D'
    }));

    // 生成太空关卡的星球
    const planetColors = [COLORS.planetRed, COLORS.planetBlue, '#D1D5DB', '#FCD34D'];
    planetsRef.current = Array.from({ length: 6 }).map((_, i) => ({
       x: Math.random() * CANVAS_WIDTH * 2,
       y: Math.random() * (CANVAS_HEIGHT * 0.8),
       size: 20 + Math.random() * 60,
       color: planetColors[Math.floor(Math.random() * planetColors.length)],
       hasRing: Math.random() > 0.5,
       speed: 0.05 + Math.random() * 0.2
    }));
  }, []);

  // --- 关卡切换逻辑 ---
  useEffect(() => {
    const newLevel = levels.find(l => l.id === levelId) || levels[0];
    levelRef.current = newLevel;
    // 重置实体和玩家
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
      isInvulnerable: true, // 出生自带短暂无敌
      invulnerableTimer: 60,
      shootCooldown: 0,
      drunkTimer: 0,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      isAttacking: false,
      attackTimer: 0
    };
    cameraRef.current.x = 0;
    cameraRef.current.shake = 0;
    particlesRef.current = []; 
    
    // 播放对应关卡BGM
    let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' = 'NORMAL';
    if (newLevel.weather === 'CAVE') bgmType = 'CAVE';
    if (newLevel.weather === 'TOMB') bgmType = 'TOMB';
    if (newLevel.weather === 'SPACE') bgmType = 'SPACE';
    if (newLevel.weather === 'ARCTIC') bgmType = 'CREDITS'; // 隐藏关用温馨音乐
    audio.startBGM(bgmType);
    
    return () => {
      audio.stopBGM();
    }
  }, [levelId]);

  // --- 复活/状态同步逻辑 ---
  useEffect(() => {
    if (gameState.status === GameStatus.PLAYING) {
        // 复活后给予无敌时间
        if (playerRef.current.invulnerableTimer === 0) {
             playerRef.current.isInvulnerable = true;
             playerRef.current.invulnerableTimer = 120;
        }

       // 掉落边界检测
       const isFreeFly = levelRef.current.weather === 'SEA' || levelRef.current.weather === 'SPACE';
       const limit = isFreeFly ? levelRef.current.height + 200 : levelRef.current.height + 50;
       
       if (playerRef.current.pos.y > limit) {
           if (isFreeFly) {
               // 飞行关卡反弹
               playerRef.current.pos.y = limit - 10;
               playerRef.current.vel.y = -1;
           } else {
               // 普通关卡掉落死亡 -> 重置位置并扣血
               playerRef.current.pos = { ...levelRef.current.spawnPoint };
               playerRef.current.vel = { x: 0, y: 0 };
               cameraRef.current.x = Math.max(0, playerRef.current.pos.x - CANVAS_WIDTH / 3);
               handleDamage(playerRef.current); 
           }
       }
       keysRef.current = {}; // 清空按键缓存
       
       // 确保BGM播放
       let bgmType: 'NORMAL' | 'CAVE' | 'TOMB' | 'SPACE' | 'CREDITS' = 'NORMAL';
        if (levelRef.current.weather === 'CAVE') bgmType = 'CAVE';
        if (levelRef.current.weather === 'TOMB') bgmType = 'TOMB';
        if (levelRef.current.weather === 'SPACE') bgmType = 'SPACE';
        if (levelRef.current.weather === 'ARCTIC') bgmType = 'CREDITS';
        audio.startBGM(bgmType);
    } else {
       audio.stopBGM();
    }
  }, [gameState.status]);

  // --- 输入监听 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
        keysRef.current[e.code] = true;
        // 跳跃缓冲：即使在空中按下跳跃，也会记录几帧，落地瞬间触发
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            playerRef.current.jumpBufferTimer = JUMP_BUFFER;
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- 辅助函数 ---

  // AABB 碰撞检测
  const checkCollision = (rect1: Entity, rect2: Entity) => {
    return (
      rect1.pos.x < rect2.pos.x + rect2.size.x &&
      rect1.pos.x + rect1.size.x > rect2.pos.x &&
      rect1.pos.y < rect2.pos.y + rect2.size.y &&
      rect1.pos.y + rect1.size.y > rect2.pos.y
    );
  };

  // 添加屏幕震动
  const addShake = (amount: number) => {
      cameraRef.current.shake = amount;
  };

  // 刷怪逻辑
  const spawnEnemy = (spawner: Entity) => {
      const variant = spawner.spawnVariant || 'NORMAL';
      // 默认属性
      let width = 30;
      let height = 30;
      let speed = 2;
      let health = 1;
      let color = COLORS.enemy;

      // 根据变种调整属性
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
      
      // 飞行单位生成高度偏移
      if (variant === 'BAT' || variant === 'BIRD' || variant === 'UFO') {
          spawnY -= (variant === 'UFO' ? 100 + Math.random() * 50 : 100); 
      }
      if (variant === 'METEOR') {
          // 陨石全屏随机生成
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
      
      // 播放生成音效
      const dist = Math.abs(spawner.pos.x - playerRef.current.pos.x);
      if (dist < 800 && variant !== 'METEOR') { 
          audio.playRoar();
      }
  };

  // --- 更新环境逻辑 (粒子/背景) ---
  const updateEnvironment = () => {
    const player = playerRef.current;
    const weather = levelRef.current.weather;

    // 1. 动态背景元素 (云朵/树木/星球)
    if (weather === 'TRAIN') {
        cloudsRef.current.forEach(cloud => {
            cloud.x -= cloud.speed * 3;
            if (cloud.x + cloud.size * 2 < 0) {
                cloud.x = CANVAS_WIDTH * 2 + Math.random() * 200;
                cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
            }
        });
        treesRef.current.forEach(tree => {
             tree.x -= 5;
             if (tree.x + tree.width < -100) {
                 tree.x = CANVAS_WIDTH + 100 + Math.random() * 300;
                 tree.height = 100 + Math.random() * 150;
                 tree.y = CANVAS_HEIGHT - 30; 
             }
        });
        // 火车速度线粒子
        if (particlesRef.current.length < 50) {
            const spawnX = cameraRef.current.x + CANVAS_WIDTH + Math.random() * 100;
            particlesRef.current.push({
                x: spawnX, y: Math.random() * CANVAS_HEIGHT,
                speedX: -10 - Math.random() * 5, speedY: 0,
                size: 1 + Math.random() * 2, life: 0.5, color: 'rgba(255, 255, 255, 0.2)'
            });
        }
    }
    else if (weather === 'SPACE') {
        // 星球视差移动
        planetsRef.current.forEach(p => {
             p.x -= p.speed;
             if (p.x + p.size < 0) {
                 p.x = CANVAS_WIDTH * 1.5 + Math.random() * 500;
                 p.y = Math.random() * (CANVAS_HEIGHT * 0.8);
             }
        });
    }
    else if (weather !== 'CAVE' && weather !== 'SEA' && weather !== 'TOMB') {
        cloudsRef.current.forEach(cloud => {
            cloud.x -= cloud.speed;
            if (cloud.x + cloud.size * 2 < 0) {
                cloud.x = CANVAS_WIDTH * 2 + Math.random() * 200;
                cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
            }
        });
    }

    // 2. 天气粒子 (雨/雪/气泡)
    if (weather === 'SEA') { // 气泡
         if (particlesRef.current.length < 50) {
            const spawnX = cameraRef.current.x + Math.random() * CANVAS_WIDTH;
            particlesRef.current.push({
                x: spawnX, y: CANVAS_HEIGHT + 10,
                speedX: (Math.random() - 0.5) * 0.5, speedY: -1 - Math.random(),
                size: 2 + Math.random() * 4, life: 1, color: 'rgba(255, 255, 255, 0.4)'
            });
        }
    } 
    else if (weather === 'ARCTIC' || weather === 'SNOW') { // 下雪
        if (particlesRef.current.length < 200) {
            const spawnX = Math.random() * CANVAS_WIDTH + cameraRef.current.x - 100;
            particlesRef.current.push({
                x: spawnX, y: -10,
                speedX: (Math.random() - 0.5) * 1, speedY: 1 + Math.random() * 2,
                size: 2 + Math.random() * 3, life: 1, color: '#FFFFFF'
            });
        }
    }
    else if (weather !== 'SUNNY' && weather !== 'TRAIN' && weather !== 'SPACE' && weather !== 'TOMB' && weather !== 'CAVE') { // 下雨
       if (particlesRef.current.length < 150) {
          const spawnX = Math.random() * CANVAS_WIDTH;
          particlesRef.current.push({
             x: spawnX, y: -10,
             speedX: weather === 'RAIN' ? -1 : Math.sin(Date.now() / 1000), 
             speedY: weather === 'RAIN' ? 8 + Math.random() * 4 : 1 + Math.random(), 
             size: weather === 'RAIN' ? 2 : 3 + Math.random() * 2, life: 1
          });
       }
    }
    
    // 3. 醉酒粒子特效
    if (player.drunkTimer > 0) {
       for (let k = 0; k < 2; k++) {
           particlesRef.current.push({
               x: player.pos.x + Math.random() * player.size.x,
               y: player.pos.y + player.size.y,
               speedX: (Math.random() - 0.5) * 2, speedY: -1 - Math.random() * 3, 
               size: Math.random() * 6 + 2, life: 0.8,
               color: Math.random() > 0.5 ? '#EF4444' : '#F59E0B'
           });
       }
    }

    // 4. 更新所有粒子
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.speedX;
      p.y += p.speedY;
      
      // 生命周期衰减
      if (p.color && p.color !== '#525252' && !p.color.startsWith('rgba') && p.color !== '#D97706' && p.color !== '#FFFFFF') { 
          p.life -= 0.05;
          p.size *= 0.95; 
      }
      // 气泡飘出水面销毁
      else if (weather === 'SEA' && p.y < 0) {
           particlesRef.current.splice(i, 1);
           continue;
      }

      // 边界检查与循环
      if (p.y > CANVAS_HEIGHT && weather !== 'SEA') {
         if (weather === 'ARCTIC' || weather === 'SNOW') {
             p.y = -10; // 雪花循环
             p.x = Math.random() * CANVAS_WIDTH + cameraRef.current.x - 100;
         } else {
             particlesRef.current.splice(i, 1);
         }
      } else if (p.color && !p.color.startsWith('rgba') && p.color !== '#D97706' && p.color !== '#FFFFFF' && p.life <= 0) {
         particlesRef.current.splice(i, 1);
      } else if (weather === 'TOMB' && p.x < cameraRef.current.x - 50) {
         particlesRef.current.splice(i, 1);
      } else if (weather === 'TRAIN' && p.x < cameraRef.current.x - 100) {
         particlesRef.current.splice(i, 1);
      }
    }
  };

  // --- 主更新循环 (Logic Loop) ---
  const update = () => {
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

    // 状态计时器递减
    if (player.drunkTimer > 0) player.drunkTimer--;
    if (player.jumpBufferTimer > 0) player.jumpBufferTimer--;
    if (player.attackTimer && player.attackTimer > 0) {
        player.attackTimer--;
        if (player.attackTimer <= 0) player.isAttacking = false;
    }
    
    // 摄像机震动衰减
    if (cameraRef.current.shake > 0) {
        cameraRef.current.shake *= 0.9;
        if (cameraRef.current.shake < 0.5) cameraRef.current.shake = 0;
    }

    // --- 玩家射击逻辑 ---
    if (player.shootCooldown > 0) player.shootCooldown--;
    
    // 北极(隐藏)关卡禁止射击
    if (!isArcticLevel && (keysRef.current['KeyF'] || keysRef.current['KeyJ']) && player.shootCooldown <= 0) {
        player.shootCooldown = SHOOT_COOLDOWN;
        if (player.drunkTimer > 0) player.shootCooldown = SHOOT_COOLDOWN / 2; // 醉酒状态射速翻倍

        const isBow = levelId === 3 || levelId === 4; 
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

    // --- 子弹更新与碰撞 ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.pos.x += b.vel.x;
        
        // 超出视口太远销毁
        const distFromCam = Math.abs(b.pos.x - cameraRef.current.x);
        if (distFromCam > CANVAS_WIDTH + 100) {
            bullets.splice(i, 1);
            continue;
        }

        let bulletHit = false;

        for (const ent of entities) {
            if (ent.isDead) continue; 

            if (ent.type === EntityType.ENEMY) {
                // 不伤害家人！
                if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) continue;

                if (checkCollision(b, ent)) {
                    bulletHit = true;
                    ent.health = (ent.health || 1) - 1;
                    if (ent.health <= 0) {
                        ent.isDead = true;
                        // 击杀得分，精英怪分更高
                        const bonus = (ent.enemyVariant === 'TANK' || ent.enemyVariant === 'ZOMBIE' || ent.enemyVariant === 'UFO' ? 500 : 200);
                        setGameState(prev => ({ ...prev, score: prev.score + bonus }));
                        audio.playKill();
                        addShake(10);
                    } else {
                        // 击退效果
                        ent.pos.x += b.vel.x > 0 ? 5 : -5;
                        audio.playDamage();
                        addShake(2);
                    }
                    break;
                }
            } else if (ent.type === EntityType.PLATFORM) {
                if (checkCollision(b, ent)) {
                    bulletHit = true; // 打墙销毁
                    break;
                }
            } else if (ent.type === EntityType.BREAKABLE_WALL) {
                if (checkCollision(b, ent)) {
                    bulletHit = true;
                    // 古墓关卡可破坏墙壁
                    if (isTombLevel) {
                         ent.isDead = true;
                         audio.playDig();
                         addShake(5);
                         // 产生碎墙粒子
                         for (let k = 0; k < 5; k++) {
                            particlesRef.current.push({
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

    // --- 玩家物理移动 (Physics) ---
    const maxSpeed = player.drunkTimer > 0 ? MOVE_SPEED * WINE_SPEED_MULTIPLIER : MOVE_SPEED;
    const jumpForce = player.drunkTimer > 0 ? JUMP_FORCE * WINE_JUMP_MULTIPLIER : JUMP_FORCE;
    const isFreeFly = isSeaLevel || isSpaceLevel; // 是否为自由飞行模式

    if (isFreeFly) {
        // --- 游泳/飞行 模式 ---
        if (keysRef.current['ArrowLeft']) {
            player.vel.x -= ACCELERATION;
            player.facingRight = false;
        } else if (keysRef.current['ArrowRight']) {
            player.vel.x += ACCELERATION;
            player.facingRight = true;
        }
        if (keysRef.current['ArrowUp']) player.vel.y -= ACCELERATION;
        else if (keysRef.current['ArrowDown']) player.vel.y += ACCELERATION;

        // 阻力与速度上限
        player.vel.x *= WATER_FRICTION;
        player.vel.y *= WATER_FRICTION;
        if (player.vel.x > SWIM_SPEED) player.vel.x = SWIM_SPEED;
        if (player.vel.x < -SWIM_SPEED) player.vel.x = -SWIM_SPEED;
        if (player.vel.y > SWIM_SPEED) player.vel.y = SWIM_SPEED;
        if (player.vel.y < -SWIM_SPEED) player.vel.y = -SWIM_SPEED;

    } else {
        // --- 平台跳跃 模式 ---
        // X轴移动
        if (keysRef.current['ArrowLeft']) {
            player.vel.x -= ACCELERATION;
            player.facingRight = false;
        } else if (keysRef.current['ArrowRight']) {
            player.vel.x += ACCELERATION;
            player.facingRight = true;
        } else {
            // 摩擦力
            const friction = player.isGrounded ? FRICTION : AIR_FRICTION;
            player.vel.x *= friction;
            if (Math.abs(player.vel.x) < 0.1) player.vel.x = 0;
        }

        // 速度上限限制
        if (player.vel.x > maxSpeed) player.vel.x = maxSpeed;
        if (player.vel.x < -maxSpeed) player.vel.x = -maxSpeed;

        // 土狼时间处理
        if (player.isGrounded) {
            player.coyoteTimer = COYOTE_TIME;
        } else {
            if (player.coyoteTimer > 0) player.coyoteTimer--;
        }

        // 跳跃逻辑 (Buffer + Coyote)
        if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
            player.vel.y = jumpForce;
            player.isGrounded = false;
            player.coyoteTimer = 0; // 消耗土狼时间
            player.jumpBufferTimer = 0; // 消耗输入缓存
            audio.playJump();
        }

        // 大小跳 (松开跳跃键减速上升)
        if (player.vel.y < 0 && !keysRef.current['Space'] && !keysRef.current['ArrowUp']) {
            player.vel.y *= 0.5;
        }

        // 重力应用
        player.vel.y += GRAVITY;
        if (player.vel.y > TERMINAL_VELOCITY) player.vel.y = TERMINAL_VELOCITY;
    }

    // --- 应用位移与碰撞 (Movement & Collision) ---
    player.pos.x += player.vel.x;
    if (isFreeFly) player.isGrounded = false; // 飞行模式无所谓着地
    
    // 边界限制
    if (player.pos.x < 0) player.pos.x = 0;
    if (player.pos.x > levelRef.current.width - player.size.x) player.pos.x = levelRef.current.width - player.size.x;

    // X轴 墙壁碰撞
    for (const ent of entities) {
      if (ent.isDead) continue; 
      
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

    // Y轴 地面碰撞
    let landed = false;
    for (const ent of entities) {
      if (ent.isDead) continue; 

      if (ent.type === EntityType.PLATFORM || ent.type === EntityType.BREAKABLE_WALL) {
        if (checkCollision(player, ent)) {
          if (player.vel.y > 0) { // 下落碰到地面
            player.pos.y = ent.pos.y - player.size.y;
            player.vel.y = 0;
            landed = true;
          } else if (player.vel.y < 0) { // 上升碰到天花板
            player.pos.y = ent.pos.y + ent.size.y;
            player.vel.y = 0;
          }
        }
      }
    }
    player.isGrounded = landed;

    // 掉落死亡检测
    if (!isFreeFly && player.pos.y > levelRef.current.height + 100) {
      onGameOver();
      return;
    }

    // --- 实体更新与玩家交互 (Entity Interaction) ---
    if (player.isInvulnerable) {
      player.invulnerableTimer--;
      if (player.invulnerableTimer <= 0) player.isInvulnerable = false;
    }

    entities.forEach(ent => {
      if (ent.isDead) return;

      if (ent.type === EntityType.ENEMY) {
        // --- 敌人AI行为 ---
        // 1. 家人逻辑 (隐藏关)
        if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) {
             if (!ent.isFollowing) {
                 // 靠近后开始跟随
                 if (checkCollision(player, ent) || Math.abs(player.pos.x - ent.pos.x) < 50) {
                     ent.isFollowing = true;
                     // 冒爱心特效
                     for(let k=0; k<5; k++) {
                         particlesRef.current.push({
                            x: ent.pos.x + ent.size.x / 2, y: ent.pos.y,
                            speedX: (Math.random()-0.5) * 2, speedY: -2,
                            size: 3, life: 1.0, color: '#F472B6'
                        });
                     }
                     audio.playCoin(); 
                 }
             } else {
                 // 跟随逻辑：保持距离
                 const targetX = player.pos.x - (player.facingRight ? 40 : -40) - (ent.followOffset || 0) * (player.facingRight ? 1 : -1);
                 const dx = targetX - ent.pos.x;
                 // 简单的Lerp移动
                 if (Math.abs(dx) > 10) {
                     ent.vel.x = dx * 0.05;
                     if (ent.vel.x > 5) ent.vel.x = 5; // 限制最大速度
                     if (ent.vel.x < -5) ent.vel.x = -5;
                 } else {
                     ent.vel.x = 0;
                 }
                 ent.pos.x += ent.vel.x;
                 ent.pos.y = player.pos.y + (player.size.y - ent.size.y); // 简单贴地
             }
             return; 
        } 
        
        // 2. 特殊怪物移动逻辑
        else if (ent.enemyVariant === 'BAT' || ent.enemyVariant === 'BIRD') {
             ent.pos.y += Math.sin(Date.now() / 200) * 1; // 飞行波动
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
             ent.pos.x += ent.vel.x * 0.5; // 减速
        } else if (ent.enemyVariant === 'METEOR') {
             ent.pos.x += ent.vel.x;
             ent.pos.y += ent.vel.y;
        } else {
             ent.pos.x += ent.vel.x; // 普通移动
        }

        // 巡逻逻辑
        if (ent.patrolEnd && ent.pos.x >= ent.patrolEnd) ent.vel.x = -Math.abs(ent.vel.x);
        if (ent.patrolStart && ent.pos.x <= ent.patrolStart) ent.vel.x = Math.abs(ent.vel.x);
      } 
      
      // --- 刷怪笼逻辑 ---
      else if (ent.type === EntityType.SPAWNER) {
          if (ent.spawnCooldown) {
              ent.timeUntilSpawn = (ent.timeUntilSpawn || 0) + 1;
              if (ent.timeUntilSpawn >= ent.spawnCooldown) {
                  // 只有玩家在附近时才生成
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

      // --- 玩家与实体的碰撞处理 ---
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
          // 醉酒特效
          for (let k = 0; k < 20; k++) {
             particlesRef.current.push({
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
                // 过量治疗增加上限
                if (newLives < newMaxLives) {
                    newLives += 1;
                } else {
                    newMaxLives += 1;
                    newLives = newMaxLives;
                }
                return { ...prev, lives: newLives, maxLives: newMaxLives };
            });
            // 治疗特效
            for (let k = 0; k < 15; k++) {
                particlesRef.current.push({
                    x: ent.pos.x + ent.size.x / 2, y: ent.pos.y + ent.size.y / 2,
                    speedX: (Math.random() - 0.5) * 4, speedY: -2 - Math.random() * 4,
                    size: Math.random() * 4 + 2, life: 1.5, color: '#F472B6'
                });
            }
        } else if (ent.type === EntityType.FLAG || ent.type === EntityType.TROPHY) {
          onLevelComplete();
          audio.playWin();
        } else if (ent.type === EntityType.SPIKE) {
           if (!player.isInvulnerable) handleDamage(player);
        } else if (ent.type === EntityType.ENEMY) {
          if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) return; // 家人无伤害

          // 踩头攻击判定 (如果在空中且在敌人上方)
          const hitFromTop = !isFreeFly && player.vel.y > 0 && (player.pos.y + player.size.y) < (ent.pos.y + ent.size.y * 0.7);
          if (hitFromTop) {
            ent.isDead = true;
            player.vel.y = JUMP_FORCE / 2; // 踩中弹起
            setGameState(prev => ({ ...prev, score: prev.score + 200 }));
            audio.playKill();
            addShake(5);
          } else {
             if (!player.isInvulnerable) handleDamage(player);
          }
        }
      }
    });

    // --- 摄像机跟随 (Camera Follow) ---
    const lookAhead = player.facingRight ? 100 : -50; // 前瞻机制：看向前方
    const targetCamX = player.pos.x - CANVAS_WIDTH / 3 + lookAhead;
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.05; // 平滑插值 (Lerp)
    
    // 摄像机边界限制
    if (cameraRef.current.x < 0) cameraRef.current.x = 0;
    const maxCamX = levelRef.current.width - CANVAS_WIDTH;
    if (cameraRef.current.x > maxCamX) cameraRef.current.x = maxCamX;
  };

  // 受伤处理
  const handleDamage = (player: Player) => {
    player.isInvulnerable = true;
    player.invulnerableTimer = 120; // 2秒无敌
    player.vel.y = -6; // 被击退弹起
    player.vel.x = player.facingRight ? -4 : 4;
    onPlayerHit();
    audio.playDamage();
    addShake(15);
  };

  // --- 渲染循环 (Render Loop) ---
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
    
    const isBowLevel = levelId === 3 || levelId === 4;
    const isShovelLevel = levelId === 5;
    const isShurikenLevel = levelId === 6;
    const isLaserLevel = isSpaceLevel; 

    // 1. 绘制背景
    ctx.fillStyle = levelRef.current.backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 震动偏移应用
    const shakeX = (Math.random() - 0.5) * cameraRef.current.shake;
    const shakeY = (Math.random() - 0.5) * cameraRef.current.shake;

    // 2. 绘制远景 (Stars/Clouds/Planets)
    if (isSpaceLevel) {
        // 绘制星星
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 100; i++) {
            const starX = (i * 123 + cameraX * 0.05) % CANVAS_WIDTH; // 视差滚动
            const starY = (i * 87) % CANVAS_HEIGHT;
            ctx.globalAlpha = Math.random() * 0.5 + 0.3;
            ctx.fillRect(starX, starY, Math.random() > 0.9 ? 2 : 1, Math.random() > 0.9 ? 2 : 1);
        }
        ctx.globalAlpha = 1.0;

        // 绘制星球
        planetsRef.current.forEach(p => {
             const parallaxX = p.x - (cameraX * 0.1); 
             const renderX = ((parallaxX % (CANVAS_WIDTH * 2)) + (CANVAS_WIDTH * 2)) % (CANVAS_WIDTH * 2) - 100;
             
             ctx.fillStyle = p.color;
             ctx.beginPath();
             ctx.arc(renderX, p.y, p.size, 0, Math.PI * 2);
             ctx.fill();
             // 陨石坑细节
             ctx.fillStyle = 'rgba(0,0,0,0.1)';
             ctx.beginPath();
             ctx.arc(renderX - p.size*0.3, p.y - p.size*0.2, p.size*0.2, 0, Math.PI * 2);
             ctx.fill();
             if (p.hasRing) {
                 ctx.strokeStyle = COLORS.planetRing;
                 ctx.lineWidth = 4;
                 ctx.beginPath();
                 ctx.ellipse(renderX, p.y, p.size * 1.6, p.size * 0.4, 0.2, 0, Math.PI * 2);
                 ctx.stroke();
             }
        });
    }

    // 普通背景 (云与树)
    if (weather !== 'CAVE' && weather !== 'SEA' && weather !== 'TOMB' && weather !== 'SPACE') {
        if (isTrainLevel) {
            treesRef.current.forEach(tree => {
                ctx.fillStyle = tree.color;
                ctx.beginPath();
                ctx.moveTo(tree.x + tree.width/2, tree.y - tree.height);
                ctx.lineTo(tree.x + tree.width, tree.y);
                ctx.lineTo(tree.x, tree.y);
                ctx.fill();
            });
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        cloudsRef.current.forEach(cloud => {
            const parallaxX = cloud.x - (cameraX * 0.2); 
            const renderX = ((parallaxX % (CANVAS_WIDTH * 2)) + (CANVAS_WIDTH * 2)) % (CANVAS_WIDTH * 2) - 200;
            ctx.beginPath();
            ctx.arc(renderX, cloud.y, cloud.size, 0, Math.PI * 2);
            ctx.arc(renderX + cloud.size * 0.8, cloud.y + cloud.size * 0.2, cloud.size * 0.9, 0, Math.PI * 2);
            ctx.arc(renderX - cloud.size * 0.8, cloud.y + cloud.size * 0.1, cloud.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    ctx.save();
    ctx.translate(-cameraX + shakeX, shakeY); // 应用摄像机变换

    // 3. 绘制实体 (Entities)
    entitiesRef.current.forEach(ent => {
      if (ent.isDead) return;
      if (ent.type === EntityType.SPAWNER) return;

      // 绘制平台
      if (ent.type === EntityType.PLATFORM) {
        if (isSeaLevel) {
            ctx.fillStyle = COLORS.rock;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
        } else if (isSpaceLevel) {
             // 太空站样式
             ctx.fillStyle = COLORS.asteroid;
             ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
             ctx.strokeStyle = '#64748B';
             ctx.lineWidth = 2;
             ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
             ctx.beginPath(); ctx.moveTo(ent.pos.x, ent.pos.y); ctx.lineTo(ent.pos.x + ent.size.x, ent.pos.y + ent.size.y); ctx.stroke();
        } else if (isTrainLevel && ent.id.includes('train_car')) {
            // 火车车厢
            ctx.fillStyle = COLORS.trainCar;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            // 铆钉
            ctx.fillStyle = '#334155';
            for (let i = 0; i < ent.size.x; i += 20) {
                ctx.beginPath(); ctx.arc(ent.pos.x + i + 10, ent.pos.y + 5, 2, 0, Math.PI*2); ctx.fill();
            }
            // 轮子
            const wheelY = ent.pos.y + ent.size.y;
            ctx.fillStyle = COLORS.trainWheel;
            for (let i = 20; i < ent.size.x; i += 60) {
                 ctx.beginPath(); ctx.arc(ent.pos.x + i, wheelY + 5, 15, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(ent.pos.x + i, wheelY + 5, 5, 0, Math.PI*2); ctx.fill();
                 if (i + 60 < ent.size.x) { ctx.fillStyle = '#94A3B8'; ctx.fillRect(ent.pos.x + i, wheelY + 5, 60, 4); }
            }
            // 窗户
            if (ent.size.y > 30) {
                ctx.fillStyle = COLORS.trainWindow;
                ctx.fillRect(ent.pos.x + 10, ent.pos.y + 10, 40, 20);
                ctx.fillStyle = '#000'; ctx.strokeRect(ent.pos.x + 10, ent.pos.y + 10, 40, 20);
            }
        } else {
            // 普通草地
            ctx.fillStyle = levelRef.current.groundColor || COLORS.ground;
            ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
            if (ent.size.y > 10) {
               ctx.fillStyle = levelRef.current.groundColor ? (levelRef.current.groundColor === COLORS.ice ? '#D6F2FE' : '#171717') : COLORS.dirt;
               ctx.globalAlpha = 0.3; ctx.fillRect(ent.pos.x, ent.pos.y + 10, ent.size.x, ent.size.y - 10); ctx.globalAlpha = 1.0;
            }
            ctx.strokeStyle = levelRef.current.groundColor === COLORS.ice ? '#7DD3FC' : '#000';
            ctx.lineWidth = 2; ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
        }
      } 
      // 绘制可破坏墙
      else if (ent.type === EntityType.BREAKABLE_WALL) {
          ctx.fillStyle = COLORS.sandWall;
          ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
          ctx.strokeStyle = '#B45309'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ent.pos.x, ent.pos.y); ctx.lineTo(ent.pos.x + ent.size.x, ent.pos.y + ent.size.y);
          ctx.moveTo(ent.pos.x + ent.size.x, ent.pos.y); ctx.lineTo(ent.pos.x, ent.pos.y + ent.size.y);
          ctx.stroke(); ctx.strokeRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
      }
      // 绘制金币
      else if (ent.type === EntityType.COIN) {
        ctx.fillStyle = COLORS.coin;
        ctx.beginPath(); ctx.arc(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y/2, ent.size.x/2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.coinShine;
        ctx.beginPath(); ctx.arc(ent.pos.x + ent.size.x/2 - 3, ent.pos.y + ent.size.y/2 - 3, 3, 0, Math.PI * 2); ctx.fill();
      }
      // 绘制酒
      else if (ent.type === EntityType.WINE) {
        ctx.fillStyle = COLORS.wine;
        ctx.fillRect(ent.pos.x + 4, ent.pos.y + 10, 12, 20);
        ctx.fillRect(ent.pos.x + 7, ent.pos.y, 6, 10);
        ctx.fillStyle = COLORS.wineLabel;
        ctx.fillRect(ent.pos.x + 5, ent.pos.y + 15, 10, 8);
        ctx.strokeStyle = COLORS.wineLabel;
        ctx.strokeRect(ent.pos.x + 4, ent.pos.y + 10, 12, 20);
        ent.pos.y += Math.sin(Date.now() / 150) * 0.3; // 浮动效果
      }
      // 绘制药水
      else if (ent.type === EntityType.POTION) {
        const bob = Math.sin(Date.now() / 300) * 2;
        ctx.fillStyle = COLORS.potion;
        ctx.beginPath(); ctx.arc(ent.pos.x + 10, ent.pos.y + 15 + bob, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ent.pos.x + 7, ent.pos.y + bob, 6, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(ent.pos.x + 8, ent.pos.y + 13 + bob, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#78350F'; ctx.fillRect(ent.pos.x + 6, ent.pos.y - 2 + bob, 8, 4);
      }
      // 绘制尖刺
      else if (ent.type === EntityType.SPIKE) {
        ctx.fillStyle = levelRef.current.spikeColor || COLORS.spike;
        ctx.beginPath();
        const numSpikes = Math.floor(ent.size.x / 10);
        for(let i=0; i<numSpikes; i++) {
            ctx.moveTo(ent.pos.x + i * 10, ent.pos.y + ent.size.y);
            ctx.lineTo(ent.pos.x + i * 10 + 5, ent.pos.y);
            ctx.lineTo(ent.pos.x + i * 10 + 10, ent.pos.y + ent.size.y);
        }
        ctx.fill();
      }
      // 绘制终点 (奖杯或房子)
      else if (ent.type === EntityType.TROPHY) {
        if (ent.id === 'home_trigger') {
            // === 绘制温馨小屋 ===
            const roofHeight = 40;
            const bodyHeight = ent.size.y - roofHeight;
            // 房体
            ctx.fillStyle = '#78350F'; ctx.fillRect(ent.pos.x + 10, ent.pos.y + roofHeight, ent.size.x - 20, bodyHeight);
            // 木板纹理
            ctx.fillStyle = '#5B2C0A';
            ctx.fillRect(ent.pos.x + 10, ent.pos.y + roofHeight + 10, ent.size.x - 20, 2);
            ctx.fillRect(ent.pos.x + 10, ent.pos.y + roofHeight + 30, ent.size.x - 20, 2);
            ctx.fillRect(ent.pos.x + 10, ent.pos.y + roofHeight + 50, ent.size.x - 20, 2);
            // 屋顶
            ctx.fillStyle = '#B91C1C';
            ctx.beginPath();
            ctx.moveTo(ent.pos.x - 5, ent.pos.y + roofHeight);
            ctx.lineTo(ent.pos.x + ent.size.x / 2, ent.pos.y);
            ctx.lineTo(ent.pos.x + ent.size.x + 5, ent.pos.y + roofHeight);
            ctx.fill();
            // 屋顶积雪
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(ent.pos.x - 5, ent.pos.y + roofHeight);
            ctx.lineTo(ent.pos.x + ent.size.x / 2, ent.pos.y);
            ctx.lineTo(ent.pos.x + ent.size.x + 5, ent.pos.y + roofHeight);
            ctx.lineTo(ent.pos.x + ent.size.x + 5, ent.pos.y + roofHeight + 10);
            for(let i=0; i<=10; i++) {
                 ctx.lineTo(ent.pos.x + ent.size.x + 5 - (i * (ent.size.x+10)/10), ent.pos.y + roofHeight + 10 + (i%2==0 ? 5 : 0));
            }
            ctx.fill();
            // 门窗
            ctx.fillStyle = '#451a03'; ctx.fillRect(ent.pos.x + ent.size.x/2 - 15, ent.pos.y + ent.size.y - 40, 30, 40);
            ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(ent.pos.x + ent.size.x/2 + 10, ent.pos.y + ent.size.y - 20, 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#FEF08A'; ctx.fillRect(ent.pos.x + 20, ent.pos.y + roofHeight + 20, 20, 20);
            ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2; ctx.strokeRect(ent.pos.x + 20, ent.pos.y + roofHeight + 20, 20, 20);
            // 烟囱烟雾
            const time = Date.now() / 500;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            for(let s=0; s<3; s++) {
                const sY = ent.pos.y - 20 - (time*20 + s*20)%60;
                const sX = ent.pos.x + ent.size.x - 20 + Math.sin(time + s)*10;
                ctx.beginPath(); ctx.arc(sX, sY, 5 + s*2, 0, Math.PI*2); ctx.fill();
            }
        } else {
            // 普通奖杯
            ctx.fillStyle = COLORS.trophy;
            ctx.beginPath();
            ctx.moveTo(ent.pos.x + 5, ent.pos.y + 5);
            ctx.lineTo(ent.pos.x + 35, ent.pos.y + 5);
            ctx.bezierCurveTo(ent.pos.x + 35, ent.pos.y + 25, ent.pos.x + 5, ent.pos.y + 25, ent.pos.x + 5, ent.pos.y + 5);
            ctx.fill();
            ctx.fillStyle = COLORS.trophyBase;
            ctx.fillRect(ent.pos.x + 15, ent.pos.y + 25, 10, 5);
            ctx.fillRect(ent.pos.x + 10, ent.pos.y + 30, 20, 5);
            ctx.fillStyle = '#FFF'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ent.pos.x + 15, ent.pos.y + 10, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
        }
      }
      // 绘制敌人
      else if (ent.type === EntityType.ENEMY) {
         ctx.fillStyle = ent.color || COLORS.enemy;
         
         if (ent.enemyVariant && ent.enemyVariant.startsWith('FAMILY')) {
             // === 绘制小熊家人 ===
             // 身体
             ctx.fillStyle = '#FFFFFF';
             ctx.beginPath(); ctx.roundRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y, 5); ctx.fill();
             // 耳朵
             ctx.beginPath(); ctx.arc(ent.pos.x + 5, ent.pos.y + 2, 5, 0, Math.PI*2); ctx.arc(ent.pos.x + ent.size.x - 5, ent.pos.y + 2, 5, 0, Math.PI*2); ctx.fill();
             // 脸部
             let lookDir = 1;
             if (Math.abs(ent.vel.x) > 0.1) lookDir = ent.vel.x > 0 ? 1 : 0;
             else lookDir = (player.pos.x > ent.pos.x) ? 1 : 0;
             ctx.fillStyle = '#FCD34D';
             const faceX = ent.pos.x + (lookDir ? ent.size.x * 0.4 : 2);
             const faceW = ent.size.x * 0.5;
             const faceH = ent.size.y * 0.4;
             ctx.beginPath(); ctx.roundRect(faceX, ent.pos.y + ent.size.y * 0.2, faceW, faceH, 3); ctx.fill();
             // 眼睛
             ctx.fillStyle = '#000';
             ctx.beginPath();
             ctx.arc(faceX + faceW * 0.3, ent.pos.y + ent.size.y * 0.35, 2, 0, Math.PI*2);
             ctx.arc(faceX + faceW * 0.7, ent.pos.y + ent.size.y * 0.35, 2, 0, Math.PI*2);
             ctx.fill();
             // 装饰 (领带/围巾)
             if (ent.enemyVariant === 'FAMILY_DAD') {
                 ctx.fillStyle = '#EF4444';
                 ctx.beginPath(); ctx.moveTo(ent.pos.x + ent.size.x/2, ent.pos.y + ent.size.y * 0.6); ctx.lineTo(ent.pos.x + ent.size.x/2 - 5, ent.pos.y + ent.size.y); ctx.lineTo(ent.pos.x + ent.size.x/2 + 5, ent.pos.y + ent.size.y); ctx.fill();
             } else if (ent.enemyVariant === 'FAMILY_MOM') {
                 ctx.fillStyle = '#EC4899'; ctx.fillRect(ent.pos.x, ent.pos.y + ent.size.y * 0.5, ent.size.x, 4);
             }
         }
         else if (ent.enemyVariant === 'BAT' || ent.enemyVariant === 'BIRD') {
             // 蝙蝠/鸟
             ctx.fillStyle = ent.color || COLORS.enemyBat;
             ctx.beginPath();
             if (ent.enemyVariant === 'BIRD') {
                 ctx.moveTo(ent.pos.x, ent.pos.y + 10); ctx.lineTo(ent.pos.x + 10, ent.pos.y + 15); ctx.lineTo(ent.pos.x + 30, ent.pos.y + 10); ctx.lineTo(ent.pos.x + 10, ent.pos.y + 5);
             } else {
                 ctx.arc(ent.pos.x + 15, ent.pos.y + 10, 10, 0, Math.PI * 2); 
             }
             ctx.fill();
             // 翅膀拍动
             const wingFlap = Math.sin(Date.now() / 50) * 10;
             ctx.beginPath(); ctx.moveTo(ent.pos.x + 5, ent.pos.y + 10); ctx.lineTo(ent.pos.x - 5, ent.pos.y + 5 + wingFlap); ctx.lineTo(ent.pos.x + 15, ent.pos.y + 10); ctx.lineTo(ent.pos.x + 35, ent.pos.y + 5 + wingFlap); ctx.lineTo(ent.pos.x + 25, ent.pos.y + 10); ctx.fill();
         } 
         // ... (其他怪物渲染逻辑保持不变，但增加注释) ...
         else {
             // 默认方块怪物
             ctx.fillRect(ent.pos.x, ent.pos.y, ent.size.x, ent.size.y);
         }
         
         // 绘制血条 (针对Boss级怪物)
         if ((ent.enemyVariant === 'TANK' || ent.enemyVariant === 'UFO' || ent.enemyVariant === 'METEOR') && ent.health && ent.maxHealth) {
             const hpPct = ent.health / ent.maxHealth;
             ctx.fillStyle = 'red'; ctx.fillRect(ent.pos.x, ent.pos.y - 10, ent.size.x, 5);
             ctx.fillStyle = 'green'; ctx.fillRect(ent.pos.x, ent.pos.y - 10, ent.size.x * hpPct, 5);
         }
      }
    });

    // 4. 绘制子弹 (Projectiles)
    bullets.forEach(b => {
        if (isShovelLevel) { // 铲子旋转
            ctx.save(); ctx.translate(b.pos.x, b.pos.y); ctx.rotate((Date.now() / 50) % (Math.PI * 2));
            ctx.fillStyle = COLORS.shovelHandle; ctx.fillRect(-5, -2, 10, 4);
            ctx.fillStyle = COLORS.shovel; ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(17, -6); ctx.lineTo(20, 0); ctx.lineTo(17, 6); ctx.lineTo(5, 6); ctx.fill();
            ctx.restore();
        } else if (isLaserLevel) { // 激光
            ctx.strokeStyle = COLORS.laserBeam; ctx.lineWidth = 4; ctx.lineCap = 'round';
            const len = 25; const dir = b.vel.x > 0 ? 1 : -1;
            ctx.beginPath(); ctx.moveTo(b.pos.x, b.pos.y); ctx.lineTo(b.pos.x + len * dir, b.pos.y); ctx.stroke();
        } else { // 普通子弹
            ctx.fillStyle = COLORS.projectile;
            ctx.beginPath(); ctx.arc(b.pos.x + b.size.x/2, b.pos.y + b.size.y/2, b.size.x/2, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 5. 绘制玩家 (Player)
    if (player.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
       ctx.globalAlpha = 0.5; // 受伤闪烁
    }
    
    // 根据关卡绘制不同皮肤
    if (isSpaceLevel) { // 宇航员熊
        ctx.fillStyle = COLORS.astroSuit; ctx.beginPath(); ctx.roundRect(player.pos.x - 2, player.pos.y - 2, player.size.x + 4, player.size.y + 4, 8); ctx.fill();
        ctx.fillStyle = '#CBD5E1'; ctx.fillRect(player.facingRight ? player.pos.x - 6 : player.pos.x + player.size.x, player.pos.y + 5, 6, 15);
        ctx.fillStyle = COLORS.astroVisor; const faceX = player.facingRight ? player.pos.x + 8 : player.pos.x + 2; ctx.beginPath(); ctx.roundRect(faceX, player.pos.y + 4, 20, 14, 6); ctx.fill();
    } else { // 默认白熊
        ctx.fillStyle = COLORS.bear;
        if (isSeaLevel) { // 人鱼尾巴
            const tailWiggle = Math.sin(Date.now() / 100) * 3;
            ctx.fillStyle = COLORS.tail; ctx.beginPath();
            if (player.facingRight) { ctx.moveTo(player.pos.x + 10, player.pos.y + 20); ctx.lineTo(player.pos.x - 10, player.pos.y + 35 + tailWiggle); ctx.lineTo(player.pos.x - 10, player.pos.y + 15 + tailWiggle); } 
            else { ctx.moveTo(player.pos.x + 20, player.pos.y + 20); ctx.lineTo(player.pos.x + 40, player.pos.y + 35 + tailWiggle); ctx.lineTo(player.pos.x + 40, player.pos.y + 15 + tailWiggle); }
            ctx.fill(); ctx.fillStyle = COLORS.bear; ctx.beginPath(); ctx.roundRect(player.pos.x, player.pos.y, player.size.x, 20, 5); ctx.fill();
        } else {
            ctx.beginPath(); ctx.roundRect(player.pos.x, player.pos.y, player.size.x, player.size.y, 5); ctx.fill();
        }
        // 耳朵和脸
        ctx.fillStyle = COLORS.bear; ctx.beginPath(); ctx.arc(player.pos.x + 5, player.pos.y + 2, 6, 0, Math.PI*2); ctx.arc(player.pos.x + player.size.x - 5, player.pos.y + 2, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = player.drunkTimer > 0 ? COLORS.bearFaceDrunk : COLORS.bearFace;
        const faceX = player.facingRight ? player.pos.x + 12 : player.pos.x + 2;
        ctx.beginPath(); ctx.roundRect(faceX, player.pos.y + 8, 16, 12, 4); ctx.fill();
        ctx.fillStyle = '#000'; const eyeOffsetX = player.facingRight ? 4 : 0;
        ctx.beginPath(); ctx.arc(faceX + 4 + eyeOffsetX, player.pos.y + 12, 2, 0, Math.PI*2); ctx.arc(faceX + 10 + eyeOffsetX, player.pos.y + 12, 2, 0, Math.PI*2); ctx.fill();
    }

    // 绘制手持武器
    if (!isTrainLevel && !isArcticLevel) { 
        ctx.fillStyle = COLORS.gun;
        const gunX = player.facingRight ? player.pos.x + 20 : player.pos.x - 5;
        const gunY = player.pos.y + 15;
        ctx.fillRect(gunX, gunY, 15, 6);
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();

    // 6. 绘制UI (Boss血条等)
    const boss = entitiesRef.current.find(e => e.type === EntityType.ENEMY && e.maxHealth && e.maxHealth > 2 && Math.abs(e.pos.x - player.pos.x) < 500 && !e.isDead);
    if (boss) {
        const hpPct = (boss.health || 0) / (boss.maxHealth || 1);
        const barWidth = 400; const barX = (CANVAS_WIDTH - barWidth) / 2; const barY = CANVAS_HEIGHT - 30;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(barX - 2, barY - 2, barWidth + 4, 14);
        ctx.fillStyle = '#1F2937'; ctx.fillRect(barX, barY, barWidth, 10);
        ctx.fillStyle = '#DC2626'; ctx.fillRect(barX, barY, barWidth * hpPct, 10);
        ctx.fillStyle = '#FFF'; ctx.font = '10px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText("BOSS", barX + barWidth/2, barY - 5);
    }

    // 7. 绘制天气粒子 (Overlay)
    particlesRef.current.forEach(p => {
        if (p.color && (p.color.startsWith('rgba') || p.color === '#D97706' || p.color === '#FFFFFF')) {
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else if (!p.color) { // 雨滴
            ctx.strokeStyle = 'rgba(173, 216, 230, 0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + 10); ctx.stroke();
        } else { // 特效粒子
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
        }
    });
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

  // --- 虚拟摇杆支持 (Touch) ---
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
