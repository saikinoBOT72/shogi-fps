// マップ全体の入口：共通の部品（world/base.ts）を外へ見せ、マップ（maps/*.ts）を作ってから、選んでいるマップを出す
// ほかのファイルは今までどおり ./world から import すればよい
import { settings } from './core';
import { scene, sky } from './render';
import { baseProps, clouds, useMap } from './world/base';
import { buildValley } from './maps/valley';
import { buildTemple } from './maps/temple';
import { buildOnsen } from './maps/onsen';
import { buildDesert } from './maps/desert';
import { buildGorge } from './maps/gorge';
import { buildYashiki } from './maps/yashiki';
import { buildBoss1 } from './maps/boss1';
import { buildRoof } from './maps/roof';
export * from './world/base';

buildValley();
buildTemple();
buildOnsen();
buildDesert();
buildGorge();
buildYashiki();
buildBoss1();
buildRoof();
useMap(settings.map);
// 背景・地面など動かない物も、毎フレームの位置の計算を省く
for (const o of scene.children) if (o !== sky && !clouds.includes(o) && (o as any).isMesh && !(o as any).userData.phys) { o.matrixAutoUpdate = false; o.updateMatrix(); }
for (const o of baseProps) o.geometry.computeBoundsTree();
