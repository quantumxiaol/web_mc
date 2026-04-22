# web_mc

一个运行在浏览器里的简化版 Minecraft 风格创造模式，基于 `Three.js + TypeScript + Vite`，可以直接部署到 GitHub Pages。

![web_mc homepage](public/homepage.png)

项目当前用了 [kenney_voxel-pack](https://www.kenney.nl/assets/voxel-pack) 里的素材：
- 草方块使用 `grass_top.png`、`dirt_grass.png`、`dirt.png`
- 启动画面使用 `public/homepage.png`
- 原始授权说明保留在 `public/kenney_voxel-pack/License.txt`

## 当前功能

- 第一人称视角与 Pointer Lock
- `W/A/S/D` 移动
- `G` 切换飞行 / 步行
- `Space` 上升或跳跃，`Shift` 下降
- 左键移除方块，右键放置草方块
- 使用 `Uint8Array` 存储区块数据
- 按玩家位置动态加载 `5 x 5` 个区块
- 使用 `THREE.InstancedMesh` 渲染区块内的草方块

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
- `Space`：飞行时上升，步行时跳跃
- `Shift`：飞行时下降
- `G`：切换飞行 / 步行
- `R`：重置出生点
- `左键`：删除方块
- `右键`：放置草方块
