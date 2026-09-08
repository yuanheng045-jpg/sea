# sea 工作日志

> 最新在最上面。格式见 /home/cc/WORKLOG-SPEC.md（新窗口先读这份，别重新摸一遍代码）。

## 2026-09-08 · 客厅↔船坞tab切换+船坞深港雾蓝主题(真页面重做)〔T-8〕
- 改了什么：GroupPage.tsx：header下加gc-rtabs双tab(仅r1/r2)；gc-feed加左右滑手势(阈值60px+横向1.2倍守卫+touchcancel清理)；roomId=r2时gc-wrap加dock类(蓝灰渐变背景+ink变量局部覆盖)；SSE接window_clear清屏(T-7配套)。前一版T-8改错了地方(public/index.html无人serve)，本次由苏煦移植到真页面
- 怎么验证：bun run build通过(2.55s)；原瑶真机验收视觉与手势
- 怎么撤销：git revert对应提交；或删掉gc-rtabs/dock/onSwipe相关五处改动重新build

