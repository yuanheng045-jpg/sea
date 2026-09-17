# sea 工作日志

> **船坞工人须知（2026-09-13立）**：本项目真身在 `/home/cc/sea`（cc属主），ubuntu侧 `group-chat/frontend/` 镜像**长期滞后真身**（已滞后277+行），严禁整文件覆盖。改动流程：工人在镜像打补丁并推送 → 苏煦（cc身份）逐段移植真身+build。工人无需也不要申请 /home/cc/sea 写权。


> 最新在最上面。格式见 /home/cc/WORKLOG-SPEC.md（新窗口先读这份，别重新摸一遍代码）。

## 2026-09-18 · T-61-fix2思维链双击正文入口漏接滚动补偿〔T-61〕
- 改了什么：原瑶二次实测:双击展开思维链后仍被顶到下面(跟输入栏无关这次没提输入栏,更像补偿完全没触发)。回头查发现双击其实有两个独立触发入口——折叠标识按钮(thinkingTapProps,T-60/T-61改的就是这条路径)和消息正文本身(MessageBody内部useDoubleTap,T-58设计里双击正文既能收起也能展开)。第1705行MessageBody的onDoubleTap prop从T-58起就一直直接传裸的onToggleThinking,完全没接入T-60/T-61包装出来的handleThinkingDoubleTap(带滚动补偿的那个)——两次T-61改动都只改了标识按钮那条入口,正文这条入口一直在裸奔没有任何滚动补偿。这次把onDoubleTap={...onToggleThinking}改成onDoubleTap={...handleThinkingDoubleTap},统一两个入口共用同一套willExpand判定+补偿逻辑。不新增/改变滚动补偿算法本身(仍是T-61-fix那版measure真实input-bar位置的写法),不碰按钮那条入口(它本身逻辑未变,只是这次一并确认没问题)。
- 怎么验证：npm run build(tsc -b && vite build)0类型错误2.84s构建完成,index-BKygIvo3.js(CSS未变仍index-V_VOpn3V.css);tsc通过即证明handleThinkingDoubleTap(类型()=>void)与MessageBody.onDoubleTap prop签名(()=>void|undefined)兼容,替换前后类型一致。这处改动是纯函数引用替换,压缩后变量名会被mangle,不像字符串字面量能grep验证,以tsc 0错误+hash变化(内容寻址,变了说明字节级有差异)作为构建层证据。working tree混有历史遗留,awk按hunk计数(而非行号硬编码,上次T-61-fix1曾因硬编码行号踩坑误把历史遗留一起staged)精确取出仅这1处改动的hunk。真机验证待原瑶:这次麻烦区分一下双击的具体位置——点的是消息上方小小的Undercurrent标识,还是直接双击了消息正文,方便进一步定位若仍有问题该看哪条入口。
- 怎么撤销：git revert对应commit后npm run build;单行prop替换,不影响thinking数据存储与T-58双击收起/T-59开关逻辑

## 2026-09-18 · T-61-fix思维链展开对齐正文尾部被输入栏遮挡修正〔T-61〕
- 改了什么：原瑶实测反馈:双击展开后正文还是被顶到输入栏下面。查到根因:scrollIntoView({block:'end'})对齐的是.cc-messages滚动容器的padding-box底边,而.cc-messages有padding-bottom:calc(110px+var(--kb,0px))——这110px+键盘高度本就是特意垫出来给position:fixed的.cc-input-bar腾地方的遮挡区(正常滚到底最后一条消息也是靠这块padding才不被输入栏挡住)。贴那条padding-box底边=直接把正文糊到输入栏正后方,跟'只做了自动展开模式'无关——自动展开(thinkingActive/thinkingAutoExpand)那条路径本来就没有任何scrollIntoView代码,两条路径不共享这段逻辑,不存在漏改双击的情况,纯粹是对齐基准选错了。改法:不再用原生scrollIntoView,rAF里手动测量textColRef.getBoundingClientRect().bottom和document.querySelector('.cc-input-bar').getBoundingClientRect().top(输入栏当前真实屏幕位置,键盘弹出/多行输入框变高时title会跟着变,天然兼容),算出被遮住的量(overflow)后直接scroller.scrollTop+=overflow+12(scroller=el.closest('.cc-messages'),12px余量)。overflow<=0(本来就没被挡)时不触发滚动,避免无谓跳动。
- 怎么验证：npm run build(tsc -b && vite build)0类型错误2.69s构建完成,index-BO0qBu0o.js(CSS未变仍index-V_VOpn3V.css);grep产物确认scrollIntoView字符串已归零(全项目唯一一处调用点已替换为手动scrollTop计算)、cc-input-bar与.cc-messages查询字符串均在。working tree混有此前多笔历史遗留(09-16月亮开关/液态玻璃hyalite等)未提交改动,沿用先例git apply --cached做hunk级精确分离,本commit只含这1处MessageRow内的改动。真机验证待原瑶:双击展开长思维链,正文应完整露在输入栏上方不被遮挡,不需要额外手动滑动;键盘弹出时同样成立。
- 怎么撤销：git revert对应commit后npm run build;纯前端UI副作用改动(rAF内一段测量+scrollTop计算),不影响thinking数据存储与T-58/T-59/T-60的双击手势/开关逻辑

