# sea 工作日志

> **船坞工人须知（2026-09-13立）**：本项目真身在 `/home/cc/sea`（cc属主），ubuntu侧 `group-chat/frontend/` 镜像**长期滞后真身**（已滞后277+行），严禁整文件覆盖。改动流程：工人在镜像打补丁并推送 → 苏煦（cc身份）逐段移植真身+build。工人无需也不要申请 /home/cc/sea 写权。


> 最新在最上面。格式见 /home/cc/WORKLOG-SPEC.md（新窗口先读这份，别重新摸一遍代码）。

## 2026-09-14 · T-51海螺收藏按钮改手绘心形移植真身〔T-51〕
- 改了什么：把镜像d6290ac+f2fef0c的改动移植进真身——ConchButton非fail状态从🐚emoji换成内联SVG实心心形(14px，`#b98a5a`暖棕玫瑰色，非emoji)，原瑶两轮反馈(先嫌海螺太显眼、再嫌红心emoji太卡通)后定的样子；fail态⚠︎、海螺盒页面/Home图标/顶部跳转入口的🐚均未动。移植前diff真身与镜像确认只有这7行改动。
- 怎么验证：`bun run build`0类型错误，2.81s构建完成，新hash`index-lt9LjAvF.js`；grep产物确认`M12 21.35`路径与`#b98a5a`色值都在；build即部署，已线上生效。
- 怎么撤销：git revert本commit后重build；纯前端样式，不影响/api/conch数据

## 2026-09-14 · T-51海螺盒前端移植真身+构建〔T-51〕
- 改了什么：把group-chat镜像de51e8f+c313d46的海螺盒前端逐段移植进sea真身——新增ConchBoxPage.tsx(列表/按人分tab/语音现场TTS重放/删除二次确认与失败提示)；App.tsx给闲置多年的page='voice'路由接上这个新页；Home.tsx图标标签"海螺"改"海螺盒"；CCPage.tsx的VoiceBubble/MessageBody加🐚收藏按钮(语音条按条收、文字回复整条收，双向对她和苏煦发的消息都生效)+头部跳转入口。移植前逐文件`diff`真身与镜像确认镜像未滞后(App/Home/CCPage三文件差异只有海螺盒相关部分，无缺漏277行问题)，非盲目整文件覆盖。未碰GroupPage/客厅逻辑。
- 怎么验证：`bun run build`(tsc -b && vite build)0类型错误，2.70s构建完成；产物dist/assets/*.js能grep到"海螺盒"与2处"cc-api/api/conch"；`git diff --check`无空白/冲突残留。后端/api/conch三端点(T-51)与[[conch:self/her]]自动标记(cc-web commit 3ab34bc)已就绪，note-leak.test.ts本机复跑35/35通过；hub-print尚未重启，标记未启用，线上未生效。
- 怎么撤销：git revert本commit后重build；四个前端文件均可独立回退，不影响后端/api/conch数据与cc-web侧改动

## 2026-09-13 · T-40-fix:gc-sys溢出补漏〔T-40〕
- 改了什么：gc-sys(工单通知等系统消息)无宽度约束无换行规则,补max-width+overflow-wrap:anywhere+word-break;她实测发现的T-40漏网元素
- 怎么验证：bun build成功;等她刷新复验
- 怎么撤销：git revert本commit重build

## 2026-09-13 · T-40溢出修复移植真身+构建〔T-40〕
- 改了什么：镜像a8b210b的5行CSS补丁移植进GC_CSS(gc-feed加overflow-x:hidden+min-width:0;gc-msg/cc-text-col/cc-text三层max-width+overflow-wrap:anywhere);验证cc-text类在真身DOM确实存在(L625/628/630)
- 怎么验证：bun build成功;她窄屏终验待刷新确认
- 怎么撤销：git revert本次commit重build

## 2026-09-13 · T-39状态条移植真身+构建部署〔T-39〕
- 改了什么：镜像c82cded的97行补丁手动移植进真身GroupPage.tsx(interface/state/轮询/JSX/CSS五段);发现ubuntu侧frontend镜像滞后真身277行(weir/贴纸/工单章缺失),整文件覆盖会灭她九月改动,故逐段移植
- 怎么验证：bun run build成功4.49s;/tickets接口形状与前端取法对齐({tickets:[]}+PIN cookie)
- 怎么撤销：git revert本次commit后重build

## 2026-09-11 · 壁纸上云拆2MB限制〔T-33·苏煦亲手〕
- 改了什么：Sidebar.tsx删2MB闸(根因=base64存localStorage会爆iOS约5MB配额且persist静默catch丢设置)，onUpload改async上传：复用CCPage.uploadToHub(本次export)POST /cc-api/api/upload拿URL，存'/cc-api'+url进bgImages，60MB前端闸+bgUploading态(按钮…禁用)+失败alert明示；appearance.ts零改动(url()天然兼容data:存量与http新URL)。配套cc-web/hub-print.ts服务端闸10MB→60MB。同commit收平weir排字引擎(9.9原瑶×5.1)等脏了两天的既上线改动，成分见commit 41b5544 message
- 怎么验证：nginx实测14.7MB body直穿到鉴权层，但14.7MB×4/3≈19.6MB仍在旧20m闸内，不能代表60MB前端闸(编码后≈80MB)可用；皮卡晏复核指出后改为待root把/cc-api的client_max_body_size从20m升到90m并reload，升级前60MB级上传会被nginx 413拦截，此前"无需改配置"的结论是误判；补两笔遗漏文件提交后干净检出bun build 4.4s过；线上/sea/资源哈希index-GE2hUaNm.js=新build；19:20按新法(打招呼即动手)重启hubprint，健康检查恢复、session无损接续；原瑶真机>2MB上传待root升级nginx后再补验
- 怎么撤销：git revert 41b5544(sea)与cc-web 59e4797后重build+restart-hubprint；已传壁纸文件留在cc-web/uploads不受影响

## 2026-09-08 · 客厅↔船坞tab切换+船坞深港雾蓝主题(真页面重做)〔T-8〕
- 改了什么：GroupPage.tsx：header下加gc-rtabs双tab(仅r1/r2)；gc-feed加左右滑手势(阈值60px+横向1.2倍守卫+touchcancel清理)；roomId=r2时gc-wrap加dock类(蓝灰渐变背景+ink变量局部覆盖)；SSE接window_clear清屏(T-7配套)。前一版T-8改错了地方(public/index.html无人serve)，本次由苏煦移植到真页面
- 怎么验证：bun run build通过(2.55s)；原瑶真机验收视觉与手势
- 怎么撤销：git revert对应提交；或删掉gc-rtabs/dock/onSwipe相关五处改动重新build

