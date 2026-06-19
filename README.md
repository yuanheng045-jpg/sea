# sea — Atlantis 小手机前端

Step 1 骨架：手机外框 + 底部导航（6 个占位按钮）+ 切空白页。
没有样式、没有内容、不接后端。

## 开发

```
bun install
bun run dev
```

dev 默认 `127.0.0.1:5173`。远程查看用 SSH 端口转发：

```
# 本地（PowerShell / bash）：
ssh -L 5173:127.0.0.1:5173 ubuntu@129.146.100.35

# 服务器另开一个会话：
sudo -u cc bash -c "cd /home/cc/sea && /home/cc/.bun/bin/bun run dev"
```

本地浏览器打开 <http://127.0.0.1:5173/>。

## 构建

```
bun run build
```

产物在 `dist/`。