## 2026-09-18 · T-61思维链双击展开改对齐消息正文尾部〔T-61〕
- 改了什么：T-60做的是展开后scrollIntoView(思维链按钮,block:'start')把开头贴视口顶部,但思维链在正文上方,长思维链一展开就把正文挤到视口外,用户还得手动下拉才看到回复——不符合'展开后不需要额外滑动就能继续看对话'的验收要求。MessageRow内新增textColRef挂在cc-text-col(思维链+正文+图片等整条消息内容的外层容器)上;handleThinkingDoubleTap展开分支里滚动目标从thinkingToggleRef改成textColRef、对齐方式从block:'start'改成block:'end',让这条消息内容的底边贴视口底边——展开后直接看到正文(结尾),不用再拉。thinkingToggleRef声明保留(仍挂在按钮ref上,未来可能还有用,不为收窄diff额外动它)。不碰useDoubleTap双击判定本身、不碰模式A/B开关(T-59)、不碰thinking内容渲染、收起与生成中自动展开路径(willExpand为真才触发,逻辑未变)。
- 怎么验证：npm run build(tsc -b && vite build)0类型错误2.66s构建完成,index-CFWt_o9M.js(CSS未变仍index-V_VOpn3V.css,本次未碰样式);grep产物确认scrollIntoView({block:"end"}存在且block:"start"计数为0,新旧对齐方式精确替换无残留。working tree混有此前多笔历史遗留(09-16月亮开关/液态玻璃hyalite、usageAuthDays授权到期提示)未提交改动,沿用T-59/T-60先例:git diff导出CCPage.tsx全量patch后按hunk边界精确切出仅属于T-61的两段(注释+textColRef声明+scrollIntoView调用改动段、cc-text-col的ref挂载段),git apply --cached --check校验通过后分离,本commit只含T-61,历史遗留继续留在working tree未动。真机验证待原瑶:双击展开长思维链,视口应能直接看到消息正文不需手动下拉;双击收起、生成中自动展开的既有体验不受影响。
- 怎么撤销：git revert对应commit后npm run build;纯前端UI副作用改动(scrollIntoView目标+对齐方式各一处),不影响thinking数据存储与T-58/T-59/T-60的双击手势/开关逻辑

## 2026-09-17 · T-60思维链双击展开定位到内容开头〔T-60〕
- 改了什么：双击展开思维链(Undercurrent)时，之前展开后视口位置不变，长内容常年只露出末尾要手动往上拉。MessageRow内加thinkingToggleRef(挂在cc-thinking-toggle按钮上)，把原来直接传给useDoubleTap的onToggleThinking包一层handleThinkingDoubleTap：调用前先记下"当前是否折叠"(willExpand=!thinkingExpanded)，调用后仅在willExpand为真(即这一下是展开而非收起)时rAF里scrollIntoView({block:'start'})把按钮顶部贴到视口顶部。收起动作、生成中(thinkingActive)由thinkingAutoExpand驱动的live自动展开均不触发(willExpand在那些场景要么为false要么走的不是这条路径)。不碰useDoubleTap手势判定本身、不碰模式A/B开关(T-59)、不碰thinking内容渲染。
- 怎么验证：tsc -b && vite build 0类型错误3.31s构建完成，index-EmchEBd_.js(CSS未变仍index-V_VOpn3V.css)；grep产物确认scrollIntoView/"start"已在bundle里。working tree混有09-16两笔历史遗留(月亮开关/主题液态玻璃hyalite)未提交改动，沿用T-59先例：git diff导出CCPage.tsx全量patch后按hunk边界切出仅属于T-60的两段(MessageRow内thinkingToggleRef声明段+按钮ref属性段)，`git apply --cached`精确分离后本commit只含T-60，那两笔历史遗留继续留在working tree未动。真机验证待原瑶：双击折叠标识展开长思维链，视口应停在内容开头而不是末尾；双击收起、以及生成中自动展开的既有体验不受影响。
- 怎么撤销：git revert 对应commit后bun run build；纯前端UI副作用改动(一次rAF+scrollIntoView)，不影响thinking数据存储与T-58/T-59的双击/开关逻辑

## 2026-09-18 · T-59思维链自动展开开关(模式A/B可选)〔T-59〕
- 改了什么：在设置面板(SessionPanel「显示」区)加开关,localStorage(sea-thinking-auto-expand)持久化,默认沿用T-58后既有行为(模式A/自动展开)。核心改动:MessageRow内thinkingExpanded从'thinkingActive||expanded'改为'(thinkingAutoExpand&&thinkingActive)||expanded'——关掉开关后thinkingActive不再强制展开生成中的思维链;CCPage传入MessageRow的expanded计算同步加thinkingAutoExpand门控(否则流结束后autoExpanded仍会绕过开关展开);toggleThinking的isAutoExpanded参数同步改为thinkingAutoExpand门控后的值,保证模式B下双击一次就能展开/收起(不依赖autoExpanded字段)。不碰T-58的useDoubleTap/双击逻辑,不碰thinking数据传输存储。
- 怎么验证：tsc -b && vite build 0类型错误2.74s构建完成,index-cklbrfmb.js(CSS未变仍index-V_VOpn3V.css);grep产物确认sea-thinking-auto-expand字符串与显示区文案都在。发现working tree混有09-16两笔(月亮开关/未知usageAuthDays)历史遗留未提交改动,已用git apply --cached手写patch做hunk级精确分离,本commit只含T-59;那两笔历史遗留仍留在working tree未动,已在群里报给原瑶另行处理,commit前二次build已排除误回退线上功能的风险。真机验证待原瑶:设置面板「显示」区开关,关闭后生成中思维链保持折叠、双击可临时展开,刷新页面记住选择。
- 怎么撤销：git revert 对应commit后bun run build;纯前端UI状态位改动,不影响thinking数据存储与T-58双击逻辑

## 2026-09-17 · T-58思维链折叠改双击展开〔T-58〕
- 改了什么：cc-thinking-toggle折叠标识(Undercurrent标签+小图标)默认折叠态本身没动，只改触发方式：原来单击(onClick)就展开，现在改双击才展开/收起，单击不再触发，减少误触。抽了个可复用的useDoubleTap(onDoubleTap,excludeSelector)hook——把MessageBody正文原来手写的pointerdown/pointerup双击判定(360ms/28px阈值)搬进去，折叠标识按钮和正文双击收起共用同一套逻辑与参数(此前正文双击已能收起，现在标识本身也能双击触发)。不碰thinking内容传输/存储，不碰其他消息类型/工具调用展示。
- 怎么验证：tsc -b && vite build 0类型错误2.81s构建完成，index-D8m3_Ffk.js(CSS未变仍index-V_VOpn3V.css，本次未碰样式)；grep产物确认touchAction/manipulation双击手势代码在。生成中(autoExpanded)思维链自动展开的既有体验未动——thinkingActive优先级仍高于双击态，不受本次改动影响。真机验证待原瑶：历史消息默认只见Undercurrent标识，单击不再展开，双击标识或双击正文可展开，再双击收起。
- 怎么撤销：git revert 对应commit后bun run build；纯前端交互改动，不影响thinking数据存储

## 2026-09-16 · 月亮 user style 总开关 + 定时分钟任意输入
- 改了什么：CCPage.tsx: blob 新增 enabled(默认true), 编辑器加一行开关(复用工具箱 st-switch), 关=备用引擎客户端不带 style、月亮图标变淡(.cc-moon.off); 定时分钟输入框改草稿态(intervalDraft, type=text+inputMode=numeric), 空/非法不再立刻打回30, 失焦才回落, 去掉max=600任意正整数; index.css 末尾追加 .cc-moon.off/.cc-style-switch-row. 主聊天侧配套见 cc-web 台账同日条目
- 怎么验证：tsc -b && vite build 通过(index-BlfwPBL-.js / index-BACslG9u.css), dist 已含 cc-style-switch-row; 原瑶真机: 双击月亮→开关关掉→发消息看 hub 日志不再带 userStyle
- 怎么撤销：cp src/CCPage.tsx.bak-20260916-stylegate src/CCPage.tsx; cp src/index.css.bak-20260916-stylegate src/index.css; bun run build

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

