# web_mc

一个运行在浏览器里的简化版 Minecraft 风格创造模式，基于 `Three.js + TypeScript + Vite`，可以直接部署到 GitHub Pages。

![web_mc homepage](public/homepage.png)

项目当前用了 [kenney_voxel-pack](https://www.kenney.nl/assets/voxel-pack) 里的素材：
- 方块材质来自 `public/kenney_voxel-pack/PNG/Tiles`
- 启动画面使用 `public/homepage.png`
- 原始授权说明保留在 `public/kenney_voxel-pack/License.txt`

## 当前功能

- 第一人称视角与 Pointer Lock
- `W/A/S/D` 移动
- `G` 切换飞行 / 步行
- 34 种可放置方块，包含地形、建筑、自然、矿石、水和岩浆
- 9 格快捷栏，支持数字键、鼠标滚轮和 `E` 方块选择面板
- `Space` 上升或跳跃，`Shift` 下降
- 左键移除方块，右键放置当前选中的方块
- `F2` 保存当前画面截图
- `F3` 或反引号显示调试层，包含 FPS、坐标、区块、draw calls、三角形数和显存对象计数
- 基础光照包含天空光、太阳方向光、阴影和 ACES 色调映射
- 日夜循环会驱动太阳角度、天空色、fog 颜色、环境光强度和曝光变化，F3 会显示当前时间段
- `F4` / `P` 可在 low / medium / high 图形档位之间切换，F3 会显示当前档位、DPR 和 mesh layer 统计
- 图形档位、快捷栏配置和手动保存的世界编辑会写入浏览器 `localStorage`
- 世界存档只保存 edited chunks，支持浏览器保存/载入以及 JSON 导出/导入
- 区块修改使用 dirty chunk 队列，渲染时会跳过完全被不透明方块包围的隐藏方块
- 本轮运行内会保留被编辑过的 chunk，飞远触发卸载后再回来不会丢失放置/删除的方块；手动保存后刷新页面也可以恢复
- 世界高度 32，`worldGenerator.ts` 会生成地形层次、矿石、树、仙人掌、蘑菇、小水池和岩浆池
- 蘑菇等小装饰物使用 cross billboard 形状，不再作为完整实体立方块渲染
- 水和岩浆使用可见面 liquid mesh、透明材质和贴图滚动动画；天然池子默认静态，玩家放置或破坏边界后才激活动态流体
- 动态流体按 tick 更新，水流得更快更远，岩浆更慢且扩散更短，避免 chunk 加载时天然池子瞬间泛滥
- 水和岩浆接触会把岩浆转成石头；岩浆会吞掉树叶、蘑菇、仙人掌、雪和冰等可破坏方块
- 流体调试支持暂停、单步、清除流动液体和切换天然液体仿真，F3 会分别显示水和岩浆队列统计
- 世界生成会避免水池和岩浆池过近，降低不自然的相邻冷热池
- 准星选中、破坏和放置使用 voxel DDA raycast，已和渲染 mesh/instanceId 解耦
- 使用 `Uint8Array` 存储区块数据
- 按玩家位置动态加载 `5 x 5` 个区块
- 使用 `THREE.InstancedMesh` 渲染区块内的多种方块
- `Vitest` 覆盖 DDA raycast、流体反应、edited chunk 导入/导出和日夜循环基础规则

## 本地运行

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
pnpm preview
```

## 测试

```bash
pnpm test
```

## 控制说明

- `点击画面`：锁定鼠标
- `Esc`：释放鼠标
- `W/A/S/D`：水平移动
- `1-9`：切换快捷栏槽位
- `鼠标滚轮`：切换快捷栏槽位
- `E`：打开方块选择面板，点击方块会替换当前快捷栏槽位
- `F2`：保存当前画面截图
- `F3` / `` ` ``：显示或隐藏调试信息
- `F4` / `P`：切换图形档位
- `Cmd/Ctrl+S`：保存世界到浏览器
- `Cmd/Ctrl+O`：从浏览器载入世界
- `Cmd/Ctrl+E`：导出世界 JSON 存档
- `Cmd/Ctrl+I`：导入世界 JSON 存档
- `V`：暂停或恢复流体模拟
- `B`：单步执行一次流体 tick
- `N`：清除流动液体，只保留 source
- `Shift+N`：清空所有编辑并回到 seed world
- `M`：切换天然液体仿真 seed
- `Space`：飞行时上升，步行时跳跃
- `Shift`：飞行时下降
- `G`：切换飞行 / 步行
- `R`：重置出生点
- `左键`：删除方块
- `右键`：放置当前选中的方块

> Bloom 后处理目前仍是预留项，high 档只提高阴影贴图和 DPR 上限。
