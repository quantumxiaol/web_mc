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
- `F3` 或反引号显示调试层，包含 FPS、坐标、区块、draw calls、三角形数和显存对象计数
- 基础光照包含天空光、太阳方向光、阴影和 ACES 色调映射
- `F4` / `P` 可在 low / medium / high 图形档位之间切换，F3 会显示当前档位、DPR 和 mesh layer 统计
- 图形档位和快捷栏配置会写入浏览器 `localStorage`
- 区块修改使用 dirty chunk 队列，渲染时会跳过完全被不透明方块包围的隐藏方块
- 使用 `Uint8Array` 存储区块数据
- 按玩家位置动态加载 `5 x 5` 个区块
- 使用 `THREE.InstancedMesh` 渲染区块内的多种方块

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

## 控制说明

- `点击画面`：锁定鼠标
- `Esc`：释放鼠标
- `W/A/S/D`：水平移动
- `1-9`：切换快捷栏槽位
- `鼠标滚轮`：切换快捷栏槽位
- `E`：打开方块选择面板，点击方块会替换当前快捷栏槽位
- `F3` / `` ` ``：显示或隐藏调试信息
- `F4` / `P`：切换图形档位
- `Space`：飞行时上升，步行时跳跃
- `Shift`：飞行时下降
- `G`：切换飞行 / 步行
- `R`：重置出生点
- `左键`：删除方块
- `右键`：放置当前选中的方块

> Bloom 后处理目前仍是预留项，high 档只提高阴影贴图和 DPR 上限。
