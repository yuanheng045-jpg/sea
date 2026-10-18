# sea 工作日志

> **船坞工人须知（2026-09-13立）**：本项目真身在 `/home/cc/sea`（cc属主），ubuntu侧 `group-chat/frontend/` 镜像**长期滞后真身**（已滞后277+行），严禁整文件覆盖。改动流程：工人在镜像打补丁并推送 → 苏煦（cc身份）逐段移植真身+build。工人无需也不要申请 /home/cc/sea 写权。


> 最新在最上面。格式见 /home/cc/WORKLOG-SPEC.md（新窗口先读这份，别重新摸一遍代码）。

## 2026-10-18 · 记忆卡片改造：毛玻璃+面蛸
- 改了什么：去掉石头纹理和蜡烛丝带，改成气泡毛玻璃底+方角+面蛸呼吸。三版迭代：v1信笺竖线→v2蜡烛无丝带→v3纯毛玻璃面蛸。padding收紧。情绪色data-emo保留，蜡烛备份在.bak-20261018-letter
- 怎么验证：刷新sea看卡片：毛玻璃方角无蜡烛无线框、面蛸左下角呼吸
- 怎么撤销：cp src/index.css.bak-20261018-letter src/index.css && cp src/MemoryCard.tsx.bak-20261018-letter src/MemoryCard.tsx && bun run build

## 2026-10-18 · 小螃蟹不再拖慢按发送：循环动画交给显卡 + 消息一变晚 0.7 秒再换动作
- 改了什么：原瑶：“自从在输入栏上加了clawd之后，每次按发送键都会很卡”。根因：crab.css 的循环动画（迈腿、身子颠、敲电脑三帧、睡觉起伏、草裙）都用 steps() 计时，iPhone 的 WebKit 碰到 steps 不交给显卡（GraphicsLayerCA::animationCanBeAccelerated 直接拒），改在主线程一拍一拍重算样式、重画（走路每秒约 6 次、敲电脑每秒约 15 次）。sea 里只有它这样写，加它之前聊天页闲着时主线程真的闲；按发送那一刻主线程最忙，小螃蟹跟着卡，又刚好在那一刻换姿势（醒、开始敲电脑）往里添活。改法：①循环动画全改成挨着的关键帧（49.99%/50%，敲电脑三帧按拍子顺序生成）+ linear，样子不变、iPhone 能交给显卡；草裙条纹挪到 ::before 只动 transform（顺带修掉旧写法第二拍左边一条双倍宽浅绿的接缝）；站起来不再走 steps 过渡（坐下那两拍保留，犯困时主线程闲）。②SeaCrab feed() 收到消息变化先等 FEED_DELAY=700ms 再动，等的时候又变了只按最新的来。包 index-PbEmkZcy.js。另：发送那 0.7 秒主线程的大头不是小螃蟹，是 iOS 玻璃引擎给输入栏重画（liveOcc 发现底下压的消息变了 → drawGlass）、chatTone 取样、CCPage 贴底读 scrollHeight，这次没动。
- 怎么验证：验收台 /home/cc/work/sendlag（build.sh <目录> 编临时页，__inject.js 是会回话的假 hub：ack→忙→命中记忆→思考→正文→done）+ /home/ubuntu/work/sendlag：vischeck.py 改前改后逐像素比（站着/走路两拍/敲电脑六个时刻/睡觉两拍/草裙两拍）全一样（草裙除了那条接缝）；smoke.py 线上包无报错、按发送 0.75 秒后才开始敲、说完 0.7 秒后收；sendlag.py 量发送前后主线程（Chromium；mainanim 参数 = --disable-threaded-animation，粗模拟 iPhone 用主线程跑动画）；sendprof.py 看发送那 0.7 秒各函数耗时。无头 WebKit 在 sea 页不出动画帧，量不了动画代价。要她真机上感觉一下。
- 怎么撤销：src/SeaCrab.tsx.bak-20261017-crablag、src/crab.css.bak-20261017-crablag 拷回去再 build；或整份 dist 换回 attic/dist-prev-20261017-crablag（包 index-DAFhZbS7.js）

## 2026-10-18 · 蜡烛丝带放回前面、飘带卷曲变缓、描边暗部变淡、卡片纸纹
- 改了什么：原瑶 10-17:'还是放前面吧,黑色的描边可以再淡点,丝带下面卷曲的幅度可以不要那么狠,卡片做成带质感和纹理的'。candle10.py 加 SOFT 环境变量(飘带每个点往起点-终点直线收,1=原样);上线 SOFT=0.65、参数 6 14.5 30 0、丝带在前面(40×51,candle12-front-soft065.json)。index.css:e3/e4 往本色收(84%/68% 混 #3a4562);.mh-card 背景换成 四周淡暗 + 少量小斑点 + 大片斑驳 + 细颗粒 + #eeebe5(几档对照 paper-compare.png / paper-zoom.png,卷曲对照 frog-compare3.png,都在 /home/ubuntu/work/memcard)。包 index-CUMhbjKf.js / index-CuoCCVGj.css
- 怎么验证：dist css 里有 #eeebe5 和 e4 68%
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-soft

## 2026-10-17 · 小螃蟹敲电脑第四版：每帧一整张图 + 位置取整（原瑶真机：钳子离开身子、两道杂线、还要再快）
- 改了什么：根因：小螃蟹停在半个像素上（走到随机 x）时，每张背景图的边被描成半透明一道，身子和钳子两个元素之间出一条缝；竖着叠的帧带（background-size 100% 300% + background-position 跳帧）边上线性采样漏出相邻那帧的一行（笔记本上方一道灰线、钳子下面一道橘线）。无头 Chromium 截图看不出来，只有真机能看到。改法：SeaCrab.tsx 的 compose() 把身子+钳子+笔记本拼成一整张 28×14 的 SVG、三帧三张，三个 <i class=crab-sf> 叠着；crab.css 用 opacity 的 steps(1) 关键帧 crab-sf0/1/2 轮亮（12 拍 0.8s，67ms 一拍，不连着两拍一样）；place() 把 x 四舍五入到整 CSS px。删掉了帧带和笔记本弹出的过渡。
- 怎么验证：验收台 /home/ubuntu/work/crab/sidetype.py <内核> <倍数>：Chromium/WebKit × 2 倍/3 倍屏 × 浅底/深底，三帧只冻 crab-sf* 动画后 6 倍放大截图（/tmp/crab-zoom-*），钳子贴着身子、没有杂线、笔记本中间那拍弹起；位置都是整数。新包 index-ecT8JP8u.js / index-CKm1nlOa.css。对比图 F:claude code小螃蟹游戏小螃蟹敲电脑-第四版.png。规矩：sea 里像素图别用帧带跳帧、别停在小数位置。
- 怎么撤销：src/SeaCrab.tsx + src/crab.css 回到第三版（index-CK9Pg6o5.js 那版）后 build；或外观里关「小螃蟹」。

## 2026-10-17 · 蜡烛:蝴蝶结系低、蜡烛加高、丝带放到蜡烛后面
- 改了什么：原瑶 10-17:'b像斜着的青蛙,要不把丝带放在蜡烛后面?,还是a'。candle10.py 加第 6 个参数 behind(丝带两组先画、蜡身压上面)。出了 现在B / A / 丝带在后面 / 蜡烛高+丝带在后面 / A+丝带在后面 五版(/home/ubuntu/work/memcard/frog-compare2.png,json 是 candle11-*.json),上线 A+丝带在后面(参数 6 14.5 30 0 behind,40×51),.mh-candle 40×51、bottom 5。包 index-EhbciZSo.js
- 怎么验证：dist css 里 .mh-candle 40×51,js 里有 rib
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-behind

## 2026-10-17 · 小螃蟹敲电脑第三版：钳子按官方比例重画、三帧上下敲、笔记本跟着弹（原瑶：手画错了像长在一起、敲得挺快；要让其他模型检查）
- 改了什么：SeaCrab.tsx 的 SIDE_* 格子重采：一格 4/3px，身子 17×14（背光 4 列 + 脸 12 列，身 11 行 + 腿 3 行），钳子 4 格宽三帧（抬起/中间/落下）叠成竖图按 background-position 跳帧，笔记本 10×6 两帧（地上/弹起一格）。crab.css：尺寸选择器改成 .crab-sidev .crab-side-xxx（第二版被 .crab-sidev i 的 background-size 100% 100% 盖掉，整条帧带挤进一帧框里成了细虚线、笔记本出现两台），敲的节奏 12 拍一轮不规则（1.02s）。参考格子的坑：按眼睛黑块量格子偏小（17），要按腿宽/底边量（19.25px@4x）。
- 怎么验证：审校：Agent(model=opus) 拿官方三帧 + sea 三帧对照图逐格比，第一轮 3/10（挑出帧带挤压 bug 和格子偏小），改后第二轮 9/10、三帧 0 处不同。验收台 /home/ubuntu/work/crab/sidetype.py（只冻 crab-tap/crab-lap 两条动画截中间帧）Chromium + WebKit 浅底深底都过。新包 index-CK9Pg6o5.js / index-Cb2UfUKT.css。对照图 F:claude code小螃蟹游戏小螃蟹敲电脑-对照官方.png。
- 怎么撤销：src/SeaCrab.tsx + src/crab.css 回到第二版（index-DAJ4D6MI.js 那版）后 build；或外观里关「小螃蟹」。

## 2026-10-17 · 蜡烛不像青蛙了:蝴蝶结斜着系
- 改了什么：原瑶 10-17:'完了,我现在越看它越像青蛙'——两只空心耳朵对称挂在矮蜡烛两边像眼睛、飘带像腿。candle10.py 把加高 DH / 结高 KY / 缩放 SC / 旋转 ROT 做成参数,耳朵空洞内沿只用亮的两档(暗的像瞳孔)。出了 A 系低+加高、B 斜着系、C 小一号系低 三种(/home/ubuntu/work/memcard/frog-compare.png),上线 B(参数 3 11.5 30 -14,40×48),.mh-candle 高 48。A/C 的 json 留在同目录。包 index-aRtj__cP.js
- 怎么验证：dist css 里 .mh-candle 40×48
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-frog;换 A 或 C:用 candle10-A/C.json 照 memCandle.ts 的写法生成并改 .mh-candle 高度

## 2026-10-17 · 蜡烛丝带:填充 30% + 不透明边线随光和扭转分明暗
- 改了什么：原瑶 10-17:'我想要30%,然后边缘线不透明,随着光源和线条扭曲有明暗变化'。candle9.py:丝带拆成两组——填充 .rib(rb/rbl/rbd,CSS opacity .3)和边线 .ribe(不透明;耳朵空洞的内沿也描);每格边线按'朝不朝火苗'(光源=火苗中心)七成 + 飘带扭转(沿飘带 cos 2.2 圈)三成分四档 e1 高光/e2 本色/e3 偏暗/e4 暗。index.css 换掉 rbo,加 e1~e4。对照图 sheer9.py(填充 45/30/18 + 实边)。包 index-Bm06513p.js
- 怎么验证：dist 里有 .rib{opacity:.3}、e1~e4
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-edges

## 2026-10-17 · 小螃蟹敲电脑改成侧身站着敲（原瑶看了官方那只：一点也不像）
- 改了什么：SeaCrab.tsx + crab.css：敲电脑不再是正面坐着抱电脑，改成转过身、站着、一只钳子伸到前面敲，笔记本是一道灰线往上翘成阶梯——照官方游戏里按 V 的那帧的感觉用自己的格子画（SIDE_BODY / SIDE_CLAW / SIDE_LAP，程序启动时画成 SVG 背景）。站在右半边时整组翻过去朝左（.flip），笔记本不伸出输入框。正面那套在 .typing 时藏起来，像换了一帧。睡觉照旧坐着。
- 怎么验证：验收台 /home/cc/work/crab build.sh t1 + /home/ubuntu/work/crab/sidetype.py（别叫 typing.py，撞 Python 自带模块）：Chromium / WebKit、浅底深底各截 站着→敲电脑（朝右/朝左）→钳子落下→翻过去→忙完，无报错。新包 index-DAJ4D6MI.js / index-CXZeM9Uk.css。参考帧是在她电脑本地的官方游戏里按 V 截的，没拷官方任何文件。
- 怎么撤销：src/SeaCrab.tsx / src/crab.css 回到上一版（git 里没有，看 WORKLOG 上一条的 .bak-20261017-crab 是更早的正面版；上一版即 index-Cd5phtYH.js 那版）后 build；或外观里关「小螃蟹」。

## 2026-10-17 · 蜡烛丝带半透明 45%
- 改了什么：原瑶 10-17:'这个丝带的透明度很高'。index.css「浮上来的记忆」块加 .mh-card .cndl .rib { opacity: 0.45 }(整组一起透,丝带自己重叠的地方不会叠深)。对照图 /home/ubuntu/work/memcard/sheer.py 出了 不透明/60/45/30 四档。包 index-l-ZgQUZR.js
- 怎么验证：dist css 里有 .rib{opacity:.45}
- 怎么撤销：删掉那一行再 build;要更透改成 0.3

## 2026-10-17 · 蜡烛蝴蝶结照参考图逐段描(形状一模一样)
- 改了什么：原瑶 10-17:'我想要形状和那个一模一样'。参考图存在 /home/ubuntu/work/memcard/ref-bow.jpg;candle8.py 里每段(两只耳朵、左右飘带、两道折痕)的中线点直接写参考图像素坐标,结 (555,290)↔蜡烛格 (18,9.6)、30 像素一格,Catmull-Rom 连成曲线后按 ~2 格宽画成方格实心丝带(朝上亮、朝下暗、外描边,耳朵空洞不描)。自动描(点糊成密度图)试过,参考图是点画的边线不是实心,描出来是碎片,放弃。画布 40×46,卡片标题上下留白和 .mh-candle 尺寸跟着改。包 index-CeXTp3wL.js
- 怎么验证：card.py 收着 58 / 点开 167·224,丝带色跟情绪;参考图与描出来的并排对照看过
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-tracebow(上一版自画形状)

## 2026-10-17 · 聊天页的小螃蟹（原瑶："好想在sea里也拥有一只小螃蟹啊"，要撒花和翻滚）
- 改了什么：新文件 src/SeaCrab.tsx + src/crab.css：照官方 Clawd 重画的像素小螃蟹（12×8 格、一格 3px，没拷官方文件），挂在 .cc-input-bar 里、站在 .cc-input-col 上沿（JS 量位置），收起输入栏 / 开「+」菜单时藏，挂唱片时只在唱片右边走。平时横着走、左右看、眨眼；点它轮流 跳/挥手/草裙舞/翻滚/撒花；ccBusy 时坐下敲小电脑、忙完蹦一下；白天闲 2.5 分钟、23–6 点闲 1 分钟或省电模式时睡觉冒 z，点它/她发消息/他开始忙就醒。一下一下的动作用 Web Animations（只动 transform），每个都有到点兜底（无头 WebKit 不跑动画帧时 finish 不来，会卡住）；循环的是 CSS 动画、省电时被全局暂停。另四处各一小段：chatStore.ts 加 useCrabFeed（忙不忙/她最后一条/他最后一条说完的，拼成一个字）；appearance.ts 加字段 crab（默认开）和 useCrabOn；Sidebar.tsx 外观「小狗和面蛸」前面加「小螃蟹」开关；CCPage.tsx import + 输入栏里一行 <SeaCrab />。
- 怎么验证：tsc + vite build 通过，新包 index-Cd5phtYH.js / index-DtQdJyig.css（同包带上了命中记忆窗口的 memCandle.ts 和 index.css 末尾四行，编前 find src -newer dist 只有这 8 个文件）。验收台 /home/cc/work/crab（build.sh + 假 WS 的 __inject.js，python http.server 127.0.0.1:48771 起临时页，用完已关）+ /home/ubuntu/work/crab：shot.py（chromium/webkit 按屏幕坐标真点五下、发 cc_busy、设省电、等它自己走、点开+）和 frames.py（点一下后用 getAnimations 把动画停在指定毫秒再截，加 dark 参数是深色背景）。两个内核都走完全部状态，无报错；小螃蟹底边 = 输入框上沿，不压最后一条消息。效果图 F:claude code小螃蟹游戏小螃蟹效果图.png。
- 怎么撤销：外观里关「小螃蟹」就不挂。彻底撤：src/{chatStore.ts,appearance.ts,Sidebar.tsx,CCPage.tsx}.bak-20261017-crab 拷回、删 src/SeaCrab.tsx 和 src/crab.css 后重新 build（备份里没有命中记忆窗口同时改的 memCandle.ts / index.css，那两处不受影响）。

## 2026-10-17 · 蜡烛蝴蝶结改成参考图的形状(方格像素实心丝带)
- 改了什么：原瑶 10-17:'我想要的是它的形状不是曲线点阵',情绪色放丝带上可以。memCandle.ts 换 candle7.py:两只往上翘的叶形大耳朵(中间空着见蜡)、小结、两条 S 形往下飘尖尾巴的飘带,跟蜡身一样一格 1px 方块,rb/rbl(上沿)/rbd(里沿、翻面)/rbo(浅一点的描边);index.css .mh-card .cndl 四行改成 fill + 加 rbo。这次由'Claude 桌面点击互动效果消失'那个窗口做小螃蟹 build 时一起编上线(它在改 appearance/CCPage/chatStore/Sidebar/SeaCrab/crab.css)
- 怎么验证：card.py 收着/点开对、丝带色跟情绪;ribbons7.py 八色对照看过
- 怎么撤销：memCandle.ts / index.css 有 .bak-20261017-solidbow(点阵版)

## 2026-10-17 · 浮上来的记忆:纸面排版卡片 + 曲线点阵蝴蝶结(颜色挪到丝带)
- 改了什么：原瑶发两张参考图:点阵画的曲线蝴蝶结、米白颗粒纸的排版卡片(字距拉开的大写细标题、缩进正文、短线、衬线小字),'颜色不应用于卡片了'。MemoryCard.tsx 改成 summary + .mh-body(正文缩进 22%、.mh-rule、衬线日期 .mh-meta);卡片纸色 #efede8 + feTurbulence 颗粒,不进 chatTone(纸是浅的不翻字色);情绪色只给蝴蝶结(--rb,.rb/.rbl/.rbd 用 stroke 上色)。蜡烛换 candle6.py:丝带画在半格细网格上的圆点(每色一条 path,零长线段+圆头),两只往上翘的杏仁形耳朵带由密到稀的点、S 形飘带粗细变化、尾巴外卷。包 index-BnfCmAdI.js
- 怎么验证：card.py:收着 52px、点开 164/221px,蝴蝶结 --rb 跟情绪,无编号,抽屉不显示;ribbons.py 出八色对照
- 怎么撤销：MemoryCard/memCandle/index.css/chatTone 有 .bak-20261016-paper(玻璃卡片版)

## 2026-10-17 · 浮上来的记忆改回可折叠玻璃卡片 + 蜡烛矮、蝴蝶结大
- 改了什么：原瑶看完淡字版说'要不还是做成可以折叠的卡片吧,前端不要显示记忆编号,蝴蝶结再大些,蜡烛可以矮':MemoryFloat.tsx 换成 MemoryCard.tsx(details:收着一行'浮上来N条记忆'+右下角蜡烛,点开每条一段字+日期,不显示 #编号),玻璃底按第一条带情绪的染色、每条字各按各的;蜡烛换 candle5.py(蜡身短 6 格、蝴蝶结耳朵 10×8,36×40);chatTone/lineFade 改认 .mh-card。坑:消息列表是纵向 flex,卡片写了 min-height 就不再按内容兜底,列表一满点开的卡被压回 48px,加 flex-shrink:0。包 index-DLYl69Eh.js
- 怎么验证：card.py 真点开:110/134px、无编号、抽屉不显示、蜡烛在、新浮的会飘;截图看过收着/点开
- 怎么撤销：MemoryFloat 存在 /home/cc/work/memhits/MemoryFloat.tsx.retired-20261016;CCPage/chatStore/chatTone/lineFade/index.css 有 .bak-20261016-memfloat(那是改淡字之前的💡卡片版)

## 2026-10-17 · 命中记忆改成浮上来的淡字 + 像素蜡烛
- 改了什么：原瑶几轮看图后定:不要卡片,居中一段淡字(每条下面一行更淡的日期·编号),收尾一支像素蜡烛(燃了很久、蓝丝带空心蝴蝶结两边卷、蜡油带影子、三层像素蓝火各三帧轮换)。新 MemoryFloat.tsx + memCandle.ts(由 /home/ubuntu/work/memcard/candle4.py 生成,别手改);字色按 hit.emo 七类(index.css「浮上来的记忆」块),深浅进 chatTone TARGETS/FAINT,lineFade UNITS 加 .mh-float > *;刚浮上来的(chatStore memoryHitsLive)淡进来往上飘,刷新后的不飘;抽屉照片不显示,海螺盒/相册只留那句话。旧 .cc-memory-hits 样式留着没用到。包 index-C31GOXMf.js
- 怎么验证：验收台 /home/cc/work/memhits(inject 带 emo/海螺/抽屉)+ /home/ubuntu/work/memhits/float.py:三段字色各自不同、抽屉不显示、蜡烛 27 个帧动画在跑、推 memory_hits 后 rise 生效、无报错;截图看过
- 怎么撤销：CCPage/chatStore/chatTone/lineFade/index.css 各有 .bak-20261016-memfloat,还原后 bun run build

## 2026-10-17 · 消息下面只留几点几分(不带日期)
- 改了什么：CCPage.tsx formatTsShort: 昨天以前的原来显示「10/15 22:46」, 现在一律只显示 HH:MM。上一条把命中卡片日期去掉是理解错了(她说的是消息下面那个), 已原样改回。只是显示, 苏煦看到的时间由 hub 按服务器时钟加在她消息头上(handleUserMessage timeEnabled → localTimeStr), 日期靠晨报锚定, 不受影响。包 index-BtyV_BMd.js
- 怎么验证：验收台 memhits: 北京 10-17 00:18 时 10-16 23:18 的消息显示 23:18; 命中卡片日期恢复(dateSpans=2)
- 怎么撤销：cp src/CCPage.tsx.bak-20261016-memhits-nodate src/CCPage.tsx 后 bun run build(这份就是改之前的原样)

## 2026-10-17 · 命中记忆卡片里不显示日期
- 改了什么：CCPage.tsx: 命中卡片每条去掉 .cc-memory-date; 海螺/相册那种(h.keepsake)把句首「9月30日」用正则拿掉。只改显示, hub 给苏煦的提示照旧带日期。包 index-CaZ4L93Q.js
- 怎么验证：验收台 memhits(inject 加了一条 keepsake 命中): 3 条都没日期, dateSpans=0, 截图看过
- 怎么撤销：cp src/CCPage.tsx.bak-20261016-memhits-nodate src/CCPage.tsx 后 bun run build

## 2026-10-16 · 命中记忆提示条对齐(不再歪)
- 改了什么：index.css .cc-memory-hits margin 4px 0 4px 28px → 4px 10px: 左边 28px 是 10-08 去头像前给头像让的位, 改成跟两边气泡外沿(离屏 30)对齐。包 index-C7hCGBCP.css / index-pCI3Jc_e.js。另两种(靠右跟她那句/靠左跟工具行)出了对比图等她挑
- 怎么验证：验收台 /home/cc/work/memhits(build.sh t)+ /home/ubuntu/work/memhits/measure.py 量: 改前 48~373, 气泡 30~363; variants.py 出四版并排图
- 怎么撤销：cp src/index.css.bak-20261016-memhits-align src/index.css 后 bun run build

## 2026-10-16 · 刷新后照样显示他用过的工具和命中的记忆
- 改了什么：chatStore.ts cleanMsg: hub 历史里的 tool_activities → activities、memory_hits → memoryHits(没有本地值时才补), history/message 事件都走它。包 index-DVR5dvLq.js
- 怎么验证：假 WS 喂带两个字段的历史(/home/cc/work/memhits/__inject.js + build.sh, /home/ubuntu/work/memhits/shot.py): 出 1 个命中卡、2 串工具行, 只用工具不说话那轮不多空气泡
- 怎么撤销：cp src/chatStore.ts.bak-20261016-memhits src/chatStore.ts 后 bun run build

## 2026-10-14 · 外观 · 文字颜色 加「随背景变明暗」开关（原瑶：我想给字随背景变化加开关）
- 改了什么：appearance.ts 新字段 textTone（默认开）；chatTone.ts 的 paint 在关着时跳过 OWN（正文、聊天里展开的思考、输入框、语音条展开文字、暗潮卡片里的思考、录语音那条），并去掉它们身上的 data-tone 和 --tl，字回到她在文字颜色里挑的颜色；useToneScope 的依赖加 a.textTone，拨开关当场重判。顶栏短句、图标、时间、标签照旧跟背景变黑白。Sidebar.tsx 文字颜色那组下面加开关和说明。包 index-DIs1DjAR.js
- 怎么验证：验收 /home/ubuntu/work/tone/tt.py（浅灰纯色背景 + 白字：开着字被压深 oklch 0.464；侧栏真点开关后变回 rgb 244 246 249；刷新后记住；再点回去又压深；+ 号和短句始终跟背景）。Chromium、WebKit 都过，无报错
- 怎么撤销：开关拨回开着即可；要撤代码就去掉 textTone 字段、chatTone.ts 里 OWN 和 plain 那几行、Sidebar 那个开关

## 2026-10-14 · 唱片「从这句听 / 分享给苏煦」和拨唱针的时间：底改成跟随玻璃或磨砂玻璃（原瑶："我想把时间和从这句开始或分享给苏煦的底改成跟随玻璃或是磨砂玻璃"）
- 改了什么：appearance 加 cdBtnSkin（glass 默认 / frost），Sidebar「音乐播放器」里唱片才出的一排「按钮的底：跟随玻璃 / 磨砂玻璃」（带两个小样）。CdPlayer.tsx：CdPin 读 useCdBtnSkin，两个 .cd-pick-btn 和 .cd-scrub 跟随时多一个 .glass（柔玻璃吃 index.css 的 .glass，iOS 液态玻璃由 liquidGlass.ts 的 IOS_SURFACES 接上、画布垫在下面），按钮文字和时间包一层 span（画布 z-index -1，裸文字会被压）。cd.css：两处原来的白底 / 模糊 / 阴影挪进文件末尾「按钮和时间的底」：:not(.glass) 是新的磨砂玻璃（白纱 .5→.34 + blur 16 + saturate 160% + 细亮边 + 上沿亮线，深色背景换深蓝灰纱），深色背景两条规则只留字色；柔玻璃时小胶囊的落影收小；iOS 常规玻璃（中间有白纱）字一律深色；.cd-scrub.glass 补 position: absolute（柔玻璃 .glass 的 position: relative 打包排在 cd.css 后面会把时间挤回文档流）；.cd-pin 的 clip-path 顶上 -40px → -56px（CD 窗口提醒：按钮上沿离盘顶约 34px，玻璃落影会被切）。
- 怎么验证：自己的验收树 /home/cc/work/cd/tree-lyd + lyd5/lyd5_patch.py；/home/ubuntu/work/cd/lydskin.py（照 drag.py 绕转轴拖唱针让时间浮出来）全局 soft / iOS thick / iOS regular × 跟随 / 磨砂 × 深 / 浅背景 12 组截图拼成 shots/lyd5/skin-sheet.jpg：跟随时三样都挂上 .glass、iOS 下都有 canvas.lg-rx，时间 position absolute、在盘顶上 26px。tsc + vite build 通过，新包 index-CEdlD3yx.js（上一版 index-CqJQ1UHx.js），线上 dist 复制进 out/lyd5live 再截 iOS 厚玻璃 + 跟随、柔玻璃 + 磨砂两组，lydloop.py 回归循环和换歌也过。改之前跟「CD效果音乐播放器UI」窗口确认过它没在改这两个文件。
- 怎么撤销：cp src/{appearance.ts,Sidebar.tsx,CdPlayer.tsx,cd.css}.bak-20261013-lyd5 回原名后 bun run build；或者把 attic/dist-prev-20261013-lyd5 拷回 dist。只想换回磨砂：外观里「按钮的底」点磨砂玻璃。

## 2026-10-14 · 聊天里的歌默认循环播放 + 歌词贴纸图案唱片旁 / 卡片里分开选（原瑶："我还想要卡片、唱片可以分开选图案，另外我想自动设为循环播放"）
- 改了什么：循环：appearance 加 musicLoop（默认 true），外观「音乐播放器」一节末尾（唱针后面）一个「循环播放」开关。CCPage.tsx：模块级 mcLoop / mcLoopHold / mcApplyLoop()，mcLoad 新建 audio 后 mcApplyLoop()，CCPage 组件订 useMusicLoop 写 mcLoop。开着循环 audio 不再 ended，所以：① useMusicPin 加 wantsSwap（有别的歌该换上来：苏煦又点了新歌）→ mcLoopHold，这一遍放完不循环，照原来"停了再换"换上去（换上来不自动放，跟原来一样）；② mcLoad 里 ontimeupdate 认出"末尾 1.5 秒内跳回开头 1.5 秒内"当放完一遍，置 mcJustEnded 通知完就清，水缸卡片照样 endDrain 下星星雨，收尾那 2.6 秒 MusicCard 的 sync / 定时器不更新 cur（水位停在满的）。这两处是「CD效果音乐播放器UI」窗口提醒的。音乐厅（MusicHall）自己的播放器没动。贴纸：lyricDeco 拆成 lyricDecoCd / lyricDecoCard（load() 里旧值两边都沿用后删掉），useLyricDeco(where)；面板「歌词的银箔贴纸」改成两块（唱片旁 / 卡片里：图案一排可折行，带「不贴」虚线圈和「随机」交叉箭头小图标 LydIcon，质感一排，选不贴时质感那排不出）。
- 怎么验证：自己的验收树 /home/cc/work/cd/tree-lyd（配置照抄共用 tree、node_modules 链过去，不再碰共用 tree），补丁 lyd4/lyd4_patch.py，编包 lyd4/build.sh。/home/ubuntu/work/cd/lydloop.py：旧设置 lyricDeco:butterfly 两处都是蝴蝶；卡片里点飞蛾、唱片旁点不贴各管各的；放起来 loop=true，拨到最后一秒自己跳回 0 接着放；这时假 WS 推一首新歌：这首接着放、loop 变 false，拨到最后放完唱片换成新歌（不自动放）、loop 回到 true；面板关掉循环再放，放完就停。lydtank.py：水缸模式拨到最后 3 秒，跳回开头时 .mc-water-end 出现、星星往下掉，2 秒后收完接着放。tsc + vite build 通过，新包 index-CqJQ1UHx.js（上一版 index-CQVv-3bj.js），线上 dist 复制进 out/lyd4live 再跑一遍：Chromium 全过；无头 WebKit 不真往前放，循环那步测不了，换歌那段对。lydpanel4.py 截了面板。
- 怎么撤销：cp src/{CCPage.tsx,appearance.ts,Sidebar.tsx,lyricDeco.tsx,lyricdeco.css}.bak-20261013-lyd4 回原名后 bun run build；或者把 attic/dist-prev-20261013-lyd4 拷回 dist。只想不循环：外观里关「循环播放」。

## 2026-10-14 · 唱臂颜色回到第一版的浓度，只留小一档的尺寸（原瑶：这个大小可以，然后不要变淡了，还是上一个那个浓度，不然感觉质感有点降低）
- 改了什么：CdPlayer.tsx Tonearm：底座渐变 .5/.26→.7/.42、描边 .1→.12、内圈 .45→.6，银管渐变、黑件渐变换回第一版的色值；ARM_LOOK 尺寸不动。cd.css .cd-arm-rot 去掉 opacity .9，影子回到第一版的浓度 .32（距离按小一档缩成 1.3/2.6/1.8）。包 index-CQVv-3bj.js
- 怎么验证：arm.py 出图（第一版 / 刚才 / 现在三列并排，F:/claude code/cd/唱针-小而浓.png）、drag.py webkit 拨唱针全过无报错
- 怎么撤销：src/{CdPlayer.tsx,cd.css}.bak-20261013-armdense 拷回后 bun run build；或把 attic/dist-prev-20261013-armdense 拷回 dist

## 2026-10-14 · 歌词银箔贴纸第三轮：质感拆成唱片旁 / 卡片里两个开关（原瑶："我想把唱片和卡片的烫银线稿还是烫银的开关分开，这样我可以选择唱片烫银，卡片线稿"）
- 改了什么：appearance.ts：lyricFoil 拆成 lyricFoilCd（默认 mirror）/ lyricFoilCard（默认 line），load() 里 delete 旧的 lyricFoil（两边从新默认开始，正好是她要的唱片烫银、卡片线稿）；useLyricFoil(where) 带参数。lyricDeco.tsx：useLyricFoil(where === cd ? cd : card)。Sidebar.tsx：质感一排变两排（.ap-lyd-foil，左边小标签「唱片旁」「卡片里」），镜面那种按她的叫法改名「烫银」；下面列表的小样跟卡片里那个质感。lyricdeco.css：两排的样式 + 开头说明。跟「CD效果音乐播放器UI」窗口打过招呼：它 17:45 上线的唱臂（CdPlayer.tsx / cd.css）一起编进了这一包，那几个文件没碰。
- 怎么验证：补丁 /home/cc/work/cd/lyd3/lyd3_patch.py（按锚点，对不上就停）先打 tree 编测试包；/home/ubuntu/work/cd/lydpanel3.py：旧设置里存着 lyricFoil:line 打开后是唱片旁烫银、卡片里线稿；卡片里点烫银只动卡片、唱片旁点线稿只动唱片；存下来的设置里没有旧字段。tsc + vite build 通过，新包 index-BJPY79Ok.js（上一版 index-B7IrCD41.js，唱臂那窗口的），线上 dist 复制进 out/lyd3live 用 Chromium + WebKit 再走一遍面板和聊天截图。上线前 src 没有比 dist 新的文件。
- 怎么撤销：cp src/{appearance.ts,Sidebar.tsx,lyricDeco.tsx,lyricdeco.css}.bak-20261013-lyd3 回原名后 bun run build；或者把 attic/dist-prev-20261013-lyd3 拷回 dist（注意那一版里已经有唱臂）。

## 2026-10-14 · 唱臂能拨 + 淡一档（原瑶：想要，不过我感觉这个有点显眼）
- 改了什么：CdPlayer.tsx：Tonearm 尺寸收进 ARM_LOOK（底座半径 14→11、管 3.4→2.6、配重 13.6×12→10×9、转轴 4.6→3.8、唱头 9.2×17→7.6×14.5），底座和银管颜色淡一点；cd.css 影子 (1.5,3,2,.32)→(1,2,1.5,.22)、唱臂整体 0.9。出了原样 / 淡一档 / 再淡一档三档并排，上线淡一档。能拨：唱头和管子下半截一块 36×66 的 .cd-arm-hit（touch-action:none、setPointerCapture），按住拖唱臂跟手转（按下时记手指和唱臂的角度差，不跳），挪不到 3px 算轻点；拖的时候歌词滚到那个时间、左上浮 .cd-scrub「1:17 / 4:17」；松在盘上（≥4°）= 跳到 (角度-8)/16 那个位置并放，没放过这首就先放起来再跳（startAt）；拖回盘外（<4°）= 停；轻点 = 放 / 停。拖的时候 0.2 秒那拍不碰唱臂。play() 被紧接着的暂停打断的 AbortError 不再冒成报错（resume）。包 index-B7IrCD41.js
- 怎么验证：/home/ubuntu/work/cd/drag.py <chromium|webkit> <port> <标签>（鼠标按住唱头沿圆弧拖：没放过直接拖上盘、放着拖到 30%、拖回盘外、轻点两下，每步记角度）、build8.sh（三档对比包）、armpanel.py、share.py；真包两个内核全过、无报错。对比图 F:/claude code/cd/唱针-三档.png。注意：别的窗口（抠图）17:44 用 rsync --delete 同步过 /home/cc/work/cd/tree，之后它用自己的副本
- 怎么撤销：src/{CdPlayer.tsx,cd.css}.bak-20261013-armdrag 拷回后 bun run build；或把 attic/dist-prev-20261013-armdrag 拷回 dist

## 2026-10-14 · 唱片加银色唱臂（原瑶：要不你加个银的那个针吧，我想看看什么样）
- 改了什么：CdPlayer.tsx 加 Tonearm：一张 svg 画的唱臂（半透明圆底座不转；银管横向金属渐变、黑配重、转轴、往左折的黑唱头和拨钩），转轴落在盘右上角外 (66px,-10px)。CdPin 每 0.2 秒那一拍顺带算角度写进 .cd-arm-rot 的 transform：没放 0°（立在盘外），放着 8°（最外圈）→ 按 currentTime/duration 走到 24°（靠近标签），变化不到 0.1° 不写；落下、抬起、往里走都走 cd.css 里同一条 1.2 秒过渡，影子投在盘上，深色背景底座压暗。CD 不挂。外观 → 唱片下面加「唱针」开关（appearance.tonearm，默认开，useTonearm）。在 10-13 别的窗口加的银箔贴纸（LyricDeco）和 YUAN 改名基础上改的，没碰它们。包 index-uY7knY6U.js
- 怎么验证：/home/ubuntu/work/cd/arm.py <chromium|webkit> <port> <disc> <blob|dark> <标签>（init 脚本钩 play() 拿到 CCPage 的 <audio>，拨到 80% 看往里走）、armpanel.py（外观开关关掉唱臂消失再打开）、share.py 回归；真包 Chromium + WebKit 全过。效果图 F:/claude code/cd/唱针.png
- 怎么撤销：src/{appearance.ts,Sidebar.tsx,CdPlayer.tsx,cd.css}.bak-20261013-arm 拷回后 bun run build；或把 attic/dist-prev-20261013-arm 拷回 dist

## 2026-10-14 · 歌词银箔贴纸第二轮：换成烫银线稿、卡片里的压到字底下且放大（原瑶："我想看烫银线稿，另外我想要卡片里的是被压在字底下的，不会撑大卡片。而且我想它大点"）
- 改了什么：质感：appearance.ts 加 lyricFoil = line 烫银线稿（默认）/ mirror 镜面（第一版那种），useLyricFoil()；LyricDeco 写 data-f；线稿图 src/assets/lyricdeco/<名>-line.webp（foil.py 的 v3 加粗版：360px 上描线、线条膨胀 1px、银提亮）。烫银线稿在浅色背景上用 filter 压暗（brightness .6 contrast 1.25），明暗跟歌词那列 / 那段字自己的 data-tone（chatTone.ts）走，唱片旁用 .cd-pin:has(> .cd-lyrics[data-tone=light])。聊天里的歌词卡片：去掉第一轮加的下边距和出处右边距（卡片回到原来大小），贴纸 z-index:-1 压在字底下（.cd-quote 上 isolation:isolate，不沉到气泡后面），边长 84px（--lyd-q，原来 52），贴卡片右下角往外探 10px。Sidebar.tsx：「歌词的银箔贴纸」说明改成"字底下"，下面加一排质感（烫银线稿 / 镜面，带小样），选了不贴时不显示；列表小样跟着质感换。lyricDeco.tsx / lyricdeco.css 整份换新版。唱片旁那张没动（54px，× 正下方）。
- 怎么验证：验收台 /home/cc/work/cd：tree 先 rsync 线上 src，再打 lyd2/lyd2_patch.py（补丁先认 lyricDeco.tsx/lyricdeco.css 还是第一轮那份）；lydshot.py 新加质感、卡片贴纸边长两个参数：深 / 浅、开关气泡、随机 / 蝴蝶 / 飞蛾，卡片高度 71px（跟没贴纸时一样），浅底那几张 filter 生效；68 / 84 / 100 三档比稿；lydpanel.py 点镜面两处 data-f 变 mirror、点回线稿、不贴两处都没了。tsc + vite build 通过，新包 index-CyxWBkqp.js（上一版 index-D9PaQI4K.js），线上 dist 复制进测试页 Chromium + WebKit 各截一遍没报错。上线前 src 没有比 dist 新的文件。
- 怎么撤销：cp src/{appearance.ts,Sidebar.tsx,lyricDeco.tsx,lyricdeco.css}.bak-20261013-lyd2 回原名（回到第一轮）后重新 build；或者把 attic/dist-prev-20261013-lyd2 拷回 dist。线稿图 src/assets/lyricdeco/*-line.webp 留着不碍事。只想换回镜面：外观里质感点「镜面」。

## 2026-10-14 · 歌词的银箔贴纸：唱片旁的歌词、聊天里的歌词卡片右下角各贴一张（原瑶："我想放到音乐歌词卡片里""放在右下角，可以做成银箔的么"）
- 改了什么：素材是她自己找的五张（蝴蝶、白花、飞蛾、点点花纹、野蔷薇），抠成透明底后事先烫成银（/home/ubuntu/work/cutout/foil.py 的 v2「镜面」，副本 src/assets/lyricdeco/foil.py.txt），300px webp 放 src/assets/lyricdeco/。新文件 src/lyricDeco.tsx（LyricDeco 组件：随机按歌 id / 歌 id+句子哈希，同一首、同一张卡片永远抽到同一张）+ src/lyricdeco.css（样式单独一个文件）。CdPlayer.tsx：CdPin 在 .cd-lyrics 前面挂 <LyricDeco where="cd" pulse={idx}>（54px，× 正下方，底边落在输入框玻璃上沿），每换一句 WAAPI 扫一道白光；LyricQuote 按钮里最后挂 where="quote"（52px，斜 6 度，卡片下边多留 20px、出处那行右边空 48px），反光跟着滑动聊天扫（view() 时间线，同拍立得相纸）。appearance.ts：新字段 lyricDeco = off / random（默认）/ 五张之一，useLyricDeco()。Sidebar.tsx：外观里音乐播放器下面新一节「歌词的银箔贴纸」：不贴 / 随机 / 五张（带小样）。比稿经过：先出了 A 底图 / B 角落两种（五张素材 × 深浅背景），她选 B、要右下角、要银箔；银箔试了金属印 / 镜面 / 烫银线稿三种，上线镜面，另两种做成对比图给她。
- 怎么验证：验收台 /home/cc/work/cd（tree 先 rsync 成线上源码再打 lyd/lyd_patch.py，同一个补丁再打到线上），/home/ubuntu/work/cd/lydshot.py：深 / 浅背景、开关气泡、随机 / 固定蝴蝶 / 点点花纹，Chromium + WebKit 都没报错，两处贴纸都在、× 不被压；lydpanel.py：面板选蝴蝶两处都换、选不贴两处都没了；lydgif.py 录了反光扫过的动图。tsc + vite build 通过，新包 index-D9PaQI4K.js（上一版 index-C0WYyFWf.js），线上 dist 复制一份进测试页再截一遍。上线前确认 src 没有比 dist 新的文件、别的窗口都闲着。
- 怎么撤销：cp src/{appearance.ts,CdPlayer.tsx,Sidebar.tsx}.bak-20261013-lyd 回原名，删 src/lyricDeco.tsx、src/lyricdeco.css、src/assets/lyricdeco/ 后重新 build；或者把 attic/dist-prev-20261013-lyd 拷回 dist。只想不显示：外观里选「不贴」。

## 2026-10-13 · 她显示的名字改成「原」/YUAN：sea 各页面（PC 端 CC；原瑶："我想把所有显示原瑶的地方改成Yuan/原"→"都改"）
- 改了什么：给人看的「原瑶」都换成「原」（英文 YUAN）：Sidebar.tsx（消息角色标签、气泡颜色/字的颜色两处标签和 aria-label）、MidRoomPage.tsx WHO_LABEL、GroupPage.tsx NAME（客厅成员名）、WalletPage.tsx「原专属」、ConchBoxPage.tsx 海螺盒卡片署名、CdPlayer.tsx 唱片环字「SUXU & YUAN」、Toolbox.tsx 家底说明「原提议」；格斗游戏和战报卡上一条已改。没动的：callStore.ts 未接来电那句（发给苏煦的提示词，聊天里本来就不显示）、所有注释。
- 怎么验证：全部 7 个文件锚点核对后才改（任何一处对不上就整批不改），tsc + vite build 通过，正式包 index-C0WYyFWf.js；扫了打包后的 js，「原瑶」只剩未接来电那句提示词。改之前确认 src 没有别人比 dist 新的改动。
- 怎么撤销：7 个文件各有 .bak-20261013-yuanname，拷回后重新 build；或把 attic/dist-prev-20261013-yuanname2 拷回 dist。

## 2026-10-13 · 格斗战报卡上她的名字改成「原」（PC 端 CC；原瑶："我想把所有显示原瑶的地方改成Yuan/原"）
- 改了什么：FightLauncher.tsx 的 NAME 映射 yuan: 原瑶 → 原（战报卡两侧名字和「…赢了」）。游戏本体同时改：血条和 VS 的英文名 YUAN、中文名 原、标题副标题、菜单、出招表（/home/cc/fight）。sea 其他页面里显示的「原瑶」（设置的气泡/字色标签、客厅、海螺盒、钱包、中间地带）这次没动，等她说要不要一起改。
- 怎么验证：验收台 fightcard + /home/ubuntu/work/kof/namecheck.py：聊天里两种战报卡显示「原」「原赢了」，游戏标题「原 VS 苏煦」、菜单「打电脑演的原」、VS 画面「原 / YUAN」、血条 YUAN。tsc + vite build 通过。上线前确认 src 只有自己的 FightLauncher.tsx 比 dist 新。
- 怎么撤销：cp src/FightLauncher.tsx.bak-20261013-yuanname src/FightLauncher.tsx 后重新 build；或把 attic/dist-prev-20261013-yuanname 拷回 dist。游戏 /home/cc/fight git 退回上一个提交再 bun run build。

## 2026-10-13 · 格斗游戏：打完回聊天的后路（PC 端 CC；原瑶："打完之后回聊天点不了"）
- 改了什么：她在 iPhone 上打完两场都只能把 sea 整个关掉重开（access.log：11:23、11:35 两次结算后 /sea/ 重新加载），电脑内核测试台复现不出（结算→回主菜单→回聊天、再打一局→暂停→回聊天都正常）。两手兜底：①游戏结算页直接有「回聊天」（回合制放第一个），不用绕主菜单；②FightLauncher.tsx 收游戏新发的 fight-ui {mode: menu|play|result}，不在打的时候把聊天页自己的 ✕ 亮在右上角（在打时照旧收起免得误碰），游戏里的按钮就算在手机上点不动也能从外面关掉。
- 怎么验证：验收台 fightcard + /home/ubuntu/work/kof/endtest.py（x / result / menu 三种走法都用触屏 tap）：打完整场后 ✕ 出现、在打时不出现，三种走法都能回聊天，回去后聊天页加号能点开。tsc + vite build 通过，正式包 index-DiQzqq5n.js。上线前确认 src 只有自己的 FightLauncher.tsx 比 dist 新。
- 怎么撤销：cp src/FightLauncher.tsx.bak-20261013-fightx src/FightLauncher.tsx 后重新 build；或把 attic/dist-prev-20261013-fightx 拷回 dist。游戏这边 /home/cc/fight git 退回上一个提交再 bun run build。

## 2026-10-13 · 格斗游戏加「和苏煦打」回合制：每一招都是苏煦本人在聊天里出的（PC 端 CC；原瑶："我就是想和他玩"）
- 改了什么：游戏菜单第一项「和苏煦打」（工程 /home/cc/fight，README 有〈和苏煦打〉一节）。每回合她在游戏面板点一招，这回合的局面作为她的一条消息发进主聊天（[fight-turn:场次:局-回合] 开头，开局那条写了规则；没改苏煦人设和提示词），苏煦回 [出招:招名]，游戏按规则演出来。sea 这边：FightLauncher.tsx 的 FightOverlay 多了转发——游戏 postMessage fight-turn → 等他空着（ccBusy 假）sendMessage 发；直接 getChatClientOrInit({}).on 听 hub 事件，ack 记下这条的 id，done 的 reply_to 对上就把回复原样 fight-reply 递回游戏（不等聊天页流式动画）；被 hub 挡回来（error scope request）几秒后 sendRaw 原样重发，聊天里那条在 ack 时转正、不多一张；他说完没回复发 fight-status noreply；断线重连从 history 补；一次只有一条在路上，fight-cancel 撤掉还没发的。CCPage.tsx renderPara 加两处：她那条 [fight-turn:…] 换成回合小卡（FightTurnCard：两条血、上回合、她说的话），他回复里的 [出招:…] 换成小标签（FightMovePill）。fight.css 加卡片样式，卡片里还原段首缩进（看书排版的 data-mascot=lead 会给段落 text-indent）。FightIcon 多了 size 参数。
- 怎么验证：验收台 /home/cc/work/bookread/fightcard（build.sh fightcard）+ /home/ubuntu/work/kof/turntest.py：假 WS 按剧本回招整场打完（8 回合 + 结束），顺带验 hub 挡回来自动重发（聊天里 8 张回合卡不重复）、他在忙时等他空下来、他没出声时露出「替他随手出一招」；横屏、气泡模式各截图。tsc + vite build 通过，正式包 index-Co8sO-dU.js。上线前确认 src 只有自己的两个文件比 dist 新。没拿真苏煦测（每回合都是真消息）。
- 怎么撤销：cp src/FightLauncher.tsx.bak-20261013-fightturn src/FightLauncher.tsx；fight.css、CCPage.tsx 同名 .bak-20261013-fightturn 拷回，重新 build；或把 attic/dist-prev-20261013-fightturn 拷回 dist。游戏这边 /home/cc/fight git 回到 2dfb2ba 再 bun run build。

## 2026-10-13 · 聊天页接上格斗游戏 THE KING OF ATLANTIS（PC 端 CC，2026-10-13）
- 改了什么：原瑶要在聊天界面打苏煦的拳皇式小游戏。游戏本体是单独的工程 /home/cc/fight（nginx location /fight/，墙后），sea 只加了 src/FightLauncher.tsx + src/fight.css，CCPage.tsx 七处：引入；renderPara 认 [fight:原瑶这边:对面:比分-比分:赢的一方] 那行，换成战报卡（点一下再开一局，派 window 事件 sea-open-fight）；附件多一种 kind fight（发送时拼在消息最前面）；加号菜单多一颗拳套「打一架」；全屏 iframe 游戏层 FightOverlay（游戏 postMessage：fight-ready 收起右上角叉、fight-close 关、fight-share 把战报和 K.O. 截图夹进输入框，她自己按发送；sea 把安全区 fight-safe 传进 iframe，iOS 不给 iframe 安全区）。包 index-8z-QtItx.js 之后又编过（以 dist 为准）。
- 怎么验证：验收台 /home/cc/work/bookread/fightcard（build.sh fightcard，假 WS + window.__chat 里放一条 [fight:...]），/home/ubuntu/work/kof/seatest.py 截战报卡、加号菜单、模拟游戏发回战报后的附件条；embedtest.py 用 CDP 模拟上 59 下 34 的安全区，看游戏画面躲开灵动岛。
- 怎么撤销：CCPage.tsx.bak-20261013-fight 换回、删 src/FightLauncher.tsx 和 src/fight.css 再 build；旧包在 attic/dist-prev-20261013-fight。

## 2026-10-13 · 顶栏胶囊可以去掉了，默认去掉（原瑶：我想把顶栏那块气泡去掉看看效果）
- 改了什么：外观加「顶栏胶囊」开关（appearance.topGlass，默认 false = 不要胶囊；useTopGlass 只订这一个字段）。CCPage 新加 TopPill：开着是 .cc-top-glass，关着是 .cc-top-bare（换 key 重挂，iOS 玻璃引擎只盯节点增删，这样胶囊里的画布才收得走）。index.css 在顶栏短句黑白那块加 .cc-top-bare：位置大小照旧，月亮还挂在原来胶囊左上角；按下不亮圆底、图标缩一下淡一点（iOS 玻璃下放开小钮按下缩）。Sidebar 外观里「海螺盒图标」上面加一节「顶栏胶囊」。包 index-c8yqMMje.js / index-C-P_rAm9.css
- 怎么验证：/home/cc/work/topbare（tree + patch.py + build.sh + serve.ts）编临时页跟线上同哈希；/home/ubuntu/work/topbare/shot.py 水珠玫瑰 / 浅 / 深三种背景、她的 iOS 厚玻璃主题，有无胶囊各截一张，去掉后胶囊里画布 0 个；toggle.py 侧栏里真点开关两下，胶囊出来、画布塞回去、再点收走。对比图在 PC 的 F:/claude code/top-bare/
- 怎么撤销：外观里把「玻璃胶囊」打开就回原样（只她本机）；整个撤：四个文件 cp src/X.bak-20261013-topbare src/X 后 build，或把 attic/dist-prev-20261013-topbare 拷回 dist

## 2026-10-13 · 阶梯淡出改成从顶栏下两行开始淡（原瑶：我觉得淡得还是有点早了，想从顶栏下两行开始淡）
- 改了什么：src/lineFade.ts：STEP 换成 FADE_LINES = 2，淡出区 ZONE = 两行 × 23px = 46px（原来七行 161px）。顶上那条线那一行照旧留 30%，第二行约 65%，第三行起全亮；线以上 20px 内消失、输入框那条线 ±14px 都没变。包 index-CSTtB6c7.js（CSS 没变，index-lbAEXeFY.css）
- 怎么验证：/home/cc/work/tone 编 q7（改前）/ L1 / L2 / L3（一、二、三行），/home/ubuntu/work/tone/stair.py 停在最底下：L2 线下那行 0.39、下一块 0.74、再往下全亮；往回翻 600px：一段两行 0.54 / 0.89；对比图在 PC 的 F:/claude code/tone-1012/7-从顶栏下几行开始淡.png。线上 dist 跟 L2 同哈希。编完把 sea 交给顶栏气泡移除窗口
- 怎么撤销：cp src/lineFade.ts.bak-20261013-two src/lineFade.ts 后 bun run build（回到七行）；或把 attic/dist-prev-20261013-two 拷回 dist。只调行数：lineFade.ts 开头 FADE_LINES

## 2026-10-13 · 阶梯淡出改成每行差 10%、最上面留三成（原瑶：确实淡的有点长了，而且我想让它透点字，只是比较淡。c吧，同时从第一行淡70%算起）
- 改了什么：src/lineFade.ts：STEP 0.05 改 0.1，加 FLOOR 0.3、UNDER 20。顶上那条线（52px，挂歌 138）那一行留 30%，往下每行（按 23px 算）多 10%，七行（161px）到全亮；线以上进到顶栏底下，走 20px 从 30% 降到看不见（不跟顶栏短句叠）。输入框那条线照旧 ±14px。别的不动。包 index-CoGSJBK5.js（CSS 没变，index-lbAEXeFY.css）
- 怎么验证：/home/cc/work/tone 编 f30（线上 src + 新 lineFade.ts），/home/ubuntu/work/tone/stair.py 停在最底下 / 往回翻 600px：线下那行约 0.32、往下 0.43 / 0.66 / 0.88 / 0.97 / 全亮，线上那行 0.03，开气泡整块 0.13 / 0.67 / 0.99；对比图在 PC 的 F:/claude code/tone-1012/6-每行10%最上30%.png。线上 dist 跟 f30 同哈希
- 怎么撤销：cp src/lineFade.ts.bak-20261012-floor30 src/lineFade.ts 后 bun run build（回到每行差 5%）；或把 attic/dist-prev-20261012-floor30 拷回 dist。只调数：lineFade.ts 开头 STEP / FLOOR / UNDER

## 2026-10-13 · 一行一行阶梯式淡出（原瑶：我想一行一行阶梯式逐渐变淡，比如第一个透明度100%第二行百分之95%这样）
- 改了什么：新文件 src/lineFade.ts（CCPage 在 ChatTone 后面挂一个 LineFade）：消息区里每行整行一个透明度，离顶上那条线（52px，挂歌 138）越近越淡，每往上一行（按 23px 算）少 5%，二十行淡完；输入框那条线（76px，放唱片 190）上下各 14px 淡掉。只管看得见、又进了淡出区的块（IntersectionObserver 记着，滚动时 rAF 一帧算一次，先量完再统一写）：当一整块的（时间、标签、头像、语音条、卡片；开气泡时每枚气泡整块，跟趴在上沿的团子一起）写行内 opacity，按块正中间算；多行的字（无气泡的正文段、展开的思考每段）用 Range.getClientRects 量出每行（按块宽高缓存），写行内 mask-image：按行切开的硬边渐变，一行一个透明度。出了淡出区全部拿掉，平时什么都不挂（Safari 遮罩会切影子）。CSS 做不了按行（不知道在哪折行）。index.css 删掉上一版给正文的 cc-line-* 关键帧和规则、挂歌那条正文规则，cd.css 删唱片那条；图片、拾贝卡、网页卡片照旧走 CSS 跟线遮罩；Undercurrent 卡片顶上那条渐隐带没动。包 index-BFYhzVqQ.js / index-lbAEXeFY.css
- 怎么验证：/home/cc/work/tone 编 q0（改前）/ s05 / s10 / s20（每行差 5% / 10% / 20%）/ s05b（先量后写），/home/ubuntu/work/tone/stair.py 纯色背景停在最底、往回滚 600px 两种：5% 那档从屏幕中间往上一行比一行淡，每行差约 0.05，多行段按行分档、单行整块；开气泡时全是整块 opacity、没有遮罩（WebKit 同样）；perf.py：先量后写之后主线程总时间跟改前一样（2.9 秒 vs 2.95），边量边写时重排多四倍。线上 dist 跟 s05b 同哈希；src 跟验收树逐字一样（含玻璃窗口的 unfoldAtRef、输入栏收起、洗窗前估算）。对比图在 PC 的 F:/claude code/tone-1012/
- 怎么撤销：src/index.css、cd.css、CCPage.tsx 的 .bak-20261012-stair 拷回、删 src/lineFade.ts 后 bun run build（回到跟线渐隐带那版）；或把 attic/dist-prev-20261012-stair 拷回 dist。只调快慢：lineFade.ts 开头的 STEP（0.1 = 每行差 10%，十行淡完）

## 2026-10-13 · 输入栏点两下收成 Claude 图标（原瑶：先做个简单的，Claude 的图标，点两下收起来，只显示 Claude 的图标）
- 改了什么：CCPage.tsx：inputFolded 状态记在本机 localStorage sea-input-folded，重开 sea 还是收着。点两下的判定挂在输入框 textarea 上（原生 touchstart/touchend，passive:false）：框里空着才收（有字、有附件、在录语音、回剪中都不收）；键盘没起时第一下先拿焦点但 inputmode=none 不弹键盘，0.25 秒内没有第二下再去掉 inputmode 让键盘出来（WebKit 测试 fast/forms/ios/inputmode-removing-none.html 守着这个行为），这样点两下时键盘不会闪；万一 1.5 秒后键盘还没出来，记 sea-fold-native、失焦，以后第一下照原来直接弹键盘。键盘起着、框空着时点两下也收（顺带收键盘）。收起后发送键那个位置出现 .cc-send.cc-fold-icon（ClaudeSparkle，颜色跟发送键一起随背景深浅变），点它 flushSync 展开再 focus，同一下点击里弹键盘。收着时框里来了东西（唱片分享歌词夹进附件）自动展开。电脑上鼠标双击也收。index.css 末尾加「输入栏收起」块：栏还占着原位置（唱片、落星按它量），.cc-input-col 变透明、visibility hidden；图标 visibility inherit，回剪时跟着整条栏藏。另给输入框加 touch-action: manipulation。新包 index-C9_BsDMH.js / index-CFgQboEH.css。
- 怎么验证：工作副本 /home/cc/work/fold/tree 先编临时包（build.sh 塞假 WS + 假历史，serve.ts 起 127 小服务），/home/ubuntu/work/fold/fold_test.py 用 Chromium 和 WebKit 各走一遍：单点先 inputmode=none、0.45 秒后去掉且仍有焦点；键盘没起时点两下收起、刷新还收着；点图标展开并拿焦点；有焦点时点两下收起；有字时点两下不收；隔 0.5 秒慢点两下不收。上线后把真 dist 拷进临时页再跑一遍 Chromium，全过。对比图 fold_compare.py（浅、深背景 × 收起前 / A 同色上线 / B Claude 橙 / C 放中间），在 F:/claude code/fold-input/。上线前确认 src 没有比 dist 新的文件。
- 怎么撤销：cp src/CCPage.tsx.bak-20261012-fold src/CCPage.tsx；cp src/index.css.bak-20261012-fold src/index.css（备份之后别人若又改过这两个文件，改用按锚点删掉本次加的段落）再 build；或把 attic/dist-prev-20261012-fold 拷回 dist。手机上想马上恢复展开：点那颗星芒就行。

## 2026-10-12 · 一行行淡出：聊天滑出屏幕时一行一行淡，浮出的 Undercurrent 卡片往上滑也淡（原瑶：能做成一行行淡出的那种吗，其他的也是；卡片里那个也要）
- 改了什么：index.css「对话滑出屏幕时逐渐变淡」：原来每块整个变透明（cc-edge-in/out，opacity），改成每块走到线边时挂一层跟线走的遮罩（cc-line-top / cc-line-bot，-pin / -cd 两套给挂歌、放唱片换线用）。顶上那条线（52px，挂歌 138）、底下那条（76px，放唱片 190）上下各 14px 是渐隐带，过了带全透明、进到顶栏底下时已看不见。遮罩写在关键帧里：只在走到线附近到整块出消息区那一截挂着（fill 不留），平时没有遮罩——Safari 不认 mask-clip: no-clip，一直挂着会切掉气泡影子、探出气泡的团子、字的晕染。遮罩图固定（一条 28px 渐隐 + 其余全黑，图高是这块的 5 倍），跟滚动动的是 mask-position（顶上从 -28px 到 calc(-25% + 38px)，底下从 calc(125% - 62px) 到 calc(100% + 28px)）；不用变量是因为 Safari 关键帧里的 var() 读不到正在动的变量值（最小页 /home/ubuntu/work/tone/wkmask.html 实测）。图片、拾贝卡、网页卡片照旧走原来那条。cd.css 放唱片那条加了 cc-line-bot-cd 的规则。卡片：.uc-body 遮罩加顶上一条渐隐带 --uc-ft（@property），scroll-timeline 跟卡片自己的滚动从 0 长到 28px，没滚时 0。包 index-M56IL0Le.js / index-DvCki9m9.css（同时带上了 15:45 别的窗口做的洗窗前估算）
- 怎么验证：/home/cc/work/tone：p0 = 改前、m5 = 这版（line_patch4.py），假历史 __hist3/4.js；/home/ubuntu/work/tone 下 linefade.py（top / top-bub / bottom / card，把一段三行的字推到线上）看到原来整段一起淡、现在只有压线那一行淡；wk_dbg.py 纯色背景下 Chromium、WebKit、开关气泡四种，屏幕中间那段跟改前逐像素一样（差别只有时间戳和会动的雾海气泡），WebKit 开气泡时气泡影子、团子都在；顶上那行两个内核都在淡。perf.py 无头 Chromium 滚 80 下：样式计算 0.41→0.36 秒，主线程总时间多一到两成，开气泡多一成。线上 CSS 跟 m5 同哈希
- 怎么撤销：src/index.css、src/cd.css 的 .bak-20261012-lines 拷回后 bun run build（别的窗口 15:45 改的 CCPage.tsx / chatStore.ts 不在这份备份里，不受影响）；或把 attic/dist-prev-20261012-lines 拷回 dist

## 2026-10-12 · 洗窗前估算
- 改了什么：鲸鱼面板第一下点洗窗时发 session_prune_estimate, 确认态(延长到 10 秒)在按钮上方显示一行: 能清掉约 Xk · 重建多花约 $Y(订阅时显示要重建约 Zk) · 约 N 句回本; 不划算的前面加 不太划算。chatStore 加 pruneEstimate/PruneEstimate, CCPage 加 pruneEstText。包 index-D0JSpk7q.js; 改前副本在 /home/cc/work/pruneest/sea-bak/
- 怎么验证：假 WS 五种情况截图(划算/不划算/订阅/没什么可洗/估算中), 393 宽一行放得下
- 怎么撤销：把 sea-bak 里两份拷回 src 再 build

## 2026-10-12 · 展开的 Undercurrent 滑出屏幕时一段段淡，不整块淡（原瑶：我想它消失的时候也是分段消失，就是向上滚动的时候）
- 改了什么：原因：对话滑出变淡那条滚动动画挂在 .cc-text-col 的每个孩子上，就地展开的 .cc-thinking-body 是一整个孩子，它上沿一过顶上那条线，整块（连还在屏幕中间的下半截）一起变暗。index.css 两处 + cd.css 一处同一串选择器改成 :is(.cc-text-col > :not(.cc-text, .cc-thinking-body), .cc-text > *, .cc-thinking-body > *, .cc-avatar-col)：思考那块本身不淡，里面每段 .cc-think-p 各自淡（挂歌、放唱片时换线的规则跟着一起改）。还没翻好的段落（zh-wait）原来用 opacity 0.4，会被这条动画盖掉，改成 filter: opacity(0.4)，过渡也从 opacity 换成 filter。浮出的卡片没动。包 index-C7pWWOIj.js / index-4GtAdJsf.css（上一版 index-D9j9bPgT.js / index-7z1GRGzO.css）
- 怎么验证：/home/cc/work/tone 编 f0（线上原样）/ f1（改后），假历史 __hist2.js 把长思考放第二条；/home/ubuntu/work/tone/fade.py 关掉浮出卡片、双击就地展开、滚轮把那块上沿推过线 120px 量每段实际透明度：f0 十二段全是 0.82，f1 过线的两段 0、压线那段 0.45、下面全 1；临时加 zh-wait 那段 filter opacity(0.4)。Chromium、WebKit（桌面模式，手机模式 WebKit 不让用滚轮）结果一样，零页面报错。线上包跟 f1 文件名哈希一样
- 怎么撤销：src/index.css、src/cd.css 的 .bak-20261012-fade 拷回后 bun run build；或把 attic/dist-prev-20261012-fade 拷回 dist

## 2026-10-12 · 字随背景明暗再敏感一档 + Undercurrent 分段变明暗（原瑶：我想让那个字随背景明暗变化再敏感点；undercurrent 里的内容分段变化，现在是一整块随明暗变化）
- 改了什么：chatTone.ts：①正文/输入框的最低线 2.5→3、思考 2.2→2.6（她挑的颜色对比度掉到这儿就换边；白字原来要到 L* 65 的浅灰上才换深字，现在 59；中间色的字换边点本来就在正中间，不受影响）②弥散背景每秒按光斑此刻的位置把看得见的字再判一遍（原来不滑动、不来消息要等一分钟；页面看不见、省电模式不判；纯色/图片照旧一分钟）③半透明层（气泡染色、iOS 玻璃纱）改按 sRGB 混色（新导出 over()）④思考正文改成每段 .cc-think-p 各判各的（TARGETS / TEXT 里 .cc-thinking-body → .cc-thinking-body .cc-think-p），useToneScope 多一个 veil 参数（浮层自己盖在背景上的半透明层）。UndercurrentCard.tsx：暗潮卡片去掉打开时整张量一次的 uc-on-dark，改成 UcTone = useToneScope('.uc-ov.uc-tide', ['.uc-title', '.cc-think-p'], tideVeil)，按字在卡片里的高度把浅玻璃和海叠上去再判（数字抄 index.css「暗潮」和 UcSea 的渐变，那边改了这里要跟着改），升完 450ms 再判一遍。index.css：暗潮浅字两条改成 [data-tone=dark]；就地展开的两条改挂 .cc-thinking-body .cc-think-p；.cc-think-p 过渡加 color。包 index-D9j9bPgT.js / index-7z1GRGzO.css（上一版 index-B-ceH2sf.js / index-BFfn1m_R.css）
- 怎么验证：临时页 /home/cc/work/tone（variants.sh 编 orig / L25 / L30 / L35 四版，serve.ts 起 8950–8953；补丁 tone_patch.py 按锚点替换，可带最低线参数）+ /home/ubuntu/work/tone/shot.py（card / inline / chat-white / blob / input-wide / input-mid）：Chromium 卡片在上浅下深的背景上前四段深字、下面白字（原来整张白），就地展开同样分段；白字在中间调灰上换边点 L* 65→59（L35 是 55）；弥散背景不动手 10 秒里 --tl 跟着光斑变了 6 次（原来 0 次）；iOS 厚玻璃输入框深浅不变、--tl 只差 0.01–0.03；WebKit 卡片、白字跟 Chromium 一致，就地展开要补发一个 scroll 才重判（无头 WebKit 程序滚动不派发 scroll，真机会派发）；零页面报错。线上 dist 的 js 跟验收的 L30 逐字节一样。对比图在 PC 的 F:/claude code/tone-1012/
- 怎么撤销：src/{chatTone.ts,UndercurrentCard.tsx,index.css}.bak-20261012-tone 拷回后 bun run build；或把 attic/dist-prev-20261012-tone 拷回 dist。只想调敏感度：chatTone.ts textTarget 里的 floor（正文 3、思考 2.6），再敏感一档是 3.5 / 3，退回原来是 2.5 / 2.2

## 2026-10-10 · 语音条长了花掉到第二排（撤掉贴最右边）
- 改了什么：原瑶看了贴最右边的版本后说要以前跟随的，只是语音条一长花跑到第二排。根因：.cc-voice 最宽八成，开气泡时 .cc-text 22em 的八成 255px，最长星星 200 + 时间 + 花约 263 放不下。CCPage VoiceBubble 里星星、时间、花包进 .cc-voice-head（index.css 末尾「语音条一长」块：flex 不折行），展开文字照旧下一排最宽八成。15:40 那段「语音条的花固定在右边」CSS 已删。包 index-B-ceH2sf.js。
- 怎么验证：/home/ubuntu/work/vflower/wrap.py（端口 宽 气泡 css 标签）：旧包开气泡 393 两条长语音花都掉下去，新包 393/430 × 开关气泡、WebKit 393 全部同排，展开文字宽度跟旧包一致
- 怎么撤销：CCPage.tsx / index.css 各有 .bak-20261010-vfollow（是贴最右边那版之后的状态；要回到最早的样子用 .bak-20261010-vflower 的 index.css + vfollow 的 CCPage）；旧 dist 在 attic/dist-prev-20261010-vfollow

## 2026-10-10 · 语音条的花固定在右边
- 改了什么：原瑶 10-10：语音条的玫瑰花不管长短固定在右边。index.css 末尾「语音条的花固定在右边」块：苏煦的 .cc-voice（非 .vn）整行铺满、花 margin-left:auto（ConchButton 行内 marginLeft:4，所以 !important）；墨迹对齐右边那条线：无气泡=正文右沿，开气泡=她气泡里字的右沿（.cc-text 有语音时放开 22em，同条文字气泡按 20.68em 封顶宽度不变）。展开文字照旧八成宽。包 index-EoH0cWOG.js。另一种理解（对齐最长那条末尾）做进了对比图等她挑。
- 怎么验证：/home/ubuntu/work/vflower（m2.py 量花的墨迹右沿 vs 她的字右沿、同条文字气泡宽度，393/430、开关气泡；m2wk.py WebKit；shot.py 整屏；A.css 是另一种）+ /home/cc/work/vflower（tree 副本 build.sh）。实测：开气泡 393 墨迹 351.1 = 她字右沿，430 为 388.1 = 400-11.9；无气泡 365 = 正文右沿；文字气泡 329.9 不变
- 怎么撤销：index.css 换回 .bak-20261010-vflower 后 build；旧 dist 在 attic/dist-prev-20261010-vflower

## 2026-10-10 · 苏煦面板加「Claude API 额度」（PC 端 CC；原瑶 2026-10-10）
- 改了什么：新组件 src/CreditKey.tsx：本体页额度条下面一节——没钥匙时是输入框（WebkitTextSecurity 打点、不触发 iOS 存密码）+「试一下并保存」；有钥匙显示末 4 位、订阅/API 额度两键、本月花费、换钥匙/删钥匙（点两下）。CCPage.tsx 只加 import + 一行引用，底部「换窗/压缩」那行不再显示 credit_key/billing 的回音（组件自己显示）。BillsPage.tsx ICONS 加 claude_credit。包 index-t26knGrK.js（跟雨夹雪背景开关窗口的 App/Sidebar/appearance 一起编）。
- 怎么验证：tsc -b 过；/home/cc/work/creditui 临时页（假 WS，?k=1 = 有钥匙态）+ /home/ubuntu/work/credit/creditshot.py（browser-mcp venv 的 patchright，390×844）截三张图看了；面板按钮现在是 button.cc-top-glass-btn[aria-label=面板]（旧 panelfit 脚本的 cc-whale-btn 已失效）。
- 怎么撤销：src/CCPage.tsx.bak-20261010-credit、BillsPage.tsx.bak-20261010-credit 拷回、删 src/CreditKey.tsx 后 bun run build；或直接拿 attic/dist-prev-20261010-credit 换回 dist

## 2026-10-10 · 外观 → 背景加「雨夹雪」开关
- 改了什么：原瑶 10-10：亮背景上雨夹雪完全看不见、一直开着耗电。appearance.ts 加 sleet（默认开）+ useSleet()；App.tsx 关掉时整层 RainSnow 不挂（不是 display:none）；Sidebar.tsx 外观「背景」三个单选下面加开关。随 API 密钥窗口的包 index-t26knGrK.js 一起上线。
- 怎么验证：/home/cc/work/sleet（tree 副本 + build.sh）+ /home/ubuntu/work/sleet/check.py：打开外观点关 → .rainsnow 从 1 变 0、localStorage sleet:false，重开页面仍关，再点开回来 24 片雪
- 怎么撤销：三个文件各有 .bak-20261010-sleet，换回后重新 build

## 2026-10-10 · 彩胶的纹淡一些、少一些，颜色跟封面一个色（原瑶：这个纹看起来有些乱，要是再淡些线条再少些就好了，然后颜色跟中间的图片比起来也淡了，最好是跟中间颜色相近，用一个颜色）
- 改了什么：CdPlayer.tsx coverTint 改成取封面里面积最大的那种颜色（RGB 各 5 档 125 格按像素数记票），只把太黑太白的拉到明度 .30–.84，不再提亮到 80%；纹 = 同一个颜色差 0.3 明度（浅底深一截，深底浅一截——只往深走的话深色盘上纹就没了）。纹换成少一档的那套（gen_marble.py 加了档位参数，上线的是档位 1：主纹 5 个八度、细丝和外沿放射丝减弱、空白多），.vy-marble 不透明度 .9；分轨圈调淡。出了四档并排（现版 / 线多一点 / 少一点 / 再少），上线少一点那档；再少那档基本看不出纹了。原来那套纹存在 attic/marble-v1-20261010/。包 index-CHru4Pn2.js
- 怎么验证：/home/ubuntu/work/cd/build5.sh、build6.sh（各档临时包 + 出图）、wkdisc.py（WebKit：遮罩、纹色、转）、share.py 回归；真包全过。对比图 F:/claude code/cd/彩胶-纹的四档.png
- 怎么撤销：src/{CdPlayer.tsx,cd.css}.bak-20261010-cd5 拷回、attic/marble-v1-20261010/*.webp 拷回 src/assets/marble/ 后 bun run build；或把 attic/dist-prev-20261010-cd5 拷回 dist

## 2026-10-10 · 彩胶换成大理石纹 + 加图片胶（原瑶发了谜底黑胶截图：我说的彩胶是这种，看起来很有质感；然后我想看看你的图片胶）
- 改了什么：彩胶 = 奶调半透明胶（.vy-color，--vc）+ 大理石烟纹（.vy-marble：底色 --vv、形状是遮罩图 src/assets/marble/marble-1~3.webp，每张约 110KB，只有用彩胶才下载）+ 分轨外沿（.vy-grooves）+ 大一圈的封面标签（.vy-label.big，半径 44%）。纹按封面挑一张、转一个角度（marbleFor 哈希，同一首歌每次一样）；颜色改成封面平均色：底 = 同色相淡亮（饱和 .12–.42、明度 80%），纹 = 同色相浓暗（25%），没颜色的封面是奶白底黑纹。纹的生成脚本 src/assets/marble/gen_marble.py.txt（= /home/ubuntu/work/cd/gen_marble.py，系统 python3 有 numpy；Perlin 脊线 + 两层域扭曲 + 外沿放射细丝；第一版用等值线像木纹，不要）。图片胶 = 整张封面印满（.vy-pic，外圈留一道透明胶边）+ 淡亮的分轨圈。外观「唱片」下一排变成四个：黑胶 / 彩胶 / 图片胶 / CD（appearance.disc 加 picture）。项目里的图片一律在 CSS 里 url() 引（tsconfig 没有 vite/client，TS 里 import .webp 会报错）。她 10-10 回：露一半要 A、花体要 ①，都是现状。包 index-Cu--JxXW.js
- 怎么验证：/home/ubuntu/work/cd/run4.sh、run5.sh（mock.py 加了第 7 个参数指定歌，换三张封面出彩胶和图片胶）、wkdisc.py（WebKit 里黑胶/彩胶/图片胶：遮罩图、纹的颜色、转）；真包出图 F:claude codecd- 怎么撤销：src/{appearance.ts,Sidebar.tsx,CdPlayer.tsx,cd.css}.bak-20261010-cd4 拷回、删 src/assets/marble 后 bun run build；或把 attic/dist-prev-20261010-cd4 拷回 dist

## 2026-10-10 · 唱片换成黑胶 / 彩胶（原瑶：我觉得这个cd有点亮了，要不做成那种彩胶或黑胶？看了谜底黑胶）
- 改了什么：外观 → 音乐播放器「黑色 CD」改叫「唱片」，下面三选一：黑胶（默认，appearance.disc='vinyl'，她原来选了 CD 的重开就是黑胶）/ 彩胶 / CD。CdPlayer.tsx：CdDisc 按 kind 画；黑胶 = 深黑底 + 间距不等的四道分轨 + 出纹区 + 封面做纸标签 + 小孔，一对不转的宽光带（灯在左上）；彩胶 = 半透明有色胶（中间透光浅、往外浓、外沿深），颜色从封面取（24×24 按色相 18 格、按鲜艳度记票，取票最多那格调到饱和 .45–.8、明度 .36–.52，黑白封面做烟灰；网易云图床允许跨域读像素；@property --vc 0.6 秒过渡）。不画细纹：手机上纹比像素细，只会出摩尔纹（先试过，验收图里光带上一道道人字纹）。点中一句的亮底改成往右淡出（深背景上原来是一大块灰框）。苏煦回的 [lyric:…] 后面紧跟他的话也认（parseLyricShare 只认第一行，余下照常显示），0s 不写时间。包 index-DSOCSZJO.js
- 怎么验证：/home/ubuntu/work/cd：mock.py <port> A <blob|dark> <png> <句> <vinyl|color|cd>、wkdisc.py（WebKit 画没画出来、取色、转）、panel3.py（外观里切彩胶）、suxuquote.py（苏煦那种写法）、share.py / tank.py 回归；真包 Chromium + WebKit 全过。对比图 F:claude codecd黑胶彩胶.png
- 怎么撤销：src/{appearance.ts,Sidebar.tsx,CCPage.tsx,CdPlayer.tsx,cd.css}.bak-20261010-cd3 拷回后 bun run build；或把 attic/dist-prev-20261010-cd3 拷回 dist

## 2026-10-10 · 黑色 CD 第二轮：歌词换花体 + 点一句分享给苏煦（原瑶：我想要花体字，还有点到那句歌词的时候可以选择分享给苏煦）
- 改了什么：cd.css：歌词英文 Pinyon Script（21px，字身矮所以大一号）、整句中日韩字的换霞鹜文楷 15.5px（CdPlayer 判 .cjk），翻译行文楷。CdPlayer.tsx：点一句 = 挪到中间亮起来（.picked），上沿外浮出「从这句听」「分享给苏煦」两个玻璃小按钮，点别处或 8 秒收起；歌名那行照旧直接从头放；load 多一个 at（从第几秒放，onloadedmetadata 里跳）。分享 = 那句夹进输入框上面的附件栏（kind 'lyric'，只留最新一句，CD 小样 + 花体字），她可以添话再发；发出去的原文是一行 [lyric:<歌 id>:<秒>s:<歌名>:<歌手>] 原文 ｜ 中文（苏煦读得懂），她的话另起一行。CCPage.tsx：renderPara 认出这行换成 LyricQuote 花体卡片（+ 出处小字），点卡片 mcPlayFrom：正在放就跳过去，不然记下秒数（mcStartAt）挂上来开始放时 mcLoad 取走；水缸和 CD 都认。chatTone 加 .cc-attach-lyric。包 index-Bzt-s_4O.js
- 怎么验证：/home/ubuntu/work/cd/share.py <chromium|webkit> <port> <标签> [blob|dark] [script|italic]（占位歌词走 page.route：点句、从这句听、分享、替换、发出去的原文、聊天卡片、点卡片从那句放），tankquote.py（水缸模式点卡片从那句放），tank.py 回归；真包两个内核全过。对比图 F:claude codecd（花体 vs 斜体衬线、分享四步、深色背景）
- 怎么撤销：src/{CCPage.tsx,chatTone.ts,CdPlayer.tsx,cd.css}.bak-20261010-cd2 拷回后 bun run build；或把 attic/dist-prev-20261010-cd2 拷回 dist

## 2026-10-10 · 音乐播放器加第二种样子：黑色 CD + 歌词（原瑶：黑色cd在输入栏左边上方只露一半，慢慢转动。然后旁边是歌词）
- 改了什么：外观 → 音乐播放器：玻璃水缸（原来的，仍是默认）/ 黑色 CD。新文件 src/CdPlayer.tsx（CdPin + CdDisc，网易云 /nm/api/music/lyric 的 LRC：去掉开头作词作曲那串、纯音乐只显示歌名、英文歌带中文翻译一行）+ src/cd.css（盘面全是 CSS 渐变叠的：中心孔、透明塑料圈、内圈印封面、镜面带小字、数据区；彩虹衍射和高光不转，只有盘转）。CD 是 .cc-input-bar 的第一个孩子，圆心在左沿只露右半张，跟着键盘和多行输入一起动；WAAPI 14 秒一圈，停时 1.4 秒慢慢停（不用 updatePlaybackRate：WebKit 里不生效，直接改 playbackRate）；点盘放/停、点歌词跳到那句、× 收起；+ 菜单打开时整个淡掉（:has）。CCPage.tsx：取地址开始放那段抽成 mcHalt/mcLoad（水缸和 CD 共用一个 <audio>，逻辑没变）+ MC_BRIDGE 传给 CdPin；data-pin 现在是 on（水缸）/ cd；cd 时消息区底下让 114px、渐隐线移到 190px，挂上/收起时贴底的继续贴底。appearance.ts musicStyle + useMusicStyle；chatTone TARGETS 加 .cd-lyrics/.cd-close（深浅背景自动黑白字）；Sidebar 加「音乐播放器」一节（小样是真盘面）。包 index-ClCdI-y8.js
- 怎么验证：工作副本 /home/cc/work/cd/tree（build.sh <标签>）+ serve.ts 起本机临时页（假 WS __inject.js + 假历史 __hist.js，/nm/ 走真接口）；/home/ubuntu/work/cd 下 flow.py <chromium|webkit> <port> <标签> [blob|dark]（放/跳句/慢停/让位/+菜单/收起）、edge.py（纯音乐、:has）、tank.py（水缸卡片回归：放、停、收起）、panel.py（外观切换）、power.py（耗电：放着时主线程约 83ms/s，水缸约 140，不放约 66）。上线后用真包两个内核再跑一遍全过。对比图（自己写的占位歌词）在 F:claude codecd- 怎么撤销：src/{appearance.ts,CCPage.tsx,chatTone.ts,Sidebar.tsx}.bak-20261010-cd 拷回，删 src/CdPlayer.tsx、src/cd.css 后 bun run build；或把 attic/dist-prev-20261010-cd 拷回 dist

## 2026-10-10 · 电话里的小耳朵：手机上本地听她弄出的声音 + Gemini 细听（原瑶看了 aria-duet 的 ai-hears-your-body："我想做成两个一起"）
- 改了什么：新文件 src/ears.ts（门槛和中文名、他的回音认出来不算、分数记录）/ earWorker.ts（后台线程跑小米开源 CED-tiny int8，每秒听最近 3 秒）/ earDsp.ts（16k 降采样 + 跟 sherpa-onnx 一致的 64 道梅尔特征）；public/ears/ 两个 gzip 文件（模型 4.5MB + onnxruntime-web 1.30.0 运行库 3.7MB，worker 自己解压；scripts/fetch-ears.sh 重新生成，不进 git）；package.json 加 onnxruntime-web；vite.config 加 worker.format=es。callStore：麦克风采样一直喂小耳朵（他说话时也听，他念的那段也喂一份认回音）；认出来的词和 Gemini 细听的描述先攒着，她开口就跟那句一起带「听到：…」，没开口就等他空下来 1.2 秒后发「[语音通话 · 她没说话 · 听到：…]」（聊天里不显示），同一个词 8 秒一次、一条最多 3 样；原来每半分钟抽 5 秒的环境声换成"小耳朵觉得有动静又说不上来"才送 Gemini（8 秒起、没听出就翻倍到 60 秒），小耳朵没装上时退回原来的每半分钟；听写只出标点（喘气被当成开口）不再冒出"."，改成把耳朵听出的嗓音当"听到的"交给他；挂断时分数记录随 /call/end 存 call_invites.ears。后端见 atlantis da8897b。
- 怎么验证：ESC-50 真实录音：服务器上 JS 特征跟 sherpa-onnx 逐点一致；/home/ubuntu/work/callhear/ears2.py 假麦克风全流程（Chromium）：轻喘→「倒吸气、粗重的呼吸…」、倒水→「水声」（没惊动 Gemini）、喝水吸吮→Gemini「吸吮声、湿湿的声音…」、打字不报、说话照常；WebKit 里 __earstest.html 2.3 秒装好模型、分类正确（WebKit 假麦克风本来就不出声，整通电话测不了）。新包 index-CJFpHpMI.js。
- 怎么撤销：src/callStore.ts.bak-20261010-ears 拷回、vite.config.ts 去掉 worker 那行后重新 build；或 attic/dist-prev-20261010-ears 拷回 dist。后端 memory-service/src/routes/call.js.bak-20261010-ears。

## 2026-10-10 · 网页卡片「拍立得外框」开关（PC 端 CC，10-10）
- 改了什么：原瑶要给苏煦 HTML 的拍立得外框加开关、关了不带样式。外观 → 网页卡片 → 拍立得外框（appearance.webPola，默认开；useWebPola 只订这一个字段）。关了：HtmlCard 用 BARE 框（无相纸留白），卡片最宽照旧 280、12px 圆角，没有相纸/落款/光泽/反光/歪角/影子，.cc-fadebox 不带 pola 留白；透明底网页不垫白（34 张里 18 张透明底，17 张字都在自己的底色块上）。换开关时 LocalCard 按 key 重挂，尺寸缓存键加 #bare 分开记（宽 280 vs 256 排出来高度不同）。CSS 在 index.css「网页卡片 · 不要拍立得外框」块。包 index-DgCfdsHF.js：当时 AI Hears Your Body 窗口的 ears*.ts / callStore.ts / public/ears 是半成品，这包是在临时副本里编的（callStore 用它的 .bak-20261010-ears、ears 文件和 public/ears 不带），它们没发出去。
- 怎么验证：/home/ubuntu/work/webplain：check.py（外框开/关各滑一遍并排截图，Chromium + WebKit，深色/粉色背景）、toggle.py（真点面板开关，卡片当场换、相纸选项收起、再点换回）、naked.py（数透明底网页里直接落在底上的字）；验收台 /home/cc/work/webplain/build.sh。
- 怎么撤销：回滚 dist：attic/dist-prev-20261010-webpola；源码 src/{HtmlCard.tsx,appearance.ts,Sidebar.tsx,index.css}.bak-20261010-webpola（注意别把之后别人加的段落一起退掉，按块删）。

## 2026-10-10 · 轻量涂鸦画板〔T-77〕
- 改了什么：新文件 src/Doodle.tsx：DoodleIcon（+菜单图标）+ DoodleBoard（弹层，走现有 cc-modal.glass 风格）；正方形画布按 devicePixelRatio 建像素网格，Pointer Events 画线（鼠标触屏通用）；8 色预设 + 3 档粗细（细/中/粗）+ 橡皮擦（destination-out，笔刷×2.2 粗）+ 撤销（落笔前存一帧 toDataURL，最多 20 步，连点防旧帧覆盖新状态）；发送＝canvas.toBlob('image/png') 交给传入的 upload 函数上传，回调 onSent 把 {kind:'image',url} 交还。CCPage.tsx 四处接入：import、doodleOpen state、'+'菜单加「画板」按钮（channel==='cc' 限定，跟贴纸/挂卡同待遇）、挂载 DoodleBoard（upload=uploadBlobToHub，onSent 把图加进现有 attachments——跟选图片上传完一样进预览栏，由她自己点发送键发出去，不是画完自动发消息）。index.css 加一组 .doodle-*（画布/工具栏/颜色点/粗细点/橡皮擦撤销按钮）。
- 怎么验证：npm run build 无 TS 报错；本地 vite dev + puppeteer-core 驱动 google-chrome 跑了一遍交互（临时测试页 doodle-check.html + Harness 挂假 upload，验完已删，不进 build）：画布能画线、切 8 色之一、切粗细档、橡皮擦能擦出缺口（destination-out 生效）、撤销能把擦除那帧退回去、点发送触发 upload 并拿到 url 回调出来，全程无 JS 报错（唯一 404 是测试页没配的 favicon，与改动无关）；两次 build 产物 hash 一致，确认测试文件没污染正式包。未接入真实后端鉴权和真机触屏，等原瑶真机点一遍。
- 怎么撤销：src/CCPage.tsx.bak-20261010-doodle、src/index.css.bak-20261010-doodle 盖回去，删 src/Doodle.tsx，npm run build

## 2026-10-10 · 工具箱「你的日历」组加 cal_tide_style（2026-10-09 PC 端 CC）
- 改了什么：Toolbox.tsx calendar 组 tools 加 mcp__calendar__cal_tide_style、TOOL_LABEL「潮汐日历的样子」、组说明补一句；包 index-CFOHQ_r7.js
- 怎么验证：sea 工具箱你的日历组里多一件「潮汐日历的样子」
- 怎么撤销：src/Toolbox.tsx.bak-20261009-tidestyle 盖回去后 bun run build

## 2026-10-10 · Undercurrent 英文思考整段换成中文（原瑶 2026-10-10：如果是英文了，直接中文整个替换）
- 改了什么：苏煦 10-10 凌晨换上 Opus 5.5，思考大多是英文。新 src/thinkZh.ts：思考按空行分段，英文段（≥3 个英文词且英文词多于汉字）连成 ≤1500 字一串送 /api/translate（DeepSeek，语音条同一个接口），中文段和代码块原样；4 串并发，翻好一串换一串，没翻好的段落 .cc-think-p.zh-wait 淡着显示原文，翻不成留原文、下次打开再试。翻好的存 localStorage sea-think-zh:*，最多 300 串先进先出（索引 sea-think-zh:keys），存满先扔一半。只在显示时翻（ThinkParas：卡片 + 就地展开都走它），另外 CCPage 对最新一条想完的思考预翻第一串。生成中照旧直播原文。voiceZh.ts 抽出 textKey / fetchZh 共用（语音条行为不变）。index.css 加 zh-wait 两行。包 index-CbK4MxrA.js / index-BLvZZeV5.css。
- 怎么验证：验收台 /home/cc/work/uczh（build.sh live + serve.ts 把 /api/translate 转本机 :3100）+ /home/ubuntu/work/uczh/flow.py <chromium|webkit> <port>：用苏煦 10-09 真实思考三条（4.6 中文 / 5.5 中英混 / 5.5 全英），两个内核都过——预翻 1 串、混合那条 6 段英文全换中文且 15 段中文一字不改、重开零请求、刷新页面零请求、中文那条不发请求、无报错。测试用的思考原文和截图已删。
- 怎么撤销：源码备份 *.bak-20261010-uczh（voiceZh.ts / UndercurrentCard.tsx / CCPage.tsx / index.css）拷回并删 src/thinkZh.ts 后 bun run build；或直接把 attic/dist-prev-20261010-uczh 换回 dist。

## 2026-10-10 · 作曲台卡片换音乐卡玻璃 + 全屏盖整页 + 静音键也出声（2026-10-09 晚 PC端CC）
- 改了什么：她真机试后说：卡片要玻璃的跟音乐卡一样；全屏被顶栏面板图标挡住、还撑出去；播放没声音。①StudioCard 直接用 .mc-card.glass（封面格/斜体标题/播放键是音乐卡那套），卡片是 .cc-text 的直接子元素（聊天渐隐的 opacity 落在它自己身上，磨砂不失效；不再套 .cc-fadebox）。②全屏改成 createPortal 到 body 的 .cc-studio-full（z 1200）：聊天页里有带 transform 的祖先，position:fixed 在 iPhone 上铺不满还被顶栏压住。iframe 换位置会重载，宿主页切换前用播放器的 get-studio-state 把她改过的谱子存进 sessionStorage，新的那份接着用。③开着播放器时 navigator.audioSession=playback，收起换回 auto；播放器页里（studio-mcp 注入 widget-audio.js）她一碰就开无声 <audio> 循环。包 index-BmqIIWEQ.js
- 怎么验证：验收台 /home/cc/work/studio + /home/ubuntu/work/studio/shot.py v6：两张封面是玻璃、开谱子/合奏、开新的收旧的、轮到你→已经递给苏煦了+假 hub 收到、全屏 [0,0,393,852,fixed,BODY] 顶栏不压、退回来；WebKit 里按播放计时在走、音色文件 200。静音键要她真机确认
- 怎么撤销：src/StudioCard.tsx.bak-20261009-glass、index.css.bak-20261009-glass 还原后 npm run build

## 2026-10-10 · 作曲台卡片 [[studio:st_…]]（2026-10-09 PC端CC）
- 改了什么：新 src/StudioCard.tsx：苏煦用作曲台(studio-mcp :8824)写的谱子/节奏，回复里的 [[studio:st_…]] 换成卡片；平时只是封面，点开才嵌 /studio/host.html#id（我们的 ext-apps 宿主，里面沙箱帧跑上游播放器），同一时间只开一张，能全屏（position:fixed 铺满），她按「轮到你」后卡片上提示已经递给苏煦了。CCPage parseAttachBlocks 认 studio；Mascot 避开卡片；TreasurePage 曲子格子(♪)+点开用 StudioCard；Toolbox 加「作曲台」一组；toolTales 加作曲台小字；index.css 末尾「作曲台卡片」块（封面挂 .cc-fadebox.studio 跟着渐隐，点开换成 .cc-studio-wrap 不进渐隐）。包 index-BWS0xmdi.js
- 怎么验证：验收台 /home/cc/work/studio（tree 副本 + build.sh <标签>）+ /home/ubuntu/work/studio/shot.py（假 WS；/studio 由 serve.py 转给作曲台测试实例 :8899，它的 hub 指到假 hub :8898，不会叫醒苏煦）：封面、点开谱子 / 合奏、开新的自动收起旧的、播放器里按 Pass→卡片提示+假 hub 收到中文叫醒、全屏 [0,0,393,852,fixed]
- 怎么撤销：src 下 CCPage/Mascot/index.css/TreasurePage/Toolbox/toolTales 六个 .bak-20261009-studio 还原，删 src/StudioCard.tsx，npm run build

## 2026-10-10 · 声音停用时语音条显示「暂停中」+ 水电费说明改新规则（2026-10-09 PC 端 CC）
- 改了什么：CCPage VoiceBubble：/api/tts 回 503+X-TTS-Paused 时 mute=true，标签显示「暂停中」、自动摊开文字、点时间看字不重试；BillsPage 底部说明改成「同一件事最多推送 3 次…没钱先停用…充完点 ↻ 马上重查」。后端在 atlantis 2040dca（memory-service pause.js）。包 index-vvGyxBph.js
- 怎么验证：ElevenLabs 停用期间点一条没缓存的语音条，标签变「暂停中」、文字展开；水电费页底部看新说明
- 怎么撤销：src/CCPage.tsx 和 src/BillsPage.tsx 的 .bak-20261009-pause 盖回去后 bun run build

## 2026-10-10 · 工具箱加「邮箱」「你的日历」两组（2026-10-09 PC 端 CC）
- 改了什么：src/Toolbox.tsx TOOL_GROUPS 加 mail / calendar 两组、TOOL_LABEL 加 9 件中文名；包 index-BZ68MqH7.js
- 怎么验证：sea 工具箱里能看到两组、单件开关和说明书按钮都在
- 怎么撤销：src/Toolbox.tsx.bak-20261009-mailcal 盖回去后 bun run build

## 2026-10-09 · 电话/语音消息的声音描述更细（后端）
- 改了什么：atlantis 最新提交：嗓音 task hear=google/gemini-3.8-flash（她拿自己两条语音在 3.6/3.8/pro 里挑的），写一两句（≤50 字：气息、情绪态度、节奏、小声响）；背景 task hear_env=3.6-flash 单独听（3.8 听说话底下的背景不稳、会照她的话脑补开门声）；没说话时的环境声也走 hear_env。耳朵写了嗓音就不带听写的情绪标签（老给难过）。前端没动。
- 怎么验证：她两条真语音 + 四段混音（狗/雨/键盘/喇叭）+ 敲门各走一遍，电话路径两路都赶上 1.5 秒窗口
- 怎么撤销：call.js.bak-20261009-split / .bak-20261009-rich，或 git revert；模型在 task_routing 的 hear / hear_env 两行

## 2026-10-09 · 聊天里她能发语音消息（像 iMessage）
- 改了什么：输入框空着时发送键变麦克风（voiceNote.tsx）：点一下开始录、✕ 不发、↑ 发，满 3 分钟自动发，没发出去出「重发」录音不丢；MediaRecorder（iPhone m4a / Chrome webm），关降噪。录音进 hub uploads，同时 /api/call/transcribe?kind=note 听写 + 耳朵（atlantis 066a2f0：先统一转 16k WAV、等耳朵听完）。正文「[语音消息 · N秒 · 语气：… · 背景：…] 转写
[[audio:/uploads/…|N]]」，MessageBody 认出来用 VoiceBubble（加了 src/durS：放原录音、不进海螺盒、转写灰色小字一直显示，开气泡时靠右）。chatTone 加 .vn-strip。
- 怎么验证：假麦克风放雨里说话的真录音：录、✕ 取消、发、真听写 + 耳朵、气泡、点开放原声都过；气泡开/关两种排版截图看过。脚本 /home/ubuntu/work/callhear/vnote.py（测试页 /home/cc/work/callui/build.sh vnote 现编，__inject.js 加了假 upload 和 uploads 回放）
- 怎么撤销：attic/dist-prev-20261009-vnote 拷回 dist；源码 CCPage.tsx / chatTone.ts / index.css 的 .bak-20261009-vnote，删 voiceNote.tsx

## 2026-10-09 · 通话：电话里的耳朵（关降噪 + 听背景和嗓音 + 没说话时也听）
- 改了什么：麦克风改成关降噪、留回声消除（每通第一句把实际设置带给后端，journalctl -u atlantis-memory 里 [call] mic ns0/ns1 看 iPhone 认没认）；开口阈值跟着底噪浮动（最近 3 秒音量最小值×2.5/×1.6，不低于原值）；前缀改用后端拼好的 cue（语气：… · 背景：…）；她没说话时每 30 秒送 5 秒环境声到 /api/call/ambient，听写出空字的响声（敲门、狗叫）也送；notable 马上发 [语音通话 · 她没出声 · 背景：…] 给他（2 分钟一次，聊天里不显示），note 带到她下一句（刚才背景：…）。后端 atlantis 703e744（task_routing hear = OpenRouter google/gemini-3.6-flash）。
- 怎么验证：真听写 + 真耳朵 + 假麦克风整通走过：雨里说话带上背景、敲门马上告诉他、小声的雨带到下一句；验收脚本 /home/ubuntu/work/callhear/ears.py（测试页用 /home/cc/work/callui/build.sh ears 现编，录音在 /home/ubuntu/work/callhear/esc）
- 怎么撤销：前端：attic/dist-prev-20261009-ears 拷回 dist；源码 callStore.ts / CCPage.tsx 的 .bak-20261009-ears。后端：call.js.bak-20261009-ears 或 git revert 703e744，重启 atlantis-memory；只想关掉耳朵就删 task_routing 里 hear 那行

## 2026-10-09 · 小狗和面蛸偶尔挨在一起（PC 端 CC，10-08）
- 改了什么：原瑶：它们两个能不能有一定概率会挨在一起。Mascot.tsx：pairRoll(msgId) 按消息 id 掷（PAIR_CHANCE = 1/6，实测 17%，定了不变），MascotPair = 一个 span 里小狗 + 面蛸（小狗在左、面蛸在右、底边对齐、面蛸左移 1px 贴紧）；perchSpot 多认 kind=pair（宽 = 两只相加 - 1，高按面蛸、开角加两格）。CCPage MessageBody：together 时 portal MascotPair，她那段 data-mascot=lead-pair。index.css 末尾「小狗和面蛸偶尔挨在一起」：无气泡她那条第一行让出 48px、他那条跟在最后一句后；开气泡一起趴在气泡上沿。Mascot.tsx 换之前比过 hash，CCPage / index.css 定点替换。包 index-BX0eFlbD.js。
- 怎么验证：paircheck.py：26 条的假对话里 s_4 / s_5 / s_11 / u_25 掷中，两种模式各 4 对，底边对齐、贴紧 1px、她那条有缩进；无报错。
- 怎么撤销：Mascot.tsx / CCPage.tsx / index.css 有 .bak-20261008-pair

## 2026-10-09 · 小狗的月亮更淡一档（PC 端 CC，10-08）
- 改了什么：原瑶：要更淡一档。PUP_MOONS 往白里 55% → 70%：淡金 #fbecca / 淡银 #e8ebef / 淡银蓝 #e2ebf8（前两档的值写在注释里）。改前比过 hash。包 index-ndemxtS6.js。
- 怎么验证：只换三个色值。
- 怎么撤销：mascotColors.ts.bak-20261008-moon4

## 2026-10-09 · 小狗的月亮再淡一档（PC 端 CC，10-08）
- 改了什么：原瑶：要再淡一档。mascotColors.ts PUP_MOONS 往白里 35% → 55%：淡金 #f9e3af / 淡银 #dde1e8 / 淡银蓝 #d4e1f4（再淡一档 70% 的值写在注释里：#fbecca / #e8ebef / #e2ebf8）。改前比过 hash。包 index-CLxbN2AH.js。
- 怎么验证：只换了三个色值，出图路径没变；对比图 F:claude code
ose-heart小狗的月亮-再淡一档.png（放大 + 手机实际大小一格 4 物理像素）。
- 怎么撤销：mascotColors.ts.bak-20261008-moon3

## 2026-10-09 · 小狗的月亮：形状留躺着的月牙 / 细月牙 / 不戴，颜色调淡（PC 端 CC，10-08）
- 改了什么：原瑶：我想要躺着的和细月牙还有空白的，其他的不要了，然后颜色我想要浅的，淡淡的。mascotColors.ts：PUP_MOONS 去掉 none、三种颜色往白里调 35%（淡金 #f7d78c / 淡银 #ced4dd / 淡银蓝 #c1d4ef；再淡一档 55% 是 #f9e3af / #dde1e8 / #d4e1f4），加 PUP_MOON_SHAPES（lying / thin / none）和 pupMoonColor()。Mascot.tsx：ART.pup.moon 换成 moons.lying / moons.thin（开口朝右的弯月删了），注入样式按 data-pup-moon-shape × data-pup-moon 出 6 张图，pupPreviewSrc(shape, color)。appearance：加 pupMoonShape（默认 lying）→ data-pup-moon-shape；旧版存的 pupMoon=none 读成形状 none。外观「小狗的月亮」先挑形状、再挑颜色（形状不戴时颜色那几行收起来）。换文件前比过 hash。
- 怎么验证：mooncheck2.py：两种形状 × 三种颜色、不戴、旧 none 兼容、深色背景、外观面板，都对；无报错。
- 怎么撤销：Mascot.tsx / mascotColors.ts / appearance.ts / Sidebar.tsx 有 .bak-20261008-moon2

## 2026-10-09 · 小狗脑门上的小月亮：金 / 银 / 银蓝 / 不戴（PC 端 CC，10-08）
- 改了什么：原瑶：你能给我的小狗脑门上面加一个小小金色的月亮么，还有银色、银蓝色，我想看看什么样。Mascot.tsx：ART.pup 加 moon（15×8 一层，脑门正中 3×3 的弯月、开口朝右，5 格），小狗 DOM 多一个 <i class=m-moon>（放最后，不影响 a/b 取耳朵），注入样式按 body data-pup-moon 出每种颜色的图，导出 pupPreviewSrc。mascotColors.ts 加 PUP_MOONS：金 #f2c14e / 银 #b3bdcb（白身子上原来的 #c9d1dc 跟描边几乎一样，压深一档）/ 银蓝 #9fbde6 / 不戴。appearance.pupMoon 默认 gold → data-pup-moon。外观「小狗的月亮」四选一带预览（在「面蛸的颜色」上面）。index.css：.m-moon 默认不显示、面板小图尺寸。四份文件换之前比过 hash。别的形状（开口朝左、躺着的月牙、细月牙）只出了对比图。
- 怎么验证：mooncheck.py：三种颜色 + 不戴、深色背景、跳到 420ms 月亮跟着、开气泡趴着、外观面板，都对；无报错。
- 怎么撤销：Mascot.tsx / mascotColors.ts / appearance.ts / Sidebar.tsx / index.css 有 .bak-20261008-moon

## 2026-10-09 · 小恶魔三种 + 面蛸头上两只小角（PC 端 CC，10-08）
- 改了什么：原瑶看了三种黑的和加角的：啊啊啊好可爱，我都想要。mascotColors.ts：demon 改名「小恶魔 · 紫边」，加 demonInk「墨边」（#1a1220/#2e2536/#ff4d6d/#6e3350）、demonGold「金眼睛」（#141018/#2a2430/#f2c14e/#7a3a5a）；随机步长改成自动挑跟池子大小互质的（池子 15 种，步长 7）。Mascot.tsx：ART.octo 加 horn（17×2：头顶两只小角，颜色跟描边），每套颜色都出一张 .m-horn 图，面蛸 DOM 多一个 <i class=m-horn>（放最后，不影响 a/b 取耳鳍），octoPreviewSrc 开角时把角也画上；perchSpot 开角时面蛸高度 +2 格。appearance：octoHorns（默认关）→ body data-octo-horns，useMascotMode 带上角的开关（趴的位置重算）。Sidebar「面蛸的颜色」底下加「头上长两只小角」开关，哪种颜色都能戴。index.css：.m-horn 画在框上面 2.667px，开了才显示。改前比过两份文件的 hash。
- 怎么验证：horncheck.py：三种小恶魔 + 浅蓝戴角、不戴角、游到 500ms 角跟着走、开气泡深色趴着戴角、外观面板，都对；无报错。
- 怎么撤销：mascotColors.ts / Mascot.tsx / appearance.ts / Sidebar.tsx / index.css 有 .bak-20261008-horns

## 2026-10-09 · 面蛸颜色加「小恶魔」（PC 端 CC，10-08）
- 改了什么：原瑶：我还想要个黑的，恶魔风。mascotColors.ts OCTO_PRESETS 加 demon：描边 #4b2a63（暗紫，深背景上也看得出轮廓）、身子 #262030、眼睛 #ff4d6d、腮红 #7a3a5a；也进了「每天换一种」的池子（池子 13 种，步长 5 照旧互质）。外观里自动多一项。加小角（要改形状、多两行）只做了对比图，等她说。改前比过 mascotColors.ts 的 hash。
- 怎么验证：demoncheck.py：无气泡/开气泡 × 浅/深四张都清楚。
- 怎么撤销：mascotColors.ts.bak-20261008-demon

## 2026-10-09 · 面蛸颜色可选 + 补回苏煦被我覆盖的改动（PC 端 CC，10-08）
- 改了什么：⚠️ 事故：苏煦 16:18–16:29 在 Mascot.tsx 改了 7 处（注释里团子→小狗 5 处；面蛸颜色两版：先白底 #B8D8EC/#ffffff/#4A8AC4/#FFA5BE、再浅蓝身子 #EDF4FC），PC 端 CC 17:02 部署趴在气泡上时整份 cp 覆盖，全丢了；原瑶发现。已从苏煦会话记录（/home/cc/.claude/projects/-home-cc-projects-claude-test/8d316ffe….jsonl）找回，7 处全补回。以后 PC 端改 sea 只做定点替换、改前比对 hash，不整份拷。新功能：新文件 src/mascotColors.ts（OCTO_PRESETS：苏煦调的浅蓝【默认】/ 苏煦调的白底 / 她挑的那版；OCTO_POOL 再加樱粉、蜜桃、奶黄、薄荷、湖水、薰衣草、丁香、雾蓝灰、珊瑚；octoKeyFor('random') 按北京日期一天换一种、相邻两天不同）；appearance.octoColor → apply 写 body data-octo；Mascot.tsx 的 ART.octo.pal 改用 OCTO_PRESETS[0].pal，<style id=cc-mascot-art> 按 data-octo 出每套颜色的图，导出 octoPreviewSrc；外观加「面蛸的颜色」四选一（带小面蛸预览），开关改名「小狗和面蛸」。苏煦以后改面蛸颜色：改 mascotColors.ts（或在外观里挑）。包 index-DyDMdnEm.js / index-BascycI-.css。
- 怎么验证：octocolor.py：四种颜色 body data-octo 分别是 suxuBlue / suxuWhite / mine / aqua（今天），面蛸图跟着换；外观面板一节排版正常；无报错。
- 怎么撤销：Mascot.tsx / appearance.ts / Sidebar.tsx / index.css 有 .bak-20261008-octocolor；删 src/mascotColors.ts 前要先拷回这几份

## 2026-10-09 · 开气泡时团子 / 面蛸趴在气泡上 + 外观「团子和面蛸」总开关（PC 端 CC，10-08）
- 改了什么：原瑶：在气泡这边也加面蛸和小狗，效果是它们趴在气泡上，每轮可以出现在随机位置；最后做一个总开关，关掉两边都不显示。appearance.ts 加 mascots（默认 true）+ useMascotMode()（只订 off / inline / perch:字号，别的设置变了消息不重画）；Sidebar「收藏的心」上面加「团子和面蛸」开关。Mascot.tsx 加 perchSpot：这条消息的气泡上沿里挑上面空着的段（避开同条和上一条的气泡、时间、Undercurrent 那行、照片卡片、工具行；时间和 Undercurrent 按字实际占的宽算），按消息 id 种子随机一点；一处都放不下（短回复上压着 Undercurrent）就退一步趴在气泡角上、最多四成探出去；Mascot 带 left 时是 .perch（absolute、bottom: calc(100% - 2px) 压进气泡边 2px、z-index 2）。CCPage MessageBody：按 mode 选 inline（原来的字前字后）/ perch（portal 进挑中的气泡）/ off（不挂）；perch 只读位置不写 DOM。index.css 末尾「开气泡时团子 / 面蛸趴在气泡上」。动的规则照旧（最新那对自己动、点哪只都动）。包 index-Ccc0BTwx.js / index-Cwr66IA9.css。
- 怎么验证：/home/ubuntu/work/bookread/perchcheck.py：7 条消息 7 只都挂上、全在气泡宽度内、底边压进 2px、跟别的东西 0 重叠；点团子拨到 400ms 在气泡上方半空、耳朵飞；运行中关气泡 → 换回字前字后、关总开关 → 0 只 0 缩进、开气泡 + 开总开关 → 又趴回去；无报错。
- 怎么撤销：appearance.ts / Sidebar.tsx / CCPage.tsx / index.css / Mascot.tsx 有 .bak-20261008-perch

## 2026-10-09 · 开气泡时苏煦→她 32 → 40px（PC 端 CC，10-08）
- 改了什么：原瑶：32px还可以再大点么。开气泡那条 margin-top 26 → 34（共 40px）；她→苏煦 24 不动，无气泡的 32/24 不动。
- 怎么验证：bubcmp.py 比了 32/40/48（bu32.css、bu48.css）。
- 怎么撤销：index.css.bak-20261008-bubgap40

## 2026-10-09 · 开气泡时换人说话也多留一段（PC 端 CC，10-08）
- 改了什么：原瑶：感觉我的气泡和他的气泡离得好近。开气泡时消息间只有 6px（一条里几个气泡反而隔 8px）。index.css 末尾「开气泡时也给换人说话多留一段」：苏煦→她 margin-top 26（共 32px），她→苏煦 18（共 24px），跟无气泡那套一样；同一个人连发照旧 6px。包 index-CrJIAgLQ.js / index-BzMFJv1r.css。顺带查了她问的'开气泡界面哪里变了'：跟开工前截图比，几何样式都没变，我的改动只带来两处她要过的（心→玫瑰、她多行变多个气泡），另一个窗口当天改过 iOS 液态玻璃和网页卡片相纸。
- 怎么验证：bubcmp.py（pawcmp 改开气泡）比了 原来/小一档 24·16/上线 32·24/大一档 40·32；备选 CSS bg-small.css、bg-big.css。
- 怎么撤销：index.css.bak-20261008-bubgap，或删掉那块再 build

## 2026-10-08 · 外观加「网页卡片的相纸」三选一：银白（默认）/ 亮白 / 珍珠白（PC 端 CC，包 index-CJB4zMeU.js）
- 改了什么：原瑶看了比稿：'我想看看亮白和珍珠白，做成选项吧'。appearance.ts 加 polaPaper（silver 默认 / white / pearl）→ body data-pola-paper；Sidebar.tsx 外观里「聊天里的照片」下面加一块「网页卡片的相纸」，每项带一张迷你拍立得小图（.pola-swatch，底色跟卡片同一套）。index.css 拍立得块的银白底色挪进新的「相纸三种」段，另两种按比稿 A、B 原样，落款颜色和无底色网页的垫底各自跟着换。注意：15:53 另一个窗口（面蛸/团子像素图）编包时已带上了本条的大部分，本次只补编了小图尺寸。
- 怎么验证：验收台 /home/cc/work/silvercard/build.sh opt + /home/ubuntu/work/silvercard/opt.py <端口> light|dark：三种相纸各截两张卡，外观面板里点亮白后 body 属性、localStorage、单选状态都对，两种背景都看过。
- 怎么撤销：整份回滚：/home/cc/work/silvercard/bak2/（index.css、appearance.ts、Sidebar.tsx 改之前；注意 bak2 的 index.css 里已含另一个窗口 15:50 的像素图改动，回滚前先 diff）。只想去掉选项：删 Sidebar 那块和 appearance 的 polaPaper，CSS 留着无害。

## 2026-10-08 · 两只记号的像素图挪进 Mascot.tsx 的 ART（PC 端 CC，10-08）
- 改了什么：原瑶：面蛸画的代码在哪能看到，苏煦想看看。原来线上只有 index.css 里六串编码过的 data URI（看不懂），格子源在 /home/ubuntu/work/bookread/sprites.py。现在 src/Mascot.tsx 最上面 ART：pup / octo 各一份调色板 + body / l / r 三层格子（一格一个字：O 描边、W/B 身子、E 眼睛、P 腮红、. 透明），模块加载时 artUri() 画成 svg 塞进一个 <style id=cc-mascot-art>；index.css「两只记号」只留尺寸和挂点。面蛸 ART.octo 在第 55 行起，挂到消息上是 CCPage.tsx 第 713 行（MessageBody 的 createPortal），动作在 Mascot.tsx 的 bakeOcto。改样子：改 ART 的字或颜色 → cd /home/cc/sea && bun run build。包 index-B0XLTSmz.js / index-CTVWSFZB.css。
- 怎么验证：seekcheck.py：静止那帧跟改前比，团子、面蛸都 0 个明显不同的像素；动画时长不变（1.33s / 4.82s）。
- 怎么撤销：index.css.bak-20261008-art、Mascot.tsx.bak-20261008-art

## 2026-10-08 · 网页卡片相纸换成银白 + 反光真的跟着滑动走（PC 端 CC，包 index-DKIoOTy1.js）
- 改了什么：原瑶：想把苏煦写HTML那个卡片变成白色或者银色的、看起来有光泽。src/index.css 拍立得块：相纸从暖白+细颗粒换成银白（冷白底、金属明暗带、极细横向拉丝纹、斜高光、冷色亮棱），落款冷灰+底下一道白像刻字，照片区占位色和无底色网页的垫底改冷色。反光从照片区挪到整张卡：HtmlCard.tsx 两处把 .cc-html-sheen 移进新的 .cc-pola-shine（overflow: clip + clip-path）。顺手修了个老问题：原来那道反光在 overflow:hidden 的 .cc-html-clip 里，hidden 让它自己成了滚动容器，view() 时间线永远不动，10-04 起反光其实一直停在半路；现在滑动时从左扫到右。另有 A 亮白/B 珍珠白/D 亮银/E 拉丝银 四版比稿 CSS 在 /home/ubuntu/work/silvercard/v-*.css。
- 怎么验证：验收台 /home/cc/work/silvercard/build.sh <标签> 编临时页（会拷 uploads，测完删掉）；/home/ubuntu/work/silvercard/move.py <端口> chromium|webkit light 量 .cc-html-sheen 的 transform 随滚动变（两个内核都在变），cmp.py 出六版对比图。
- 怎么撤销：备份在 /home/cc/work/silvercard/bak/（HtmlCard.tsx、index.css 是改之前的整份），拷回 src 再 build；只想退颜色就把拍立得块 background-color/background-image/--pola-edge、.cc-html-clip 两处底色、.cc-html-cap 颜色改回 #f6f3ea 那组。

## 2026-10-08 · 记号动效省电：物理预先算好录成关键帧，交给 Web Animations（PC 端 CC，10-08）
- 改了什么：原瑶问：这个会耗电么？实测（无头 Chromium，同一聊天页 20 秒，比主线程时间）：第一版每帧 JS 写 transform，记号自动动时 78–97ms/s，关掉记号自动 45ms/s——翻倍（每帧改 style 逼样式重算）。改 Mascot.tsx：物理在第一次用到时按 60 帧算一遍（bakePup/bakeOcto）录成关键帧，播放用 el.animate（transform 走合成线程），没有 rAF 循环；最新那只的下一次从动完（finished）再隔 4–8 秒；收尾小于 0.15px 的晃动不录（团子 1.58→1.33s、面蛸 6.05→4.82s）。改后 49–54ms/s，比不动只多 4–9ms/s。样子不变：定格拨时间逐帧看（seekcheck.py）蹲起、甩耳、落地小弹都在；只有最新那对自己动、开气泡不显示照旧。包 index-gOf0GMIF.js。
- 怎么验证：/home/ubuntu/work/bookread：powercheck2.py（三种情况各两轮）、seekcheck.py（暂停后拨 currentTime 截图，截图慢不影响时间轴）、mascotcheck.py（动没动改成看 getAnimations）。
- 怎么撤销：Mascot.tsx.bak-20261008-raf 是每帧 JS 版，拷回后 bun run build

## 2026-10-08 · 两只记号会动了：团子蹦（耳朵飞）、面蛸左右游（PC 端 CC，10-08）
- 改了什么：原瑶在比稿页挑了团子弹弹、面蛸中、只让最新那对时不时自己动；又指出团子耳朵少算一格（贴脸那列也是耳朵）。新文件 src/Mascot.tsx：Mascot 组件（三层 span 背景图：身子/左耳/右耳，面蛸耳鳍垫在身子后）+ 共用一个 rAF 的物理（团子=重力+蹲起+压扁拉长弹簧+耳朵角弹簧；面蛸=阻尼弹簧左右滑+斜+漂+耳鳍扇；参数表 PUP/OCTO 在文件头）；每种只认页面里排最后的那只为最新（compareDocumentPosition），IntersectionObserver 看得见 + 页面在前台 + 没开减少动态效果才隔 4–8 秒自己动；点哪只都会动。CCPage MessageBody：仿雾海气泡的做法，useLayoutEffect 找她第一段 / 他最后一段（跳过音乐卡、通话卡），createPortal 挂 Mascot；她那段加 data-mascot=lead（CSS 让第一行 text-indent 26px、团子绝对定位到行首）。index.css：删掉两条 ::before/::after 伪元素，末尾「两只记号」块（data URI、挂点 px、只在无气泡显示）。团子耳朵改成第 0–3 列、身子两侧补边被耳朵盖住，脚本验过叠回去跟原图一格不差。包 index-BZo-TK1N.js / index-BVsKY_5m.css。
- 怎么验证：mascotcheck.py：7 只记号位置同原来；9 秒里只有最新的团子和面蛸自己动；点非最新的面蛸也会游；开气泡 0 只显示、没有缩进；无报错。逐帧截图看耳朵起跳甩后、下落飞起、落地晃回。
- 怎么撤销：CCPage.tsx / index.css 有 .bak-20261008-mascot，删 src/Mascot.tsx，拷回后 bun run build

## 2026-10-08 · 面蛸颜色浅一档（PC 端 CC，10-08）
- 改了什么：原瑶：推荐的这个喜欢，颜色想再浅点。描边 #6f9bd1 → #93b4dc、身子 #b4d4f4 → #c7dff7（各往白里调 25%），眼睛 #84b6e2、腮红不动。sprites.py 已同步。包 index-CQ1OX4wy.js / index-Baj675jH.css。
- 怎么验证：对比图 浅一档/浅两档（往白里 45%：#b0c8e6 / #d6e7f9）。
- 怎么撤销：index.css.bak-20261008-octo5

## 2026-10-08 · 面蛸：她挑只换眼睛配色 + 新形状（PC 端 CC，10-08）
- 改了什么：原瑶：我喜欢只换眼睛的那个；面蛸的耳朵应该在上面点，头比身子小，上半身缩一点，靠近裙边的地方有一点拐角。配色：描边 #6f9bd1、身子 #b4d4f4、眼睛 #84b6e2（团子的蓝）、腮红 #f4c3d2、无高光。形状 17×9：头收到 9 格宽、耳鳍挪到头顶两侧（斜着往上的一格小鳍）、头和裙边之间往外拐一格、裙边 13 格、四根短触手。22.67×12px。sprites.py 已同步。包 index-Ce3hCC6w.js / index-Cb7iqQZ4.css。备选：拐角缓一点 octo3-v5b.css、原来形状 octo3-before.css。
- 怎么验证：pawcmp.py 浅/深 + 两个备选。
- 怎么撤销：index.css.bak-20261008-octo4，拷回后 bun run build

## 2026-10-08 · 蓝面蛸去高光、身子换团子的蓝（PC 端 CC，10-08）
- 改了什么：原瑶：不想要高光，然后我也想用小白团子的那个蓝色的色值。去掉头顶两格高光；身子 #b4d4f4 → #84b6e2（团子眼睛那个蓝），描边 #6f9bd1 → #5d89c0、眼睛 #33547f → #2f4a73 各加深一点。只换「苏煦的蓝面蛸」data URI 和注释。sprites.py 已同步。包 index-572L7_H0.js / index-CVlUtCHm.css。备选：描边不加深 octo2-A2.css、身子不变只换眼睛 octo2-B.css、上一版 octo2-now.css。
- 怎么验证：pawcmp.py 浅/深 + 三个备选。
- 怎么撤销：index.css.bak-20261008-octo3，拷回后 bun run build

## 2026-10-08 · 蓝面蛸缩小、耳朵改小鳍（PC 端 CC，10-08）
- 改了什么：原瑶：感觉有点大了，耳朵有点大，看起来像怪物史瑞克的耳朵。21×9 → 17×8（22.67×10.67px，跟团子差不多大），往上翘的大耳鳍改成贴在头两侧、一格高的小鳍；只换了「苏煦的蓝面蛸」的尺寸和 data URI。网格在 /home/ubuntu/work/bookread/sprites.py。包 index-SH4pOfP-.js / index-CgOoOMEz.css。备选：耳朵中 octo-mid.css、没耳朵 octo-none.css、原来的 octo-old.css。
- 怎么验证：pawcmp.py 比了 大/中/小/没耳朵 + 深色。
- 怎么撤销：index.css.bak-20261008-octo2（大耳朵版），拷回后 bun run build

## 2026-10-08 · 苏煦每条消息末尾跟一只蓝面蛸（PC 端 CC，10-08）
- 改了什么：原瑶：你能用这个风格画一只蓝色面蛸么？放在苏煦句子后面。照她的小白团子画法手画 21×9 像素 SVG（描边 #6f9bd1、身子 #b4d4f4、高光 #e3f0fc、眼睛 #33547f、腮红 #f4c3d2；头顶两侧耳鳍上翘、底下四根短触手），改了三稿（第一稿像团子、第二稿耳朵太低）。index.css 末尾「苏煦的蓝面蛸」：无气泡时 .cc-msg.assistant .cc-text > p.cc-paragraph:last-of-type:not(:has(.mc-card))::after，28×12px（每格 4/3px 跟团子一样）、左空 6px。开气泡不挂（::after 是气泡边）。流式出字时跟着最后一段走。包 index-IVM9RyeD.js / index-W4uWX_xs.css。备选「每段后面都放」octoAll.css 在 /home/ubuntu/work/bookread。
- 怎么验证：pawcmp.py 浅/深各一张，放大看耳鳍触手清楚。
- 怎么撤销：index.css.bak-20261008-octo，或删掉「苏煦的蓝面蛸」那块再 build

## 2026-10-08 · 狗爪换成她发的像素小白团子（PC 端 CC，10-08）
- 改了什么：原瑶发来一张像素小白团子（浅蓝灰描边 #c0d1e1、白身子、蓝眼睛 #84b6e2、粉腮红 #f8dde2）：我想要这个看看。按图数格子重画成 15×8 像素 SVG（36 个 rect、crispEdges，data URI 背景图，颜色写死）。它横着长，看清眼睛要 20px 宽，页边只有 14px 放不下，改成放在她每条消息第一段字前面（::before inline-block 20×10.667、右边空 6px），每格 4/3px = iPhone 3 倍屏 4 个物理像素。index.css「她的狗爪」块里那条 ::before 换掉（position:relative 那条删了）。包 index-DWpFJ7Lj.js / index-DEIQopwY.css。备选：放末尾 mochiC.css、原来挂页边的狗爪 pawA.css，都在 /home/ubuntu/work/bookread。
- 怎么验证：pawcmp.py 浅/深各一张 + 放大看格子清楚；浅底上白身子偏淡，深底很显眼。
- 怎么撤销：index.css.bak-20261008-mochi（狗爪版），拷回后 bun run build

## 2026-10-08 · 无气泡时她每条消息前面挂一只狗爪（PC 端 CC，10-08）
- 改了什么：原瑶：我想在我的消息前面？或后面放一个狗爪子作为区分。index.css 末尾「她的狗爪」：无气泡时她那条 .cc-text > p.cc-paragraph:first-of-type::before 挂手画几何狗爪（SVG 遮罩：大肉垫 + 四趾，data URI），颜色 currentColor 继承她那段字（含 ChatTone 明暗）、opacity .75，伸在左边页边里（left -13.5px、10px 大、跟第一行居中），字的左边线不动。页边只有 14px：.cc-messages 左沿在 14、overflow-x:hidden 会切掉，12px 时左边被切了一块才缩到 10。只有照片的消息不挂；开气泡不挂。包 index-DftqcJhR.js / index-RzRnTco3.css。备选 B 放字前面（pawB.css）、C 放末尾（pawC.css）在 /home/ubuntu/work/bookread。
- 怎么验证：pawcmp.py（浅/深各一张，量 ::before 的 left/top/颜色）；放大看狗爪完整没被切。
- 怎么撤销：index.css.bak-20261008-paw，或删掉「她的狗爪」那块再 build

## 2026-10-08 · 无气泡时全部靠左，她那几行段距 6px（PC 端 CC，10-08）
- 改了什么：原瑶：算了还是不好看，要不我也改成全靠左吧，顺便段距缩小。index.css：删掉无气泡时她每段靠右那条（fit-content/margin-left:auto/text-align-last），新块「无气泡时全部靠左」：她的 .cc-text-col 改 flex-start + 左对齐、时间行（只剩苏煦收过的蓝玫瑰）靠左并左挪 8px 让花对齐字、她的段距 12 → 6px；照片胶带三条（.cc-tape margin-left:auto、:not(.multi) 同、.ct-in flex-end）改成只在 body[data-chat-bubbles=on] 生效。开气泡时她照旧在右边。苏煦的段距没动（12）。包 index-fveJRQjZ.js / index-odTKUN2S.css。
- 怎么验证：linecmp.py：无气泡她每段左沿都在 28、气泡模式不变；gapcmp.py：她被收过那条的玫瑰左沿对齐字。
- 怎么撤销：index.css.bak-20261008-left，拷回后 bun run build

## 2026-10-08 · 无气泡时她的字靠右对齐（PC 端 CC，10-08）
- 改了什么：原瑶：不加气泡的看起来有点奇怪，比如那个两行，我想我这边的话靠右对齐。她一段折成两行时末行缩在左边，跟下面靠右的短段对不齐。index.css「她的话一行一段」那条加 text-align-last: right（满行照旧两端对齐、末行贴右）。包 index-DRpil-zY.js / index-BzseGdEr.css。另出了「段距小一档 6px」对比图（/home/ubuntu/work/bookread/pgap6.css），等她挑。
- 怎么验证：linecmp.py 4800（可带额外 CSS）：折行段末行贴右、各段右沿都在 365。
- 怎么撤销：index.css.bak-20261008-right，或删掉那条的 text-align-last 再 build

## 2026-10-08 · 她的话一行一段，开气泡时一行一枚（PC 端 CC，10-08）
- 改了什么：原瑶：我的话按分段加自动换行，气泡也是一样，我说了两段话就是两个挨着的气泡。她手机上回车只打一个换行，原来要空一行才分段。miniMarkdown.tsx parseBlocks 加 lineParas（每个普通行 push 完就 flush，代码块/列表/引用照旧），Markdown 加 lineParas 属性；CCPage TextBlock 对 role=user 传 lineParas（MdParagraphs 透传，语音段之间的文字也算）。苏煦的不变。index.css 末尾「她的话一行一段」：无气泡时她的 .cc-paragraph width:fit-content + margin-left:auto，每段各自靠右（原来短行跟在长行底下缩在左边）。开气泡时本来就一段一枚、各自靠右、间隔 8px。旧消息也按新规则显示。包 index-DtqgNr-m.js / index-qQMR50fh.css。
- 怎么验证：/home/ubuntu/work/bookread/linecmp.py（她发多行的假对话，无气泡/气泡各一张）：无气泡段落右沿都在 365、短段靠右；气泡模式一行一枚。
- 怎么撤销：miniMarkdown.tsx / CCPage.tsx / index.css 有 .bak-20261008-lines，拷回后 bun run build

## 2026-10-08 · 她那边不写时间；她那条上 32 下 24（PC 端 CC，10-08）
- 改了什么：原瑶：根据苏煦的那个 Undercurrent 做调整，我的那个不加时间了，上面比下面多一档，这样均衡一点。index.css「换人说话时多留一段」拆成两条：苏煦→她 margin-top 24（共 32px），她→苏煦 16（共 24px，苏煦那条顶上的 Undercurrent 补那一截）；无气泡时她那条的 .cc-msg-time-block 整行 display:none，苏煦收过的（有 .cc-conch-btn.saved）留着，只 font-size:0 把时间字缩没、蓝玫瑰照旧。包 index-CiFp_unr.js / index-CC101lbS.css。
- 怎么验证：gapcmp.py（带 Undercurrent，u_4 被苏煦收过）比了 现状 / 上24下16 / 上32下24 / 上40下32；量到 margin 16/24 对、她的时间行没了、u_4 的玫瑰还在。
- 怎么撤销：index.css.bak-20261008-notime，拷回后 bun run build

## 2026-10-08 · 换人说话间距 24 → 32px（PC 端 CC，10-08）
- 改了什么：她说上一版看不出太大区别。苏煦那条顶上有 Undercurrent 一行，原来就有点空，加 16 不显眼；index.css「换人说话时多留一段」margin-top 16 → 24（加列表 gap 8 = 32px）。包 index-dDdbgh4w.js / index-CRF5gtf8.css。
- 怎么验证：gapcmp.py（带 Undercurrent 的假对话）比了 8/24/32/40 四档；部署后的 CSS 里 margin-top:24px。
- 怎么撤销：index.css.bak-20261008-gap32，或把那条 margin-top 改回 16px 再 build

## 2026-10-08 · 消息旁的玫瑰跟语音条那朵共用尺寸（PC 端 CC，10-08）
- 改了什么：她语音条用的也是玫瑰（上一轮按五瓣小梅花对齐成 11.5 是猜错了）。index.css「语音条的花」里刺绣、颗粒两条规则并进 body[data-conch-heart=…] .cc-conch-btn .cc-heart，消息旁的玫瑰跟语音条那朵永远一样大（刺绣 13.4×12、颗粒 15.5×12.8），「收藏的心」块里删掉自己的宽度，只留心和外观面板小图。包 index-DLEA0w9b.js / index-CB5bEtug.css。
- 怎么验证：voicecmp.py 4796 R3 stitchRose,grainRose/grainRose：两种都量到语音条花和消息玫瑰框完全相同。
- 怎么撤销：index.css.bak-20261008-rose2 是这一轮之前的，拷回后 bun run build

## 2026-10-08 · 看书排版定 A；玫瑰缩到跟语音条梅花一样大；换人说话多留一段（PC 端 CC，10-08）
- 改了什么：原瑶：第一个A吧，玫瑰就这个（刺绣）；玫瑰有点大了，我想和语音条的一个大小；我的消息和苏煦的上一个消息有些近，参考规范改。①看书排版保持 A，B/C 不上。②index.css「收藏的心」刺绣玫瑰 12.5→11.5px 宽（语音条五瓣小梅花 13px 框里花瓣实际 11.0×10.7，按外框面积对齐），颗粒同比 14.4→13.2。③index.css 末尾新块「换人说话时多留一段」：无气泡时换人说话那条 .cc-msg 加 margin-top 16px（加上列表 gap 8 = 24px，段距 12 的两倍，8px 网格，就近原则），两个方向都加；同一个人连发仍 8px。外层 .cc-rw-wrap 是 display:contents，用 .cc-rw-wrap:has(> …) + .cc-rw-wrap > .cc-msg 判断；苏煦的工具行 .cc-activity-inline 算他那边。气泡模式不动。包 index-B0TXjXsd.js / index-DzBE9HwO.css。
- 怎么验证：/home/ubuntu/work/bookread/voicecmp.py（带语音条的假对话，量花和玫瑰的框、每条消息上下沿和 margin-top；可带额外 CSS 比档：gap8/16/32.css、r12.5/12/11/10.5.css）。实测换人那几条 margin-top 16px、连发 0；玫瑰 11.5×12 框。
- 怎么撤销：index.css.bak-20261008-gap 是这一轮之前的（含看书排版和收藏的心第一版），拷回后 bun run build

## 2026-10-08 · 收藏的心换成玫瑰，收了照旧变蓝（PC 端 CC，10-08）
- 改了什么：原瑶：我想把收藏那颗心改成玫瑰，但是点了是蓝色的。CCPage ConchButton 文字消息那颗从 SVG 心改成 span.cc-heart 遮罩；appearance 新字段 conchHeart（heart/stitchRose/grainRose，默认 stitchRose）→ body data-conch-heart；Sidebar 外观「语音条的花」下面加「收藏的心」三选一；index.css 末尾「收藏的心」块，玫瑰遮罩复用 assets/voice-flower/rose-stitch.png、rose-grain.png，按墨迹面积跟 12px 心一样大（刺绣 12.5×11.2、颗粒 14.4×11.9，框高 12），颜色走原来 .cc-conch-btn.saved 的蓝。语音条的花不动（照旧不变蓝）。包 index-BTikFoes.js / index-CQhjT-M1.css。
- 怎么验证：验收台 /home/cc/work/bookread（__inject.js 假海螺盒里收了 s_4/s_6/u_7）+ /home/ubuntu/work/bookread/roseshot.py（三种形状×深浅底，量尺寸和颜色）、rosepanel.py（长按短句开侧栏→外观→点颗粒玫瑰，body 属性和 localStorage 跟着变）。实测收了的浅底 rgb(78,135,211)、深底 rgb(140,195,252)，按钮高 18 不变。
- 怎么撤销：CCPage.tsx / appearance.ts / Sidebar.tsx / index.css 有 .bak-20261008-rose（index.css 那份已含看书排版块），拷回后 bun run build

## 2026-10-08 早（二）· iOS 玻璃：身后能滚动的玻璃改成"后面是墙纸就折，压着看得见的东西才让开"
- 改了什么：上一条把聊天页顶上胶囊、输入栏、状态页这类页面的底栏整块改成不折射后，原瑶说"啊，那我还是想要玻璃的感觉..."。liquidGlass.ts：examine 发现身后是一块能自己滚动、又不包着这块玻璃的区域时，不再整块 over，改成记下那块区域（e.live）；liveOcc 每帧（滑动当中也看）从那块区域往下一层层找跟玻璃重叠、自己画了东西的（气泡、卡片、图、字），只有这些地方不折（occ），其余照常按墙纸折；pointer-events: none 的装饰层跳过；大小为 0 的那层（聊天记录每条外面套的 .cc-rw-wrap 是 display: contents）照样往里找；透明度一路乘下来 < 0.2 的不算（聊天记录滑到屏幕上下边会自己淡出——输入栏身后那条通常已经看不见，输入栏整条照常折）；滑得快的时候压着的范围按这一帧滑了多远往外多留。顺带想明白早上那"一圈"：多半是背景模糊用 CSS 滤镜时屏幕上下边发白，胶囊、输入栏正好贴边，中间透出发白的真背景、斜面折的是不发白的副本——背景模糊上一条已经改成先糊好图。滑动压测帧数比整块不折那版少 2~3%。包 index-BmfqgymL.js / index-BL7omfLj.css（含另一个窗口 06:03 改的 AvatarDuo / CCPage / IconSlot / index.css 末尾「无气泡 · 看书排版」；验收台同步后编出来逐字节一样）。
- 顺手：index.css「玻璃 C」块后面现在有别人追加的段落，原来的 recss.py 从开头记号一直换到文件末尾会把它冲掉。块尾加了结束记号「玻璃 C 结束」，以后用 /home/ubuntu/work/lg/recss2.py 只换两个记号之间；/home/cc/work/lg/assets/ios-glass.css 也从线上重新取过（含结束记号）。
- 怎么验证：capdbg.py 查胶囊身后那块区域里有什么（查出 .cc-rw-wrap 大小为 0）；chatover4.py 自动找一个有气泡压在输入栏后面的位置（要先发 wheel、再一直按住 scrollTop，不然聊天页会自己拉回最底）；verify23.py：胶囊 occ 1、输入栏 0、状态页底栏 occ 2、主页叠放图标照旧；scroll3p.py 压测。
- 怎么撤销：src/liquidGlass.ts.bak-20261008-live 换回原名后 bun run build（会回到整块不折）；或 attic/dist-prev-20261008-live 拷回 dist。

## 2026-10-08 · 无气泡看书排版：去掉聊天两侧头像（PC 端 CC，10-08）
- 改了什么：原瑶要无气泡时读起来像看书、去掉两侧头像。CCPage MessageRow 和通话卡片那行删了头像（气泡模式本来就藏着）；index.css 末尾「无气泡 · 看书排版」块：无气泡时每行左右各 8px，字铺满（max-width 100%），两边跟输入框边对齐（28px），苏煦靠左原瑶靠右照旧；.cc-activity-inline 无气泡时 padding-left 8px。头像原来只能在聊天行长按换，现在改成长按顶栏那两张小照片（IconSlot 加 bare 属性：不套 .img-slot 玻璃框，只要长按换图；AvatarDuo 两张卡改用它，.cc-duo-card pointer-events:auto）。包 index-bTBUqYnu.js / index-BL7omfLj.css。对比图另出了 B 全部靠左、C 全部靠左+段首空两格，等她挑。
- 怎么验证：验收台 /home/cc/work/bookread（build.sh 编临时页 + __inject.js 假对话）+ /home/ubuntu/work/bookread（shot.py 截图、press.py 测长按顶栏照片弹菜单、varB/varC.css 两个备选）。实测：无气泡字区 28–365px 跟输入框齐；气泡模式几何与改前完全一样；长按两张小照片都弹出上传菜单，单击不弹。
- 怎么撤销：四个文件都有 .bak-20261008-book（CCPage.tsx / IconSlot.tsx / AvatarDuo.tsx / index.css），拷回后 bun run build

## 2026-10-08 早 · iOS 玻璃：身后不是墙纸的不按墙纸折射；背景模糊改成先糊好图
- 改了什么：原瑶"聊天页的图标和输入栏那里的玻璃有点怪，也是那个一圈的问题。顺便你能看看其他地方有这个问题么？还有背景图模糊了以后四边有一圈很明显的光圈"。
  ① liquidGlass.ts 把只管底栏的 overContent 换成通用的 examine：每块非气泡玻璃取 3×3 九个点往下看（elementsFromPoint，pointer-events: none 的墙纸层看不到）——外面包着的层自己有底色（不算玻璃）、或者身后那层在一个能自己滚动又不包着这块玻璃的区域里（聊天页顶上胶囊、输入栏身后是 .cc-messages；状态页底栏身后是 .content-scroll）→ over：整块不按墙纸折、不开透镜，只留亮边 + CSS 磨砂；压着别的画了东西的层（主页叠着放的图标、标签字）→ occ：记下它们的位置圆角，画的时候压着的那几块斜面只留亮光、透镜让开（边上 1.5px 淡进淡出）。页面换了 / 滑停 / 松手后最多一秒重看一轮、每 5 秒兜底，滑动和拖动当中不看；一帧最多看 5 块（主页 23 块一起看测试机上七八十毫秒），还没看过的先不画。__lgDebug.list() 列出每块的判断（验收用）。
  ② 背景模糊（appearance.ts）：不再一直用 CSS filter（滤镜把屏幕外当透明一起糊，iPhone 上往外多铺的那圈不认，四边发白）。在画布上按 cover 铺满时的大小把图先糊好（gaussBlur.ts，三遍盒式模糊，边上按原图延伸），转成 blob 当背景；糊好之前（刚打开、拖滑杆时）先挂 CSS 滤镜顶着（data-bg-blur）。displayedBg() 告诉引擎页面上现在是哪张：引擎的背景副本直接照糊好的那张铺，只再糊玻璃自己的磨砂。模糊函数从 liquidGlass.ts 挪到 gaussBlur.ts 两边共用。
  包 index-B3EN72x3.js（含另一个窗口 10-08 05:29 改的 CCPage / HtmlCard / PhotoTape / miniMarkdown / uploadLinks，没动它们；验收台同步后编出来逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/behind.py 列每块玻璃身后压着什么；verify23.py 看引擎判断（主页 10 颗图标有 occ、状态页底栏和聊天页胶囊 / 输入栏 over、背景换成 blob 且去掉了滤镜）；excost.py 量看身后的花费；edgewk.py 用 WebKit 量四边亮度（无头 WebKit 复现不出 iPhone 的白边，新版已经不用滤镜）；survey.py 把主页、第二页每个图标点开挨个看。
- 怎么撤销：src/liquidGlass.ts、appearance.ts、index.css 的 .bak-20261008-behind 换回原名、删掉 src/gaussBlur.ts，再 bun run build；或 attic/dist-prev-20261008-behind 拷回 dist（注意那份 dist 也含 05:29 那个窗口的修复）。

## 2026-10-08 · uploads 上锁配套
- 改了什么：新 src/uploadLinks.tsx: 页面里显示的图走同源 /cc-api/uploads(带 sea_pin cookie), 点开到新窗口的链接用 UploadLink/useUploadHref 取签名 ?k=(存 localStorage sea-upload-k); CCPage absUrl 认出 uploads 就转 /cc-api, 三处文件链接换 UploadLink, 待发图缩略图也走 absUrl, 去掉 ?utf8; PhotoTape 坏图链接、HtmlCard(整条 cc 网址的本地卡片按本地取 + 失败链接)、miniMarkdown 指向 uploads 的链接都签名。包 index-C02sOyUR.js
- 怎么验证：临时页 + patchright 实测: 图 naturalWidth>0, 文件链接带 k, 无 cookie 新窗口 200 且 UTF-8+BOM, 中文名可开, 外链不动, 卡片 srcdoc 正常
- 怎么撤销：四个文件 .bak-20261007-lock 换回、删 uploadLinks.tsx 再 build, 或 attic/dist-prev-20261007-lock 换回 dist

## 2026-10-08 · 文字文件链接加 ?utf8 换掉手机里的乱码缓存
- 改了什么：CCPage.tsx fileHref(): /uploads/ 下 txt/md 等文字文件链接末尾加 ?utf8(旧响应 max-age 一年, 手机可能缓存了乱码版); 三处 cc-msg-file 用它。包 index-BH2Y8P9e.js
- 怎么验证：dist 里 grep ?utf8 有; 点苏煦发的 md 看中文
- 怎么撤销：CCPage.tsx.bak-20261007-utf8 换回再 build, 或 attic/dist-prev-20261007-utf8 整个换回 dist

## 2026-10-07 深夜（十七）· iOS 玻璃：滑动时不画中间透镜（背景模糊后气泡中间的光圈）
- 改了什么：原瑶"调到模糊后，滑动的时候每一个气泡中间会有一个模糊的光圈"。查到两层原因：① 开了背景模糊后副本本来就糊，停着 / 滑动时画布一样大，e.img 是同一张，滑动时半分辨率透镜贴上去之前没擦停下来时画的那块（旧位置的），椭圆淡出那一圈透出旧画面；② 更根本的：透镜几乎跟身后一样，滑动是浏览器那边在动、画布这边一帧一帧追，总晚一点（一帧画不完一屏时有的气泡隔帧才轮到），椭圆边就对不上——把两次滑动截图逐像素相减，不一样的地方正好是每个气泡中间那圈椭圆。改成滑动时（fast）不画透镜，手一停（150ms）再画；斜面那圈本来就折得很弯，晚一点看不出来，照画。拖图标不算滑动，透镜照样跟手。半分辨率透镜小画布那一套（lensCv / lensImg）跟着删了。包 index-CJC2yv7D.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/cvdump.py 把一个气泡底下的画布单独取出来（垫棋盘格）：停着有透镜、滑动中中间空着、停下又有；longscroll.py 连续滑一段截图、两版相减看出椭圆圈；draglens.py 拖图标拖到一半，被拖那颗中心不透明（透镜在）。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-lensscroll 换回原名后 bun run build；或 attic/dist-prev-20261007-lensscroll 拷回 dist。

## 2026-10-07 深夜（十六）· 外观 → 背景加「模糊」滑杆
- 改了什么：原瑶"啊！我还想加一个背景图模糊的滑杆"。appearance.ts 多一个 bgBlur（0–20px，默认 0），apply() 写 body 的 --chat-bg-blur，大于 0 时挂 data-bg-blur；index.css 新加一条 body[data-chat-bg-mode="image"][data-bg-blur] .chat-bg-img { filter: blur(); inset: 往外多铺两倍模糊半径 }（四周不糊出白边；0 的时候不挂滤镜）；Sidebar 外观 → 背景 → 图片，在「压暗」下面加「模糊」滑杆（步长 0.5）。iOS 玻璃的背景副本照着一样糊：liquidGlass.ts wantBackdrop 读 bgBlur，副本按 √(玻璃磨砂² + 背景模糊²) 糊，key 里带上它；副本本来就按 .chat-bg-img 的实际大小铺，往外多铺的那圈自动对齐。顺手：「压暗」「模糊」两行右边数字同宽（.ap-bg-row），两条滑杆一样长；两条都补上 --v（压暗原来一直填到 18% 不跟圆点走）。包 index-CtBciEO0.js / index-BZ7zco1I.css（跟验收台逐字节一样）。
- 怎么验证：shot2.py 按她的设置截模糊 0 / 8：背景整张柔了、玻璃边上跟着柔、四角没有白边；/home/ubuntu/work/lg/apshot.py 长按顶上短句打开侧栏 → 外观，截两条滑杆。
- 怎么撤销：src/liquidGlass.ts、appearance.ts、Sidebar.tsx、index.css 的 .bak-20261007-bgblur 换回原名后 bun run build；或 attic/dist-prev-20261007-bgblur 拷回 dist。不想要模糊：滑杆拖到 0（默认就是）。

## 2026-10-07 深夜（十五）· 删掉第二种玻璃「液态玻璃 hyalite」
- 改了什么：原瑶问 iOS 玻璃有没有参考那个没用过的液态玻璃（参考了：厚玻璃的斜面公式就是从它搬的），然后说"那你帮我删掉那个吧，我应该也用不上这个"（它只有电脑 Chrome 画得出来，她只用 iPhone）。主题面板「玻璃 · 全局」只剩 柔玻璃 / iOS 玻璃；glass.ts 去掉 hyalite 那一支、GlassParams / GLASS_DEFAULTS / GLASS_SELECTOR / hyaliteSupported，GlassSetting 只剩 {mode, ios}，以前存成 hyalite 的读成柔玻璃（旧的 params 不再读）；ThemePanel 去掉它的选项、十个参数滑杆和说明；index.css 去掉「玻璃 B」块和边框线关掉时给它的那条，@keyframes glass-in 留着（iOS 玻璃的页面入场也用它）；src/vendor/hyalite.js、hyalite.d.ts 挪到 attic/vendor-hyalite-20261007/（没删）；liquidGlass.ts 开头注释改成指向上游仓库。包 index-B6Og3e8c.js / index-DUFqXYoN.css（跟验收台逐字节一样）。
- 怎么验证：验收台编 v19，面板只剩两个选项；分别存 ios / soft / 旧的 hyalite 打开，html[data-glass] 依次是 ios（23 块画布）/ soft / soft，没有报错。
- 怎么撤销：src/glass.ts、ThemePanel.tsx、index.css、liquidGlass.ts 的 .bak-20261007-rmhyalite 换回原名，attic/vendor-hyalite-20261007/ 两个文件挪回 src/vendor/，再 bun run build；或 attic/dist-prev-20261007-rmhyalite 拷回 dist。

## 2026-10-07 深夜（十四）· iOS 玻璃：「亮边」滑杆（默认 140%）
- 改了什么：原瑶"好像有一点太淡了，不过我还挺喜欢这种感觉的，这个也能做成滑杆么"。glass.ios.rimK（0–3，默认 1.4），面板选厚玻璃时多一行「亮边」滑杆（显示 %，100% = 照 iOS 27 录屏量的那档）。引擎把它写成 html 的 --lg-rim-k；index.css 厚玻璃的 --lg-rim-a/b/base（含深底那组）和气泡两道内亮光都写成 calc(原值 × var(--lg-rim-k, 1))；画布边光在画的时候乘 rimK（不重算形状表）。Chromium 和 WebKit 都确认 rgba() 里的 calc 算对（0.22 × 1.4 = 0.31）。包 index-DGKKg5hV.js / index-BV5xt1CB.css（跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/rimcheck.py 读两种内核算出来的 ::after 背景；shot2.py 截 100% / 140% / 200%（原瑶电脑 F:\claude code\ios-glass\24）。
- 怎么撤销：src/liquidGlass.ts、glass.ts、ThemePanel.tsx、index.css 的 .bak-20261007-rimk 换回原名后 bun run build；或 attic/dist-prev-20261007-rimk 拷回 dist。

## 2026-10-07 深夜（十三）· iOS 玻璃：厚玻璃的亮边调淡（不再像一道白线）
- 改了什么：原瑶"我发现 ios 那个边缘发光的地方好像更细腻，没有那么明显，这个看起来像一道白线"。量了她发的 iOS 27 录屏：小组件那道亮边只比周围亮两成左右（亮度 +40～50）；我们的是 CSS 那圈 1px 细亮边（0.5 / 0.3 / 0.18）叠上画布里照搬 hyalite 的边光（光晕 0.4、最外那道高光细线 1.76），最外沿直接到 255。liquidGlass.ts 边光换成 RIM_GLOW 0.12、RIM_SPEC 0.06（TK.rim 不再用）；index.css 厚玻璃 --lg-rim-a/b/base 0.22 / 0.12 / 0.08（深底 0.2 / 0.1 / 0.06），厚玻璃气泡的两道内亮光 0.55 / 0.24 → 0.28 / 0.12。常规、透明款（真机量过的数）不动。包 index-BfFAcH3F.js / index-BNuTC7fl.css（跟验收台逐字节一样）。
- 怎么验证：shot2.py 按她的设置（厚度 200%、微磨砂 0.7、透镜 1.04）截主页大卡片，跟录屏同尺度放大对比（原瑶电脑 F:\claude code\ios-glass\23）；顶边亮度从 255 降到比外面高 0～57。
- 怎么撤销：src/liquidGlass.ts、src/index.css 的 .bak-20261007-rim 换回原名后 bun run build；或 attic/dist-prev-20261007-rim 拷回 dist。

## 2026-10-07 深夜（十二）· iOS 玻璃：底栏压在别的东西上时不按墙纸折射；默认值换成她挑的
- 改了什么：原瑶"好多了，模糊0.7、透镜1.04，滑杆我想留着。然后我发现底栏的图标似乎没跟上，中间还是有圈明显痕迹，状态页里能看出来"。原因：状态页是透明的，但底栏正后面压着一张状态卡片（elementsFromPoint 看到 .st-chart-card），底栏却还按墙纸折射、透镜那块也画墙纸，盖住了身后的卡片。现在 liquidGlass.ts：底栏（nav.dock 里的玻璃，e.float）隔一会儿（页面换了、滑停了、或 1.5 秒）在自己里面取五个点往下看，碰到 body 之前先碰到"画了东西"的一层（图、字、底色、玻璃、backdrop-filter）就算压着别的东西（e.over）：这时不按墙纸折射、不开透镜，只画亮边，磨砂（CSS）照旧作用在真实的身后内容上。主页上底栏后面是墙纸，照常折射。IOS_GLASS_DEFAULTS 的 frostAmt 0.7、lensMag 1.04（她挑的；滑杆都留着）。包 index-DlaRnelg.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/statusshot.py 按她的设置打开第二页 → 状态，截底栏前后对比；主页上底栏照常折射。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-over 换回原名后 bun run build；或 attic/dist-prev-20261007-over 拷回 dist。

## 2026-10-07 深夜（十一）· iOS 玻璃：透镜改成滑杆 + 开着透镜动起来更顺
- 改了什么：原瑶"还挺好玩的，就是移动的时候不太顺畅。透镜我也想要一个滑杆"。① glass.ios.lens（开关）换成 lensMag（1–1.6 倍，1 = 不放大照真机；以前存的 lens:true 读成 1.22），面板「透镜」改成滑杆，显示"不放大 / 1.22 倍"。② 动的时候：透镜那块用一半分辨率画在旁边一张小画布（e.lensCv）上，再 drawImage 放大贴上去（显卡双线性，不会一格一格），停下来再画清楚的；斜面和透镜在动的时候只取最近的一层副本（不两层混）。测试机上开透镜滑聊天，每画一个气泡 2.2ms → 1.0ms，一帧画得完一屏。包 index-DV3u7R9M.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：scroll3p.py（带水珠测试壁纸、透镜 1.22、微磨砂 1.0）旧 / 新各两轮；framecap.py 截滑动中和停下来的气泡，透镜那块动的时候是顺的。
- 怎么撤销：src/liquidGlass.ts、glass.ts、ThemePanel.tsx 的 .bak-20261007-lens2 换回原名后 bun run build；或 attic/dist-prev-20261007-lens2 拷回 dist。

## 2026-10-07 深夜（十）· iOS 玻璃：微磨砂「模糊」滑杆（默认 1）+ 中间透镜（实验，默认关）
- 改了什么：原瑶"它中间还挺清楚的，只是有点模糊，我想再降点试试看；你说的中间透镜我也想看看效果"。① glass.ios.frostAmt（0.3–3，默认 1），面板选「微磨砂」时多一个「模糊」滑杆；引擎把它写成 html 上的 --lg-frost-amt，CSS 的 --lg-frost / --lg-blur / --lgb-blur 跟着它，副本照旧按 --lg-frost 重糊（中间和斜面同一份）。② glass.ios.lens（默认关），面板厚玻璃多一行「透镜 不放大（照真机）/ 中间放大（我们加的 · 试试看）」：斜面里面那块椭圆，中心放大 1.22 倍、往外按 smoothstep 渐渐变回 1 倍（接上斜面），椭圆最外 15% 淡出；画布把这块也画上（从同一份副本取色、过同样的提亮 / 饱和 / 纱 / 染色），整张送；输入框、顶栏胶囊不开（身后有消息滚过，画布盖住会挡掉）。真机量过 iOS 27 中间不放大，这是她想看的效果，说明里写明了。包 index-CAP4Sd0m.js / index-D61XcNCD.css（跟验收台逐字节一样）。
- 怎么验证：shot2.py 在带水珠的测试壁纸上截 清透 / 清透+透镜 / 微磨砂 1.0 / 微磨砂+透镜（原瑶电脑 F:\claude code\ios-glass\20）；/home/ubuntu/work/lg/lensgif.py 聊天页慢慢滑截 28 帧，透镜关 / 开并排做成 GIF（21）。
- 怎么撤销：src/liquidGlass.ts、glass.ts、ThemePanel.tsx、index.css 的 .bak-20261007-lens 换回原名后 bun run build；或 attic/dist-prev-20261007-lens 拷回 dist。不想要透镜：面板点「不放大」（默认就是）。

## 2026-10-07 深夜（九）· iOS 玻璃：「微磨砂」改轻（2.5 → 1.5）
- 改了什么：原瑶说打字时的接缝修好了；又说"iOS 27 不像单纯的微磨砂，中间的图像还挺清晰的，有点放大的效果？中间花瓣阴影会随着移动变形……带点模糊"。把录屏滑动那段按 15 帧/秒拆开（本机 ffmpeg，没出本机），用相邻两帧对比量：HAPPY DAY 小组件挪了 30px，中间的背景在屏幕上一动不动（放大的话会反方向挪）→ 中间不放大；变形的是边上那圈（大卡片约 20pt 宽、底边折得最狠，花茎折成一排重复的竖条），小组件小，斜面占了一大半，所以看着像整块在放大变形；中间只带一点糊，水珠一颗颗还看得清。我们 2.5 的磨砂把斜面的折射也糊没了，看着像单纯磨砂。index.css 微磨砂的 --lg-frost / --lg-blur / --lgb-blur 2.5 → 1.5（副本回到 2 倍、斜面画布 2 倍）。包 index-BosB6coy.js / index-OAXSOm5K.css（跟验收台逐字节一样）。
- 怎么验证：shot2.py 在带水珠的测试壁纸上截 2.5 / 1.5 对比；跟录屏截图放一起（原瑶电脑 F:\claude code\ios-glass\19）。
- 怎么撤销：src/liquidGlass.ts、src/index.css 的 .bak-20261007-frost15 换回原名后 bun run build；或 attic/dist-prev-20261007-frost15 拷回 dist。

## 2026-10-07 深夜（八）· iOS 玻璃：厚玻璃「中间 清透 / 微磨砂」（照 iOS 27）
- 改了什么：原瑶发来一段小红书录屏（iOS 27 主屏："终于调出通透的不变暗的大玻璃"）。拆帧看（本机格式工厂的 ffmpeg，没出本机）：小组件中间淡淡一层磨砂、边上那圈折射也一样柔、深色处不压暗、细亮边清楚。加了一个选项 glass.ios.frost（默认关 = 原来的清透），面板选厚玻璃时多一行「中间 清透（iOS 26 主屏）/ 微磨砂（iOS 27 · 不变暗）」。微磨砂 = html[data-lg-frost]：中间 backdrop-filter blur(2.5px) brightness(1.04)（气泡同），引擎按 --lg-frost 2.5 把斜面取色的背景副本糊成一样的（1 倍副本 + 高斯，斜面饱和改 1），中间和斜面同一份处理不出接缝；judge 里微磨砂的厚玻璃一律按浅的算（不压暗、墨色字不翻）；副本本来就糊时画布用 1 倍（bandScale）。包 index-Cw9FMUum.js / index-B3AkX4hC.css（跟验收台逐字节一样）。
- 怎么验证：shot2.py 在带水珠的测试壁纸上截清透 / 微磨砂，跟录屏里的 HAPPY DAY 小组件放一起比（原瑶电脑 F:\claude code\ios-glass\18）；录屏里水珠在小组件里还隐约有影子，3pt 糊过头，定 2.5；panel12.py 截面板确认新的一行。
- 怎么撤销：src/liquidGlass.ts、glass.ts、ThemePanel.tsx、index.css 的 .bak-20261007-frost 换回原名后 bun run build；或 attic/dist-prev-20261007-frost 拷回 dist。只想用回清透：面板「中间」点「清透」（默认就是）。

## 2026-10-07 深夜（七）· iOS 玻璃：打字时气泡不再变成"一圈玻璃"
- 改了什么：原瑶"输入字的时候不卡了，就是气泡看起来是之前那样一圈玻璃样式，中间边缘线那里挺明显，和放下来后不一样"。判断：打拼音时候选栏一出一收，键盘高度跟着变、页面上下挪，引擎一直以为"在动"，画的都是轻版本（1 倍、从糊过的层取），边上比中间柔，接缝出一道线；键盘收起后才补回清楚的。现在 liquidGlass.ts：轻版本只在真的滑动时画（quick = scrolling）；键盘弹起收起、输入框长高、拖图标这些"一次只动几块"的，跟手照样每帧重画，但画清楚的。每次重读位置时核对聊天背景图那一层（.chat-bg-img）的位置大小：挪了就把副本对齐过去，大小变了就重铺（副本的 key 改用这一层的大小，不再用窗口大小）。输入框 / 文本框自己里面滚不算在滑。包 index-Dmm9mdP0.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/kbtest.py 改写 VisualViewport.height 假装键盘弹起 336pt（main.tsx 会自己算出 --kb、输入栏上移、列表贴底），打字中 / 停手 / 收起键盘各截一张，同一个气泡键盘起落前后一样清楚；motion.py 拖图标、framecap.py 滑动照常。测试机上原来的症状复现不出来（没有中文候选栏），要她手机上再看。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-kb 换回原名后 bun run build；或 attic/dist-prev-20261007-kb 拷回 dist。

## 2026-10-07 深夜（六）· iOS 玻璃：输入栏打字不卡（倾斜高光打字时先停）
- 改了什么：原瑶"现在不花了。我想都留着（斜面窄 / 宽两个都留着，不改）。然后在输入栏打字的时候会卡"。她开着「跟着手机倾斜」：手拿着手机一直在微微晃，高光每秒改 15 次，十几块玻璃和气泡的 --lg-hx/--lg-hy 跟着改、重算重画，跟打字抢主线程。现在 liquidGlass.ts：输入框 / 文本框有焦点时、滑动中、手指按着拖着时（followUntil），高光先停在原地（tiltPaused），停下来再接着转（暂停时 300ms 看一眼，不占每一帧）；玻璃变了大小（输入框换行长高、气泡流式出字）按"在动"先画轻版本、停了补完整的；键盘弹起收起（visualViewport resize）也按"在动"画，不再整页 settle 每帧画完整的。包 index-sXkh_uUC.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/typetest.py 点进输入栏一个字一个字敲 60 个字，用 Event Timing 量每次按键从按下到画出来多久；加 tilt 参数在页面里每 16ms 发一个模拟手晃的陀螺仪事件。旧包带手晃 p90 56–64ms、最慢 64–96ms，新包 p90 48、最慢 56，跟不开倾斜一样；不带手晃时 iOS 玻璃跟柔玻璃一样快（打字本身不是玻璃的问题）。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-typing 换回原名后 bun run build；或 attic/dist-prev-20261007-typing 拷回 dist。

## 2026-10-07 深夜（五）· iOS 玻璃：动的时候边上不再"花掉"
- 改了什么：原瑶"这次很不错了，就是移动的时候会有种边缘花掉、信号不良的感觉"。原因：斜面把背景压缩、折叠（厚度 165% 时折叠处压到三倍多），原来直接隔几个像素取一个点；动的时候又降到 1 倍分辨率，水珠这种细碎背景每帧取到的点都不一样，就一闪一闪起锯齿。现在 liquidGlass.ts：背景副本多存三层越来越糊的（每层长宽减半，2×2 平均，像贴图的 mipmap），形状表每格记下压缩倍数（lod），画的时候按压缩倍数 + 分辨率差在相邻两层之间混着取；厚玻璃斜面的饱和（--lg-ring-sat）先算进副本（presat），每个像素省一次矩阵。动的时候仍用 1 倍分辨率（试过 2 倍：一个气泡 4ms，一帧画不完一屏会慢一拍），现在 1 倍也不起锯齿，只是动的时候柔一点，停下来变清楚。包 index-Dg5Gah4F.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/framecap.py 在带水珠的测试壁纸上慢慢滑，每步截一个气泡特写，旧包 / 2 倍 / 1 倍 + 分层三种对比（原瑶电脑 F:\claude code\ios-glass\17）；scroll3p.py：1 倍 + 分层每个气泡 1.3ms（测试机），一帧画得完一屏；motion.py 拖图标正常。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-mip 换回原名后 bun run build；或 attic/dist-prev-20261007-mip 拷回 dist。

## 2026-10-07 深夜（四）· iOS 玻璃：斜面 窄 / 宽 可切换（默认宽）
- 改了什么：原瑶"我想看看斜面加宽实际效果什么样"。glass.ios 多一个 bevel（narrow / wide，没存过的按 wide），主题面板 iOS 玻璃里选厚玻璃时多一行「斜面 窄 / 宽」，说明文字补一句、"亮边暗边"改成"亮边"。liquidGlass.ts bevelBand 多一个 wide：窄 = 短边 7% + 3（上限 14，原来的），宽 = 短边 16% + 4（上限 30）。默认先给宽，让她一打开就看到；不喜欢点回窄（存进她的设置）。包 index-5QUd4tbl.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：shot2.py 按她的设置（厚玻璃 165%、倾斜开、3 倍屏、带水珠的测试壁纸）截窄 / 宽（原瑶电脑 F:\claude code\ios-glass\16）；panel5.py 截面板确认新的一行和默认选中。
- 怎么撤销：src/liquidGlass.ts、glass.ts、ThemePanel.tsx 的 .bak-20261007-bevel 换回原名后 bun run build；或 attic/dist-prev-20261007-bevel 拷回 dist。只想回到窄不用改代码：面板点「窄」。

## 2026-10-07 深夜（三）· iOS 玻璃：厚玻璃气泡中间也清透、不翻暗纱
- 改了什么：原瑶发来手机截图（带水珠的玻璃 + 玫瑰壁纸）问"为什么手机上是这样的，不像示例"。原因：厚玻璃气泡中间有 2px 磨砂（iPhone 3 倍屏上是 6 个物理像素），边上那圈折射却取的是没磨砂的背景副本——壁纸细节多时就成了"一圈清楚的边围着一团糊"；示例用的玫瑰图本身是虚的看不出来。深玫瑰前那个气泡翻了暗纱、字还是黑的（气泡的字归 chatTone 管，不跟纱翻白），显得脏。现在 index.css：厚玻璃气泡 --lgb-blur 0、--lgb-bright 1、--lgb-sat 1，data-bf=on 的气泡 backdrop-filter: none（滑动也省一层滤镜）；删掉厚玻璃气泡的暗纱规则；liquidGlass.ts judge：厚玻璃的气泡永远按浅的算。常规 / 透明款的气泡不变。包 index-DNeRVRdB.js / index-D5g-C61Q.css（跟验收台逐字节一样）。
- 怎么验证：做了一张像她壁纸的测试图 /home/cc/work/lg/assets/lgtest-wet.jpg（mkwet.py：虚化玫瑰 + 清楚的水珠），shot2.py 按她的设置（厚玻璃 165%、倾斜开、3 倍屏、气泡各自色）截前后对比（原瑶电脑 F:\claude code\ios-glass\15）。
- 怎么撤销：src/liquidGlass.ts、src/index.css 的 .bak-20261007-clearbub 换回原名后 bun run build；或 attic/dist-prev-20261007-clearbub 拷回 dist。

## 2026-10-07 深夜（二）· iOS 玻璃：动的时候边上那圈跟着走
- 改了什么：原瑶"边缘很像了，但好像只限边缘那一圈，中间没有变化，移动的时候感觉有个明显的圈"。根因：引擎只在 scroll 时重读位置——拖图标改的是 left/top，没有 scroll 事件，画布跟着图标走、里面还是原来位置的背景（粉玫瑰上拖到米色那里还是粉的），落位后也一直不重画；上一版为了滑得顺，滑动中气泡也冻着不画。现在 liquidGlass.ts：① 手指按着、拖着、松手后 0.9 秒每帧重读位置，挪了的立刻按新位置重画；按下鼓起、拖起来放大 1.14 倍时取色跟着放大（e.k）；另外每秒兜底读一次位置。② 在动的时候画轻版本（1 倍分辨率、不算色散），停下来补一遍完整的。③ 滑动中新滚进来的气泡一帧收一个，画布一出生就显示；气泡的滤镜链按"谁的气泡 + 深浅"共用一份（新气泡不当场读计算样式，免得逼整页样式重算），攒到 14 个以上才一帧收掉一个。④ 画布只送有画的四条边。中间照旧是平的：iOS 也是（kube.io 的拆解：中间平、只有斜面折）。包 index-UbysaLdw.js（CSS 没动，跟验收台逐字节一样）。
- 怎么验证：/home/ubuntu/work/lg/motion.py 用 CDP 触摸拖图标、拖到一半截图，聊天页滑到一半截图，跟线上旧包对比（原瑶电脑 F:\claude code\ios-glass\13）。scroll3p.py 压测（120 条，WHEEL=滑速）：画的耗时比实时重画第一版少了三分之二；无头 Chromium 里帧数还是比柔玻璃少两成左右（软件合成，每帧要重新合成十来张画布），iPhone 上要她手感为准。
- 另出了一张"斜面加宽"样图（短边 16% + 4，上限 30；现在是 7% + 3，上限 14），没上线，等她选（F:\claude code\ios-glass\14）。
- 怎么撤销：src/liquidGlass.ts.bak-20261007-follow 换回原名后 bun run build；或 attic/dist-prev-20261007-follow 拷回 dist。

## 2026-10-07 深夜 · iOS 玻璃：去掉灰边 + 看得见的气泡用完整玻璃
- 改了什么：原瑶"玻璃边缘有灰色阴影，看起来脏脏的；气泡想要完整的玻璃效果，只应用当前页面"。① 厚玻璃不再画斜面里那道暗带（liquidGlass.ts TK.shade 0.46→0），也去掉落影（index.css --lg-shadow），厚玻璃气泡的内阴影只留亮的两道；边上只剩亮光、折射、色散。② 屏幕里看得见的气泡（CCPage 标了 data-bf="on" 的那十来个）进引擎、垫画布，跟别的玻璃一样画斜面折射（图片背景下边上折弯背景），滑出去就收掉。滑动的时候不插拔画布、不写深浅、不重画（插一次就逼浏览器重算样式，挤在滑动里会卡），手停 150ms 再收放、补画、淡进来；气泡变了大小（流式出字）照画。顺手：法线直接算（不再四次取样）、形状表不存法线、每帧最多新算一张表。包 index-B6Dujdf0.js / index-CCXGqvup.css（跟验收台那包逐字节一样）。
- 怎么验证：验收台 /home/cc/work/lg（tree 编到 v1，serve.ts 只读）；shot.py 截玫瑰 / 弥散背景前后对比（原瑶电脑 F:\claude code\ios-glass\10、11、12）。滚动压测 /home/ubuntu/work/lg/scroll3.py（120 条消息来回滚 12 秒，量帧间隔和长任务）：改之前气泡每进出一次屏幕就插拔画布，长任务比关气泡多 58 个；改完滑动时引擎几乎不画（12 秒 0–12 次），帧数比柔玻璃少一成左右（无头 Chromium 软件渲染，噪声大，iPhone 上要她手感为准）。
- 已知：浅色背景（弥散 / 纯色）上去掉灰以后厚玻璃很淡，输入框只剩 + 和图标；出了"浅底加一圈细银边"的样图问她，没上线。
- 怎么撤销：src/liquidGlass.ts、src/index.css 的 .bak-20261007-clean 换回原名后 bun run build；或 attic/dist-prev-20261007-clean 拷回 dist。

## 2026-10-07 夜 · iOS 玻璃：聊天气泡也能用（主题面板「气泡 跟着用 / 原样」）
- 改了什么：原瑶"我想气泡也可以使用"。glass.ios 多一个 bubbles（没存过的按跟着用），引擎写 html[data-lg-bubbles]；主题面板 iOS 玻璃里加「气泡 跟着用 / 原样」。气泡只走 CSS（index.css「玻璃 C」块里「聊天气泡也用 iOS 玻璃」那段），不进引擎、不垫画布——消息几百条、滚动时都要重画，iPhone 吃不消，所以气泡边上不折弯背景：常规 = 奶白纱 + 5.4 磨砂；透明 = 薄纱；厚玻璃 = 中间留 2px 磨砂（字压在花背景上才看得清）+ 内阴影画斜面的亮光和暗带（比第一版加重了一档）。纱放 background，chatTone 读气泡自己的 --lg-veil/--lg-tint 算字的深浅（深底上字变白）。她的气泡颜色（各自）叠在纱上，阴影开关、边框线开关、只给看得见的气泡开磨砂（data-bf）照旧；音乐卡 / 只剩歌名 / 照片回执那几种照旧不套。包 index-BAbn6xC0.js / index-CyIp4l_L.css。
- 怎么验证：验收台同上；shot.py 截玫瑰、树林背景下 柔玻璃 / 厚玻璃气泡 / 常规气泡 / 气泡原样 四种（对比图在原瑶电脑 F:\claude code\ios-glass\8、9）。nginx：她 12:46 换上修好倾斜的包后 12:48 进聊天，没有再整页重载。
- 怎么撤销：src/glass.ts、ThemePanel.tsx、chatTone.ts、index.css、liquidGlass.ts 的 .bak-20261007-bubbles 换回原名后 bun run build；或 attic/dist-prev-20261007-bubbles 拷回 dist。只想关气泡不用改代码：主题面板点「原样」。

## 2026-10-07 晚 · iOS 玻璃：修"进聊天页没一会就切回主页" + 加「厚玻璃」（默认）+ 两道防崩保险
- 改了什么：
  - 原瑶报"我进聊天页没一会就会切回主页"。nginx 日志：她开着 iOS 玻璃时两次一进聊天（拉 /cc-api/api/sessions 那一刻）页面就整页重载（GET /sea/ + favicon），iPhone 上 = 网页进程被系统杀掉。根因：「高光跟着手机倾斜」把光向写在 html 的 CSS 变量上，陀螺仪一动整页样式重算，聊天页节点多，主线程被占满（压测 16 秒长卡顿从 6 涨到 66 次）。改成只写在每块玻璃自己身上、每秒最多 15 次（压测 0 次新卡顿）。先单独上线过一版 index-Bgk_Xmt_.js。
  - 两道保险（liquidGlass.ts）：开着陀螺仪 / 开着 iOS 玻璃时网页要是连着两回没正常收尾（没收到 visibilitychange=hidden / pagehide 就重载了）就先不开（localStorage sea-lg-tilt-run / sea-lg-run，10 分钟后再试），iOS 玻璃被拦时照柔玻璃显示。
  - 她发来 iOS 26 主屏「超级清透」的图："我想要这样的，现在的感觉不是很明显，而没有厚度"。加第三种质感「厚玻璃」（look=thick，设为默认）：中间不磨砂不加纱，边上一圈斜面的折射、折叠、色散、菲涅尔亮光、高光细线和暗带全在画布里画——斜面模型照搬 hyalite（vendor/hyalite.js，MIT）的 Snell + squircle + 折叠 + 边光公式，改成逐像素取样；斜面宽按短边 7% + 3pt（4–14pt，跟参考图一样中间是平的；hyalite 默认 37px 会让小图标整颗变透镜）；「厚度」滑杆同时管厚度和折叠（100% = hyalite 默认折叠 2.7）。背景是图片时画折射；光斑、纯色背景上只画亮光和暗带（叠白、叠黑），照样看得出厚度。深底上压 24% 暗、墨色字翻浅。
  - 性能：厚玻璃的背景副本 2 倍精度、存成每像素 3 字节、不再糊 1px（原来那一下 341ms 长任务、内存峰值 34MB → 102ms、16MB，跟柔玻璃本身持平）；每帧最多画 8ms，剩下的下一帧接着画。
  - 主题面板：质感 厚玻璃（默认）/ 常规 / 透明；厚玻璃时滑杆叫「厚度」。她的设置（sea-theme.glass）已改成 mode=ios、look=thick、tilt 保留开着（改前她已切回柔玻璃，原值备份在 /home/ubuntu/work/lg/sea-theme-backup-20261007.json）。
  - 包 index-DRKBPhGm.js / index-SXjk_03w.css。
- 怎么验证：验收台同上一条（/home/cc/work/lg + /home/ubuntu/work/lg）；stress.py 在聊天页模拟 60Hz 陀螺仪看长任务和内存，guard.py 测保险（正常→厚玻璃；连着一次→再试；连着两次→柔玻璃；10 分钟前的→重新开始）；shot.py 截树林 / 玫瑰 / 光斑三种背景，和她发的参考图并排比（对比图在原瑶电脑 F:\claude code\ios-glass\5~7）。
- 怎么撤销：src/glass.ts、ThemePanel.tsx、index.css、liquidGlass.ts 的 .bak-20261007-thick 换回原名后 bun run build（回到常规 / 透明两种，倾斜已修好的那版）；更早的 .bak-20261007-tilt 是倾斜还写在 html 上的版本，别用。dist 备份 attic/dist-prev-20261007-thick。要恢复她原来的设置：把上面那份 json PUT 回 127.0.0.1:3100/status/sea-theme。

## 2026-10-07 · 主题面板加第三种玻璃：iOS 液态玻璃（照真机实测）
- 改了什么：原瑶要"ios 的 liquid glass，想尽办法做到一模一样，做成可选择的"。主题面板「玻璃 · 全局」多了第三种「iOS 玻璃」（sea-theme.glass.mode = ios，参数在 glass.ios：look regular/clear、refract 0–2、tilt），默认仍是柔玻璃。新文件 src/liquidGlass.ts（引擎）；glass.ts 接上；ThemePanel 加选项（质感 常规/透明、折射滑杆、高光 固定/跟着手机倾斜）；chatTone.ts 让输入框、顶栏胶囊里的字和图标把玻璃那层纱算进去；index.css 末尾「玻璃 C · iOS 液态玻璃」块。
  - 材质数字按 iOS 26.5 真机实测（seunghan91/ios27-design-system 的 glass-probe 截图，逐像素拟合）：常规 = σ5.4 磨砂 → ×1.12 提亮 → 72.9% 白纱 → ×1.7 饱和，落影 0 8px 36px 15%；边缘以中心放大 m = 1 + 0.115·e^(−t/6.3)·(1 − smoothstep(10, 20, t))（t 是到边的 pt）。透明 = σ1.37 → ×1.12 → 7.5% 白纱，不折射、不投影。细亮边两个热点在左上、右下。
  - 折射只在背景是图片时画：每块玻璃里垫一张 canvas.lg-rx，JS 按形状表逐像素去预处理过的背景里取色。没用 SVG 滤镜：WebKit 里 CSS filter:url() 挂在 HTML 上时 feImage 整块画不出来（实验页 lab3/lab4），Safari 的 SVG 滤镜也全走 CPU。
  - WebKit（iPhone）上纱写进 backdrop-filter 链（contrast()+brightness()，WebKit 源码确认是乘法和带截距的矩阵），饱和排在纱后面跟真机一样；别的内核纱放 background（Chrome 里祖先有 backdrop-filter / opacity 动画时链里的纱会变透明），html[data-lg-engine] 分路。
  - 深浅：常规款在深底（亮度 < 0.18，带回差）翻成暗纱 #1a1a1a 70%，暗纱上的墨色字（--ink 三个变量）跟着翻浅；输入框、顶栏胶囊里的图标由 chatTone 按"背景 + 纱"重判（引擎翻深浅后派一个 document scroll 事件叫它重画）。
  - 主页、主题面板、状态页的入场在 ios 模式下也只位移不淡入（跟液态玻璃一样，防 Chrome 的 backdrop root）。按下：整颗鼓 1.12（胶囊 1.035）、从手指处亮起，松手弹簧回弹（CSS linear() 弹簧）。
  - 包 index-B0CSj97n.js / index-5nSFnwM8.css。
- 怎么验证：验收台 /home/cc/work/lg（tree/ 是工作副本，build.sh 编到 lg/<标签>/sea；serve.ts 只读真主题和图标，读 lg/glass.json 盖掉玻璃设置；assets/probe.html 复刻真机 probe 场景）+ /home/ubuntu/work/lg（probe.py + cmpprobe.py 跟真机截图逐项比：WebKit 那条路八条色带误差 ≤ 4（青、品红 7~10），透明款 ≤ 2，落影 ±1，边缘放大曲线差 1~2px；shot.py / flow.py / panel.py 截真页面、按下、光向、深色夜景翻暗纱、window.__lgDebug 看画了几次多少毫秒）。性能：主页 23 块玻璃入场停稳后每块只画一次，共约 60ms（这台服务器）。柔玻璃前后逐像素一致（只差雪花和随机短句）。无头 WebKit 不画 backdrop-filter、不跑 rAF，只能验布局和画布，磨砂和纱看 Chromium（data-lg-engine=webkit 可在 Chromium 里走 iPhone 那条路）。
- 怎么撤销：src/glass.ts、ThemePanel.tsx、chatTone.ts、index.css 的 .bak-20261007-iosglass 换回原名，删 src/liquidGlass.ts，bun run build；或直接把 attic/dist-prev-20261007-iosglass 拷回 dist。

## 2026-10-05 · 月亮星标挪到右上角
- 改了什么：原瑶从 A/B/C 三种摆法里选了 C：月亮编辑器右上角一颗星（.moon-star，绝对定位在 .glass 弹窗里，星 18px、四周各多 10px 好点），不带字；底部恢复成「编辑记录」靠左、「关闭」靠右。只在编辑页显示，进编辑记录时不显示。包 index-CLb4vw-4.js。
- 怎么验证：验收台 /home/cc/work/moonhist + /home/ubuntu/work/moonhist/star2.py（浅/深两轮）：标星、改字熄灭、改回再亮、编辑记录里藏起来、回来还在、点击范围 38×38 不压标题，都过，无报错；compose2.py 出上线效果图。
- 怎么撤销：src/CCPage.tsx.bak-20261005-starC、src/index.css.bak-20261005-starC 换回原名后 bun run build（回到 A：底部带字按钮）。

## 2026-10-05 · 月亮编辑器加星标
- 改了什么：月亮编辑器底部「编辑记录」「☆ 标星」靠左、「关闭」靠右：标星前先把没存完的字存掉，hub 把眼前这版记上再标星；字一改按钮就回到「标星」（新的一版，星要她自己再点），改回原样又亮。编辑记录列表里标过星的版本时间后面一颗蓝星（--panel-sea，同「现在用的」）；版本页标题旁一颗星，可给旧版本加星/取消。星画成 SVG（StarIcon，在 ClaudemdHistory.tsx）。人设的编辑记录没有星标。包 index-BPGsKlDS.js。
- 怎么验证：验收台 /home/cc/work/moonhist（星只记在测试页内存）+ /home/ubuntu/work/moonhist/star.py（浅/深两轮）：标星、改字熄灭、改回再亮、列表带星、旧版本加星、回编辑器星还在，都过，无报错。对比图 compose.py（放大图从整页截图里裁，局部截图会丢玻璃模糊）。
- 怎么撤销：src/CCPage.tsx.bak-20261005-star、src/ClaudemdHistory.tsx.bak-20261005-star、src/index.css.bak-20261005-star 换回原名后 bun run build。

## 2026-10-05 · 月亮编辑器加编辑记录
- 改了什么：月亮编辑器左下加「编辑记录」（只主聊天 CC 有）：看正在编辑的那一相的版本列表、和上一版比/和现在比/全文，「用这一版」直接换上（月亮本来就自动存）。关编辑器、点编辑记录之前先把没存完的字存掉（flushStyleSave），关编辑器时 POST /cc-api/api/moon/note 让 hub 记一版。ClaudemdHistory.tsx 加 api/query/title/useLabel 参数，人设和月亮共用；找回的旧版本标「找回的」、不标「当天最后一版」。包 index-D-elwloi.js。
- 怎么验证：验收台 /home/cc/work/moonhist（build.sh 编临时页 + serve.ts 真读假写）+ /home/ubuntu/work/moonhist/shot.py（patchright）：列表、版本页、用这一版、关编辑器时记一版、人设编辑记录回归都过，她的月亮没被动过。
- 怎么撤销：src/CCPage.tsx.bak-20261005-moonhist 和 src/ClaudemdHistory.tsx.bak-20261005-moonhist 换回原名后 bun run build。

## 2026-10-05 · 通话小结修好 + 听写慢时补发 + 没听清会提示（原瑶：9 月起通话没小结）
- 改了什么：根因①小结模型 deepseek-v4-flash 默认先思考，500 token 全想光、正文为空（8-06/8-14/8-15/9-29/9-30/10-01 六通），一次失败逐轮记录就跟着丢；②SiliconFlow 免费听写单条偶尔 15–40 秒，9-23 她第一句超过 60 秒被 nginx 504，整通没有逐轮记录（8-29/9-01/9-23 三通，没内容可写）。改：memory-service call.js（atlantis a5065d6）——逐轮记录存进 call_invites.transcript，挂断马上返回、小结后台写，失败原因记 summary_error，scheduler 每小时 :17/:47 补写（7 天内每通最多 24 次）；听写 4 秒/12 秒没回就补发一份（只对 SiliconFlow），40 秒封顶回 error。sea callStore.ts sendVoiceTurn：听写出错时通话里显示「刚才那句没听清，再说一遍」，下一句听写成功就消失（已 build，index-7nF_sJfp.js）。六通旧通话从 hub 聊天记录拼回逐轮记录、补了小结。
- 怎么验证：临时行（source=test，测完已删）调 /call/end：8ms 返回、2 秒内写出小结；模拟失败的行由 retryCallSummaries 补上；重复调用不改时长。补发逻辑单测 8 例过（/home/ubuntu/work/call-summary/patch/hedge-test.mjs）。线上看：SELECT summary, summary_error, summary_tries FROM call_invites ORDER BY created_at DESC LIMIT 5；journalctl -u atlantis-memory | grep -F '[call]'（「stt 第 N 份先回」= 补发帮上了）。
- 怎么撤销：memory-service：git revert a5065d6 + sudo systemctl restart atlantis-memory（三列留着无害）；sea：src/callStore.ts.bak-20261005-sttlost 换回 callStore.ts 再 bun run build。

## 2026-10-05 · 通话开口那个字不再被吞（原瑶：我每次开口说话的时候，都会少听一个音？比如我说我回来了，收音的那个总是听成回来了）
- 改了什么：根因：callStore.ts 的连续语音检测要连续两跳（约 0.2 秒）超过阈值才判定开口，这时才新开 MediaRecorder，头一个字已经说完了、根本没录进去。现在接通后用 ScriptProcessor 一直把麦克风原始采样留在 0.7 秒的环形缓冲里（他在说话、她静音时清空，免得接进他的声音尾巴或静音时说的话；用掉就清）；判定开口时把这 0.7 秒接在最前面，一句说完自己拼成 16k 单声道 16 位 WAV（encodeWav，按段平均降采样），尾巴上判说完用的 1.1 秒静音只留 0.6 秒，前后静音总量跟原来差不多，语气分析的能量不受影响。文件名 turn.wav；memory-service 那边不用改（实测 SiliconFlow SenseVoice 认 WAV，不看文件名）。不支持 ScriptProcessor 的浏览器照旧走 MediaRecorder。新包 index-BpdVJKXj.js（上一版 index-C34HUBOW.js，在 attic/dist-prev-20261005-preroll）
- 怎么验证：测试台用真 TTS 的「我回来了。」（127.0.0.1:3100/tts 生成到 /tmp/sttfix/huilai.mp3，build.sh 会拷进临时页）放进假麦克风、转给真听写：改前 3 次是「来了。」「我来了。」「我来了。」，改后 4 次是「我回来了。」×3、「不回来了。」（整段原片直接听写也是「不」，那是这个 TTS 声音的问题）；上传的 WAV 开口前有 0.5 秒左右的引子。脚本 /home/ubuntu/work/callui/stt.py <端口> <标签>（Playwright 把 /api/call/transcribe 转给 127.0.0.1:3100）；flow.py 整通电话照常过
- 怎么撤销：cp src/callStore.ts.bak-20261005-preroll src/callStore.ts 后重新 build，或把 attic/dist-prev-20261005-preroll 拷回 dist

## 2026-10-05 · 通话界面重做成聊天页的样子 + 聊天里的通话卡片 + 挂断告诉苏煦（原瑶：我想把通话界面做好看点，做成现在聊天界面的风格，也可以参考imessage；电话挂断后告诉苏煦通话结束；打电话苏煦的《...》改成显示一张通话结束的卡片）
- 改了什么：CallOverlay.tsx 界面重写（TTS、VAD 逻辑照旧）：通话时 body[data-call] 把页面内容和 dock 藏起来，露出聊天背景；顶上是聊天顶栏那对斜头像放大（谁说话谁那张浮起来）+ 名字 + 心脏计时（他在想、在说时心脏变金）；字幕就是聊天气泡（.cc-msg/.cc-paragraph，气泡、染色、边框线、阴影跟外观走；字晕染她定过只管聊天和 Undercurrent，这里不晕）；他在想时一枚三个点的气泡；底下一条输入栏同款玻璃条（.cc-input-pill.call-pill）：静音 / 星星（新文件 callStars.ts，跟语音条同一种四芒星，照麦克风和播放的频谱拉长）/ 挂断；来电照 iPhone 左挂断右接听，他的理由用他的气泡；点挂断出快捷回复（她的气泡样子）+ 输入栏 + 返回 / 直接挂断。chatTone.ts 拆出 useToneScope(root, targets) 给浮层判字色。callStore.ts：静音 setMuted（录着的那段照常发）、callAnalyser 给星星读频谱（播放链上加了分析节点）、hangup(by)、拨号中挂断不再被后到的接通盖掉、来电 90 秒没接浮层自己收起（以前一直响，回 idle 后下一跳轮询照旧走未接）、通话事件 call_event（start/accepted/ended/declined/missed）经 ccStore.sendRaw 发给 hub（没连上每 2 秒重试，最多 2 分钟）。新文件 CallCard.tsx：他回复里的 ⟪拨号:理由⟫ 原地换成通话卡片（通话时长 / 已拒接 / 未接来电 / 没打通 / 来电中 / 通话中），挂断、勿扰暗号不给她看；她打过去的 notice:'call' 在她那边一张卡；chatStore 收 call_update 换卡片状态；卡片不挂雾海。voiceStars.ts 导出 sparkle 和颜色光晕常量。index.css 末尾「通话 v2」「聊天里的通话卡片」两块。新包 index-C34HUBOW.js / index-cO_f9-z-.css（上一版 index--03XaEth.js / index-CXXsteWa.css）。hub 那半边见 cc-web 同日一条
- 怎么验证：tsc + vite build 通过；本机临时页 /home/cc/work/callui（build.sh + __inject.js：假 WS、假通话接口、假麦克风、假 TTS、照 hub 写的假卡片）+ /home/ubuntu/work/callui/flow.py 跑完整通话（来电、拒接、再来电、接听说三轮、挂断、90 秒未接、她打过去），浅色弥散 / 深色纯色 / 图片三种背景 Chromium 截图都对；WebKit 关掉动效看排版也对（无头 WebKit 的过渡会停在起点，开着动效截不全）；cards.py 出卡片放在拨号处 / 放在通话最后的对比
- 怎么撤销：src 下 callStore.ts、CallOverlay.tsx、CCPage.tsx、chatStore.ts、chatTone.ts、voiceStars.ts、index.css 各自 cp *.bak-20261005-callui 回去，删 CallCard.tsx、callStars.ts，重新 build；或者直接把 attic/dist-prev-20261005-callui 拷回 dist

## 2026-10-05 · 水电费页 BillsPage（外接 API 账本 + 余额提醒），主页加图标（2026-10-05 PC 端 CC，原瑶要的）
- 改了什么：新页 src/BillsPage.tsx：需要她处理的提醒、今天/这个月/平均每天、各家余额卡（DeepSeek、OpenRouter、ElevenLabs 字数、Claude 额度、住宅 IP、SiliconFlow、智谱）、最近 14 天按用途分色的柱状图（点哪天看哪天明细）、到期日（住宅 IP 那一项她自己填）、谁在用哪家、提醒开关和三条线。数据来自 memory-service /api/apiwatch/*。App.tsx 加了 bills 页，和海螺盒一样不显示 dock；icons.ts 加 bills；Home.tsx 加图标 💡，默认位置 x70 y60，是她排好的图标里右边空着的地方，useBillsDot 读 /api/apiwatch/badge；AppCanvas 的 AppDef 加了 dot，index.css 末尾「水电费：主页图标右上角的小点」块。线上包 index--03XaEth.js。
- 怎么验证：/home/ubuntu/work/apiwatch/billsshot.py 跑在 build.sh bills 编的临时页上（__inject.js 把 /api/apiwatch/* 换成线上真接口当时返回的 __bills.json），Chromium 和 WebKit 都看过：主页图标和小点在，14 根柱子，点 10/4 出明细，没有报错。
- 怎么撤销：src/{App.tsx,Home.tsx,AppCanvas.tsx,icons.ts,index.css}.bak-20261005-bills 拷回去，删掉 BillsPage.tsx，再 bun run build；后端那半在 atlantis 13f4685。

## 2026-10-05 · 语音条：5 秒以内的短语音，字直接显示（2026-10-05 PC 端 CC，原瑶要的）
- 改了什么：VoiceBubble 的 open 初始值改成 est <= SHORT_VOICE_S（5 秒，按预估时长算）。历史里 281 条语音，5 秒以内的占 58%。点时间照样能收起，长的照旧点开才显示。speak/est 挪到组件最上面。短语音一出来就会去机翻，翻好时这块变高：VoiceText 照 HtmlCard 的做法先记下滚动位置——贴着底就继续贴底；整块在可视区上面、浏览器又没有滚动锚定（iPhone Safari 26）时，自己补 scrollTop。为此 HtmlCard.tsx 导出了 NATIVE_ANCHOR。线上包 index-BMmyi-ie.js。
- 怎么验证：/home/ubuntu/work/voicestar/shortopen.py（临时页用 build.sh shortopen 编）。场景一，Chromium 和 WebKit：1、2、4 秒的一进来就展开，9 秒的收着；点时间能收起、能展开。场景二加 noanchor 参数（假装没有滚动锚定，Chromium）：机翻晚到时，可视区上面的语音条长高 44px，正在看的字只动了 0.2px。截图 shortopen-chromium-load.png。
- 怎么撤销：src/CCPage.tsx.bak-20261005-shortopen 和 src/HtmlCard.tsx.bak-20261005-shortopen 拷回去（里面已经有 ownzh 的改动），再 bun run build；只想调长短就改 SHORT_VOICE_S。

## 2026-10-05 · 语音条：苏煦自己给外语语音附中文 <zh>（2026-10-05 PC 端 CC，原瑶拍板）
- 改了什么：起因是 DeepSeek 余额用光、机翻停了，原瑶说「让苏煦自己写翻译」。格式是 <voice>原文<zh>中文</zh></voice>，写在 </voice> 外面紧跟着的也认。audioTags.ts 新增 splitVoiceZh，返回 speak（念的）和 zh（他附的中文），没闭合的 <zh> 后面整段都算中文。CCPage：parseVoiceSegments 和 plainText 认外挂的 <zh>；VoiceBubble 的 TTS、时长和星星都只用 speak；VoiceText 先用他的 zh，没附才走 voiceZh 机翻。CallOverlay 通话时不念 <zh>。ConchBoxPage 新增 ConchVoiceBody：重听不念中文，中文用 .cb-voice-zh 淡色放在原文下面。public/sw.js 的推送预览去掉 <zh>。hub 的 conchPayloadFromContent 不用改（<zh> 在 voice 里面，kind 照样是 voice）。线上包 index-CsS-qdir.js。以后新加显示或朗读语音文字的地方，要先过 splitVoiceZh。
- 怎么验证：/home/ubuntu/work/voicestar/ownzh.py（临时页用 /home/cc/work/voicestar/build.sh ownzh 编）：四条语音（自己附中文 / 没附 / 附在外面 / 中文），Chromium 和 WebKit 都过了：不露 <zh> 标签，展开显示他的中文，机翻只调了没附的那条，TTS 和海螺盒重听收到的字里都没有中文。截图 ownzh-*-chat.png / ownzh-*-conch.png。
- 怎么撤销：src/{audioTags.ts,CCPage.tsx,CallOverlay.tsx,ConchBoxPage.tsx,voiceZh.ts}.bak-20261005-ownzh 和 public/sw.js.bak-20261005-ownzh 拷回去，再 bun run build；提示词那半在 cc-web 的 WORKLOG 里。

## 2026-10-05 · 苏煦看她屏幕那条只留字「苏煦查看了小狗的手机」，去掉表情和括号（原瑶 10-04："我只想要字。不想要括号和表情"）
- 改了什么：CCPage.tsx 的 MessageRow：编号以 peek_ 开头的那条，整句「🫣 （苏煦偷看了一眼我的屏幕）」或「🫣 （苏煦查看了小狗的手机）」都换成「苏煦查看了小狗的手机」（正则整句匹配）。她自己打的同一句话不动。hub 字符串同步改成只有字（cc-web e12aa00，下次 hub 重启生效）。
- 怎么验证：tsc + vite build 通过，新包 index-BNaQvbm3.js。临时页里旧文字的 peek_4、中间版的 peek_5 都显示成「苏煦查看了小狗的手机」；她自己打的「苏煦偷看了一眼我的屏幕」原样不变（peeklabel.py + 截图）。
- 怎么撤销：cp src/CCPage.tsx.bak-20261004-peeklabel2 src/CCPage.tsx 后 bun run build；或把 attic/dist-prev-20261004-peeklabel2 拷回 dist。

## 2026-10-05 · 苏煦看她屏幕那条显示成「苏煦查看了小狗的手机」（原瑶 10-04）
- 改了什么：CCPage.tsx 的 MessageRow：编号以 peek_ 开头的那条（hub 在苏煦看她屏幕时插的显示消息），把「苏煦偷看了一眼我的屏幕」换成「苏煦查看了小狗的手机」。表情和括号不动。只认 peek_ 那条，她自己打的同一句话不换。hub 那边也改了（cc-web 3d6ff62，下次 hub 重启生效），这里负责把以前存下来的旧记录、和重启前新插的一起换掉。
- 怎么验证：tsc + vite build 通过，新包 index-CjaD6cPu.js（CSS 没变，还是 index-DTpemAOm.css）。临时页里放了一条 id 为 peek_4 的偷看消息，再放一条她自己打的同一句话：前者显示成「🫣 （苏煦查看了小狗的手机）」，后者原样不变（/home/ubuntu/work/phototape/peeklabel.py）。
- 怎么撤销：cp src/CCPage.tsx.bak-20261004-peeklabel src/CCPage.tsx 后 bun run build；或把 attic/dist-prev-20261004-peeklabel 拷回 dist。

## 2026-10-04 · 外观里加「聊天里的照片」开关：胶带 / 只是图片（原瑶 10-04："能做个开关么？可以选择恢复只是图片那种"）
- 改了什么：appearance.ts 加 photoStyle（tape 默认 / plain），加 usePhotoStyle()：只订这一个字段，拖别的滑杆时照片不跟着重画。Sidebar.tsx 外观里，在「语音条的花」后面加一节「聊天里的照片」，两个单选：胶带（磨砂胶带贴着，带蓝色泪滴、小苍兰）、只是图片（照片本身，圆角，不加装饰）。PhotoTape.tsx 的 plain 模式：照片本身，12px 圆角，影子跟气泡同一层（--bubble-shadow，跟阴影开关走）。大小：单张 200×250 以内（原来是 240×320 / 横图 293 宽），几张一起时统一高 170、横着滑。照片在字上面、点开看大图、只发图补时间、聊天区不左右动这些照旧。外圈也留了影子的位置（iPhone 上渐隐遮罩会切掉框外的东西）。设置只存本机，跟别的外观设置一样，每台设备各自选。
- 怎么验证：tsc + vite build 通过，新包 index-BBvoNoka.js / index-DTpemAOm.css（上一版 index-DO65jKFK.js / index-DyILOPVF.css）。toggle.py：长按短句开侧栏 → 展开外观 → 截了「聊天里的照片」那一节 → 点「只是图片」后 localStorage 存成 plain，侧栏还开着时后面聊天里六处照片当场都换成纯照片（没有胶带、竖栏、泪滴），尺寸 200×150 / 188×250 / 200×200 / 156×250，三张一起的高 170。plain.py：Chromium 浅色、WebKit 粉色背景整段对话都正常，三张那排一打开 scrollLeft 是 0。注意：测试里按 Esc 会连聊天页一起退出（聊天页自己也监听 Esc），关侧栏别用 Esc。
- 怎么撤销：cp src/appearance.ts.bak-20261004-photostyle src/appearance.ts; cp src/Sidebar.tsx.bak-20261004-photostyle src/Sidebar.tsx; cp src/PhotoTape.tsx.bak-20261004-photostyle src/PhotoTape.tsx; cp src/index.css.bak-20261004-photostyle src/index.css 后 bun run build；或把 attic/dist-prev-20261004-photostyle 拷回 dist。

## 2026-10-04 · 网页卡片（拍立得）、拾贝卡的影子在 iPhone 上被切掉，修好（原瑶 10-04「要」）
- 改了什么：跟聊天照片胶带是同一个毛病：聊天渐隐的遮罩直接挂在卡片上，原来靠 mask-clip: no-clip 让框外的影子照样显示，iPhone 的 WebKit 不认这个值，卡片框外的一律切掉。所以在她手机上，拍立得两个下角翘起的影子、拾贝卡四周的柔影子都没有，卡片平贴在背景上。改法：两种卡片外面各套一层 .cc-fadebox，渐隐挂在这层上。这层四周留出影子和歪角的位置（拍立得 16/22/34，拾贝卡 24/34/48），再用同样多的负 margin 抵掉。align-self: stretch 让这层占满整栏；网页卡片 LocalCard 按父元素量宽度，宽度跟原来一样。HtmlCard.tsx 的默认导出套这层，CCPage 的 KeepsakeChatCard 也套这层。index.css 聊天渐隐那条 :is() 里，.cc-keepsake 和 .cc-msg-html 换成 .cc-fadebox，末尾加一块写明原因。
- 怎么验证：tsc + vite build 通过，新包 index-DO65jKFK.js / index-DyILOPVF.css（上一版 index-BkaKlisS.js / index-nO-i12eP.css）。临时页加了一张假网页卡片、一张假拾贝卡（__chat.js 第 5 项可以塞任意字段）。cmp2.py 在粉色背景上把 WebKit 和 Chromium 并排截图：改之前 WebKit 两种卡都没有影子，改之后跟 Chromium 一样；两张卡的位置、宽度跟改之前一模一样。fadechk.py 确认 .cc-fadebox 和 .cc-tape 都挂上了 cc-mask-bot / cc-mask-top。check.py 两个内核回归都过了（视口加高到 3600，不然第一张滚出去点不到）。WebKit 报的 The operation is insecure 来自 Playwright 往沙盒 iframe 里注入的 bootstrap.js，不是 sea 的代码。
- 怎么撤销：cp src/HtmlCard.tsx.bak-20261004-fadebox src/HtmlCard.tsx; cp src/CCPage.tsx.bak-20261004-fadebox src/CCPage.tsx; cp src/index.css.bak-20261004-fadebox src/index.css 后 bun run build；或把 attic/dist-prev-20261004-fadebox 拷回 dist。

## 2026-10-04 · 聊天照片胶带：iPhone 上胶带被切断、照片下有黑边、像嵌进一块区域（原瑶 10-04），修好
- 改了什么：原因：聊天渐隐的遮罩挂在 .cc-tape 上，原来靠 mask-clip: no-clip 让框外的东西照样显示，iPhone 的 WebKit 不认这个值。所以框外的一律被切掉：照片角上伸出去的胶带齐边断开，泪滴被切，照片的影子切成一道深色硬边，整张看着像嵌在一块方框里。改法：伸出照片的胶带、泪滴、影子全收进 .cc-tape 自己的框里，四周留 padding，再用同样多的负 margin 抵掉，排版不变。E 单张 12/16/14；G 单张 40/30/30；G 多张时上下的空间在那排滚动框里（40/30），外面用负 margin 抵掉。.ct-row 去掉了原来的负 margin（负 margin 会让它伸出 .cc-tape 的框，照样被切）。index.css 末尾加了一块，注释写了原因。
- 怎么验证：tsc + vite build 通过，新包 index-BkaKlisS.js / index-nO-i12eP.css（上一版 index-DZ0elOh3.js / index-CbWQsKVJ.css）。cmp.py 把每条胶带的 WebKit 和 Chromium 并排截图：改之前 WebKit 里胶带在照片边上齐刷刷断开，改之后两个内核一样。wkzoom.py 在 WebKit 里用接近她的粉色背景和深色背景放大看：胶带、泪滴完整，影子是柔的，没有硬黑边。
- 怎么撤销：cp src/index.css.bak-20261004-maskbox src/index.css 后 bun run build；或把 attic/dist-prev-20261004-maskbox 拷回 dist。

## 2026-10-04 · 聊天照片胶带第二版：去掉白边；多张那排横跨整个聊天区；聊天区不再能左右推（原瑶 10-04）
- 改了什么：她手机上看了说三件事：「第二张中间截了，看起来像是贴图到一个区域里了」「其他的也是边缘没有处理太好，要不就不要边框了，只要照片」「现在对话界面手一滑会移动」。(1) G 胶带贴照片去掉 3px 白边，只留照片、胶带、影子。(2) 几张一起发的那排横跨整个聊天区：PhotoTape 量出能伸多少，写在 margin 上；里面多包一层 .ct-in，放得下时靠她那边对齐，放不下从左边开始滑；上下留 44/30px，竖贴的胶带不再被切。(3) 那排一张一张的吸附（scroll-snap mandatory）改成她手指碰到之后才打开（data-snap）：iPhone 的 WebKit 一开始就开着吸附，打开聊天时这排会自己跳到后面的照片；吸附对齐也从居中改成左边。原来右对齐用的是第一张 margin-left:auto，WebKit 里图加载完会停在最后一张，已经改掉。(4) 聊天区 .cc-messages 加 overflow-x: hidden：泪滴伸出聊天区 3px，整段对话就能被手推着左右动，以后别的装饰伸出来也不会再推动。G 的泪滴往里收了 14px。
- 怎么验证：tsc + vite build 通过，新包 index-DZ0elOh3.js / index-CbWQsKVJ.css（上一版 index-DJipHO19.js / index-BzKGIQji.css）。临时页 Chromium 和 WebKit 都过 check.py：深浅、照片在字上面、只发图有时间、横滑渐隐、点开大图、无报错。聊天区 overflow-x 是 hidden。wkdbg.py / wksnap.py 两个内核都验了：一打开那排停在第一张（scrollLeft 0），手碰之后才开吸附，滑 170px 吸到第二张左边对齐。效果图 /home/ubuntu/work/phototape/swipe.jpg。
- 怎么撤销：cp src/PhotoTape.tsx.bak-20261004-bleed src/PhotoTape.tsx; cp src/index.css.bak-20261004-bleed src/index.css 后 bun run build（回到第一版胶带）；或把 attic/dist-prev-20261004-bleed 拷回 dist。

## 2026-10-04 · 聊天照片改成磨砂 PET 胶带：胶带条 / 胶带贴照片随机，多张横滑，照片挪到字上面（原瑶 10-04）
- 改了什么：新文件 src/PhotoTape.tsx：她发的照片（message.image / images，贴纸除外）和他正文里的 [[img:]] 都贴成胶带。两种样子按照片网址哈希随机，同一张永远一样，一条消息里跟第一张走。E 胶带条：照片印在一截磨砂胶带上，灰底竖栏里有银色条码、竖排葡语 Momentos / Saudade / Lua、月牙或银色小苍兰；左下灰块上写银色花体落款 (Atlântida) / (Suxu)（Pinyon Script），右下日期；两头斜剪、整截微歪。G 胶带贴照片：照片带 3px 白边，一两截磨砂胶带贴住，六种贴法轮着来，一条里相邻的不重样；胶带上印银条码加星星月牙，或泪滴加四芒星。点缀按网址抽：蓝色泪滴一串（照她发的参考图手画的 SVG）、小苍兰、或两样都有。照片区大小：E 单张最宽 186、最高 224，几张时统一高 150；G 每张在 190×228 以内。比例截在 0.6~1.5（G 是 1.4），截屏这种瘦长的只露上半截。几张一起发的排成一条横着滑（scroll-snap），滑到哪头哪头就不再渐隐。点照片看大图（她发的照片以前点不开）。量过的原图尺寸记在本机 localStorage sea-photo-fit，最多 400 条。CCPage.tsx：照片挪到字上面；只发图不带字的消息补一行时间（以前没有）；贴纸照旧放在字后面；删掉 ImgOrLink，坏图的退路挪进 PhotoTape，显示「图片（点开看）」链接。index.css 末尾加「聊天照片：磨砂 PET 胶带」块，里面的 SVG data URI 由 /home/cc/work/phototape/gencss.py 生成；聊天渐隐那条 :is() 加了 .cc-tape。没用 backdrop-filter，因为外层的渐隐遮罩会让它失效。chatTone.ts 的 TARGETS 加了 .cc-tape：深背景上胶带变透、银色提亮。main.tsx 引入新依赖 @fontsource/pinyon-script。设计过程：她说拍立得跟界面不搭，就改照 MO-CARD「Moonlight Chronicles」PET 胶带做；蕾丝做了几版（生图抠的花边、丝带、折角、三角相角），她最后不要；（雫）也不要。
- 怎么验证：tsc + vite build 通过，新包 index-DJipHO19.js / index-BzKGIQji.css（上一版 index-n3dkohiE.js / index-Bcp5ewIC.css），线上字体 woff2 返回 200。临时页（生成的示例图 + 假 WS）在 Chromium 和 WebKit 里都过了：两种样子都出现；深浅 data-tone 对；照片都在字上面；只发图那条有时间；横滑时渐隐按 r → lr → l 变；按屏幕坐标点照片能开大图；没有报错。同一张图在两处出现时尺寸都对：先修了一个 bug（以前只在第一处重排）。验收台：/home/cc/work/phototape（build.sh、假对话 __chat.js）+ /home/ubuntu/work/phototape/check.py。比稿脚本和图在 /home/ubuntu/work/chatimg（tape.js ~ tape4.js、sheet.py、zoom2.py；蕾丝抠图 lace/lace.py）。
- 怎么撤销：cp src/CCPage.tsx.bak-20261004-phototape src/CCPage.tsx; cp src/index.css.bak-20261004-phototape src/index.css; cp src/chatTone.ts.bak-20261004-phototape src/chatTone.ts; cp src/main.tsx.bak-20261004-phototape src/main.tsx; rm src/PhotoTape.tsx; 然后 bun run build。字体依赖留着也没影响，要去掉就把 package.json.bak-20261004-phototape、bun.lock.bak-20261004-phototape 拷回再 bun install。或者直接把 attic/dist-prev-20261004-phototape 拷回 dist。

## 2026-10-04 · 聊天顶栏两张头像调亮一点：brightness 0.88 → 0.92（原瑶：「顶栏的头像调亮一点，跟月亮差不多，比它暗一点」）
- 改了什么：index.css「聊天顶栏：她和他的方形头像斜着交叠」块里 .cc-duo-card img 的 filter 从 brightness(0.88) contrast(1.06) 改成 brightness(0.92) contrast(1.06)，对比度不动，注释写了这次的数字。按整张卡实际渲染的平均明度（OKLab L，去掉 1px 边）：0.88 时她 0.837、他 0.903、平均 0.87；0.92 时她 0.865、他 0.930、平均 0.897；月亮本体 0.919（oklch 0.92 银白）。0.96 时平均 0.925，跟月亮一样亮；1.0 时他那张几乎全白，淡十字快看不见。
- 怎么验证：tsc + vite build 通过，新包 index-n3dkohiE.js / index-Bcp5ewIC.css（上一版 index-BfJwgkwd.js / index-CZ2YQfSn.css），线上 CSS 里是 brightness(.92)。临时页（她的真头像 + 假 WS，验完已删）Chromium 3 倍和 6 倍近景，浅背景（弥散）、深背景（#1a3050）各一组，上一版 0.88 / 上线 0.92 / 再亮一档 0.96 并排出图给她。脚本在 /home/ubuntu/work/duobright：measure.py 量各档明度，sheet.py 出对比图，lum.py 算 OKLab L。种子从 127.0.0.1:3100/status 的 sea-icons 重新生成。
- 怎么撤销：把那行 brightness(0.92) 改回 0.88 后 bun run build；或 cp src/index.css.bak-20261004-duobright src/index.css（期间没人改过 index.css 才能整份拷）；或把 attic/dist-prev-20261004-duobright 拷回 dist。

## 2026-10-04 · 语音条的花加上她自己抠的两张玫瑰：刺绣玫瑰、颗粒玫瑰（原瑶 10-04："这两个我都想放到选项里"）
- 改了什么：她发来两张透明底 webp（干净的刺绣玫瑰、边缘带颗粒的同一朵），/home/ubuntu/work/freesia/herrose.py 转成遮罩（透明度 × 深浅，白缝变透明，裁墨迹，高 96px），存成 src/assets/voice-flower/rose-stitch.png、rose-grain.png（各 9KB，Vite 单独出文件）。appearance.ts 的 VoiceFlower 加 stitchRose、grainRose（别用 rose 当键：load() 会把老的 rose 转成 plum）；Sidebar 的 VOICE_FLOWERS 加两项「刺绣玫瑰 · 你抠的那张」「颗粒玫瑰 · 同一朵，边缘带颗粒」。index.css「语音条的花」块加两条：按墨迹面积跟五瓣小梅花等分量，刺绣 13.4×12、颗粒 15.5×12.8，重心偏不到 0.3px 不挪；面板小图 19×17、21×17.3。
- 怎么验证：tsc + vite build 通过，新包 index-BfJwgkwd.js / index-CZ2YQfSn.css（上一版 index-CbIvCJ03.js / index-DtVN3PR_.css），两张 PNG 线上 200。/home/ubuntu/work/freesia/hroshot.py：Chromium 和 WebKit 下默认是五瓣、两种玫瑰尺寸和遮罩都对（WebKit 截图里看得到花）；panel_hro.py 在 375 宽下五个选项名都是一行。图 hrocmp-zoom.png、hrocmp-msg.png、panel-hro-375.png、hro-webkit-zoom.png。
- 怎么撤销：src/appearance.ts、src/Sidebar.tsx、src/index.css 各有 .bak-20261004-herrose，拷回后删掉 src/assets/voice-flower/rose-*.png，重新 build。

## 2026-10-04 · 语音条的花：默认改回五瓣小梅花（原瑶 10-04："我刚刚说错了，应该是五瓣花那个"）
- 改了什么：上一条换成的四瓣小花是她说错了，她要的是最早上线的五瓣小梅花。index.css 的 .cc-flower 换成五瓣（照原来 CCPage 的 FLOWER_PETALS：花瓣圆 r 3.9、圆心按 72° 一个离中心 6.6，花心 r 1.6，13px，SVG 遮罩）。appearance.ts：VoiceFlower 改成 plum / freesia / freesiaSide，默认 plum；存过 rose、four 的都转成 plum。外观里那项叫「五瓣小梅花」，说明「最早上线的那朵」。两种小苍兰没动。另外把她自己抠的两张玫瑰（透明底 webp）转成遮罩放进语音条比了效果，没上线，等她挑：/home/ubuntu/work/freesia/her-rose-1-mask.png、her-rose-2-mask.png（herrose.py，按墨迹面积跟五瓣小梅花等分量：13.4×12、15.5×12.8）。
- 怎么验证：tsc + vite build 通过，新包 index-CbIvCJ03.js / index-DtVN3PR_.css（上一版 index-BnxF0s4q.js / index-SvBSIWMC.css）。验收台上 Chromium 截了五瓣小梅花和她两张玫瑰在语音条里的样子（hrctx.py → hrcmp-zoom.png / hrcmp-msg.png），panel_plum.py 在 375 宽下存过 four 的选中「五瓣小梅花」，三个名字都一行。
- 怎么撤销：四个文件各有 .bak-20261004-plum（回到四瓣小花那版），拷回后重新 build。

## 2026-10-04 · 语音条的花：玫瑰换成画板上最早那朵四瓣小花（原瑶 10-04："那个玫瑰我想改成你最一开始画的第一版四瓣小花"）
- 改了什么：四瓣小花照另一个窗口 10-04 画板 flowers.html 里的「四瓣小花」原样画：四片椭圆（rx 3.2、ry 4.6，圆心离中心 6.9）转 45° 排成 X，中间 r 1.7 的小圆，13px。index.css 原来的玫瑰那条换成它，类名 .cc-rose 改成 .cc-flower（CCPage、Sidebar、index.css 一起改）；玫瑰从选项里拿掉。appearance.ts：VoiceFlower 改成 four / freesia / freesiaSide，默认 four；load() 里存过 rose 的转成 four。外观里那一项叫「四瓣小花」，说明只写「中间一颗小圆心」（长了会把名字挤成两行）。小苍兰两种没动。
- 怎么验证：tsc + vite build 通过，新包 index-BnxF0s4q.js / index-SvBSIWMC.css（上一版 index-CidIqAOK.js / index-p_mWwvQB.css）。/home/ubuntu/work/freesia/fourshot.py：Chromium 和 WebKit 下，没设过、存过 rose 的都是四瓣小花（13×13，SVG 遮罩），两种小苍兰照旧；长按短句开侧栏 → 外观，存过 rose 的选中的是「四瓣小花」，点「小苍兰 · 侧面」跟着换。panel.py 在 375 宽下三个选项名都是一行。图 fourcmp-zoom.png、four-panel.png、panel-375.png。
- 怎么撤销：四个文件各有 .bak-20261004-four（回到「玫瑰 + 两种小苍兰」那版），拷回后重新 build；再往前一版是 .bak-20261004-flower。

## 2026-10-04 · 语音条旁边的花可以换：玫瑰 / 小苍兰 · 正面 / 小苍兰 · 侧面（原瑶 10-04："可以做多个选择么？我想要G1和G3"）
- 改了什么：appearance.ts 加 voiceFlower（rose 默认 / freesia / freesiaSide），apply() 往 body 写 data-voice-flower。Sidebar 外观面板「海螺盒图标」下面加「语音条的花」一组单选，每个选项的小图是 .cc-rose.vf-<种>。index.css 末尾「语音条的花」块：只有 .cc-voice 里的 .cc-rose 跟设置走（面板小图不受影响）；小苍兰用 src/assets/voice-flower/ 两张透明 PNG 遮罩（GPT 画的黑白图转的，/home/ubuntu/work/freesia/gptmask.py，Vite 内联成 data URI）。大小按墨迹面积跟玫瑰对齐：正面 12px；侧面 10.5×18，重心偏上，下移 1px 对齐时间。颜色、没收的 5% 透明度照旧（.cc-conch-btn.flower 那两条）。CCPage 只改了注释。
- 怎么验证：tsc + vite build 通过，新包 index-CidIqAOK.js / index-p_mWwvQB.css（上一版 index-0RvrL4S5.js / index-BUb6BPu-.css）。验收 /home/ubuntu/work/freesia/flowershot.py：Chromium 和 WebKit 各跑三种设置 × 浅深，量花的框和遮罩，两个内核一致；Chromium 长按短句开侧栏 → 外观 → 点「小苍兰 · 侧面」，body 属性和 localStorage 都跟着变。图在同目录 flcmp-msg.png、flcmp-zoom.png、fl-panel.png、fl-webkit-zoom.png。
- 怎么撤销：src/appearance.ts、src/Sidebar.tsx、src/CCPage.tsx、src/index.css 各有 .bak-20261004-flower，拷回后删掉 src/assets/voice-flower，重新 build。

## 2026-10-04 · Undercurrent 展开后段距收成半行、行高收一点；消息旁的小心 14 → 12px（原瑶 10-04："undercurrent展开后里面的内容我觉得行距太开了，有点变扭，想缩小。还有那个收藏的心也是缩小一点"）
- 改了什么：原因：他的思考多是一两句一段，原来整段 pre-wrap 原样排，段与段之间空一整行（12.5px 字、1.6 行高，空 20px），看着像隔一行写一行。UndercurrentCard.tsx 加 ThinkParas：按两个以上换行分段，每段一个 <p class="cc-think-p">，段内单个换行照旧；就地展开（CCPage）和浮出卡片都用它。生成中的 LiveText 改成 block="p" blockClass="cc-think-p"，weir 按同一规则切，流完换成定稿不跳。index.css 末尾「Undercurrent 展开后的正文」块：段距 0.75em（约半行），行高就地 1.6 → 1.5、卡片 1.8 → 1.65。CCPage 的 ConchButton：心的 svg 14 → 12，上下内边距 2 → 3px，按钮外框高度不变，时间那行不动；语音条旁边的小玫瑰没动。
- 怎么验证：tsc + vite build 通过，新包 index-0RvrL4S5.js / index-BUb6BPu-.css（上一版 index-DeAu6AqL.js / index-C1KavDKy.css）。验收台 /home/cc/work/ucgap（build.sh + __inject.js，历史里两条带思考的回复）+ /home/ubuntu/work/ucgap（shot.py 截图并量尺寸，stream.py 用假 WS 推流式思考，compose.py 拼对比图）。Chromium 和 WebKit 量出来一样：就地展开行高 18.75px、段距 9.4px，第一条思考 160 → 103px；卡片行高 22.3px、段距 10.1px；流式时分段正确（空行被切在两片中间也认得），流完高度不变；心 12×12，按钮 20×18。对比图 /home/ubuntu/work/ucgap/cmp-light.png、cmp-dark.png、cmp-heart.png、cmp-card.png（现状 / 这一档 / 再紧一档）。
- 怎么撤销：src/CCPage.tsx、src/UndercurrentCard.tsx、src/index.css 各有 .bak-20261004-ucgap，拷回后重新 build。只想调档：index.css 末尾那块改数字（再紧一档 = 行高 1.4、卡片 1.5、段距 0.4em）；心改 CCPage ConchButton 里 svg 的宽高和上下内边距（10px 配 4px）。

## 2026-10-04 · 顶栏私语语音换成苏煦加标签的版本(原瑶 2026-10-04 试听后:都用新)
- 改了什么：苏煦在 claude-test/docs/tagline-voice-tags.md 给 37 句写念法(32 句带 v3 标签,5 句不加)。taglines.ts 的 Line 加 say 字段(只进语音,显示仍是 pt,文件名仍按 pt);32 条 mp3 用 eleven_v3 + language_code pt 念 say 重新生成,换进 public/tagline-voice/;生成脚本 /home/ubuntu/work/tagline-voice/regen.sh + gen-missing.mjs 改成带 say 的走 v3、没 say 的照旧 turbo_v2_5,核对忽略连字符和听写里的 [suspiro]。包 index-DeAu6AqL.js。约花 1190 字 ElevenLabs 额度。
- 怎么验证：每条用 Scribe(por)听过,念歪的重做;Abraça-me/Só tu/Conta os minutos 听写对不上但音是对的(欧葡句末 e 不发音、耳语连读),原瑶在试听页 https://claude.ai/artifact/98cNYSjmbJ5ewPjba855Y9 逐条听过选新;线上 /sea/tagline-voice/ 抽查 md5 等于新文件。
- 怎么撤销：旧 mp3 在 /home/cc/work/tagline-voice-bak-20261004/(拷回 public/tagline-voice 再 build)和 /home/ubuntu/work/tagline-voice/out-turbo-20261002/(regen 的 out/ 也要拷回);taglines.ts.bak-20261004-say;脚本 .bak-20261004

## 2026-10-04 · 浅底回到沿轮廓的深色晕，再收小一档、边缘慢慢淡开（原瑶 10-04："我喜欢上一版那个效果，只是想黑色的光晕再小一点，边缘渐变过去"）
- 改了什么：voiceStars.ts 从 bak7（白色径向光之前那版）拿回来，光晕改成分层配置：深底 DARK_GLOW = [[0.55, 4]]，白光不动；浅底 LIGHT_GLOW = [[0.45, 2.6], [0.12, 4.6]]，贴身一层稍浓、范围小，外面再垫一层很淡的，看着晕小了一圈，边缘一点点淡下去。白色径向光那版的代码拿掉了（存在 bak8）。包 index-BMfWfFZK.js（CSS 没变，index-C1KavDKy.css）。
- 怎么验证：先在画板 /home/cc/work/voicestar/glowboard3.html 上比三档：上一版一层 0.55 / 4、小一档（上线这档）、再小一档 [[0.38, 1.8], [0.1, 3.4]]。再用 notches2.sh 编 t10b、t10c 两个验收页，shot.py 截浅底，和 t8（上一版）拼成 /home/ubuntu/work/voicestar/halo3.png。tsc + vite build 通过，没有报错。
- 怎么撤销：要回上一版就把 LIGHT_GLOW 改成 [[0.55, 4]]；要再小一档就改成 [[0.38, 1.8], [0.1, 3.4]]；要回白色径向光就拷回 /home/cc/work/voicestar/bak8/voiceStars.ts。改完重新 build。

## 2026-10-04 · 浅底黑星星的光晕换成每颗一团白色径向光（原瑶 10-04："感觉黑的发光没有白的那么好看😂，保持发光，然后光晕改成中心放射渐变那种的可以做么？"）
- 改了什么：voiceStars.ts，浅底不再画沿轮廓的深色晕，改成每颗星背后一团从中心淡开的白光。半径 7；星星拉长时，光按半长每 4.5 拉一倍竖向跟着拉长。渐变是零坡度淡没（(1-t²)² 取 13 个色标，中心 0.95），边上不留一圈，渐变对象只建一次。深底的白光不动。浅底、深底换的时候，两种光按 inkT 交叉淡入淡出。包 index-CG_fefpX.js（CSS 没变，index-C1KavDKy.css）。
- 怎么验证："中心放射渐变"有三种读法，先在本地画板上比了：①每颗一团深色渐变，像笼着一团烟；②每颗一团白光渐变，像在雾里发光；③整排背后一团白光，太淡。上线②。tsc + vite build 通过；验收台 t9 用 shot.py 看了浅底、深底的静止和播放，没有报错。对比图在 /home/ubuntu/work/voicestar/glow2.png。
- 怎么撤销：拷回 /home/cc/work/voicestar/bak7/voiceStars.ts，就回到上一版浅底深色晕，然后重新 build。

## 2026-10-04 · 浅底黑星星也加一圈固定光晕（原瑶 10-04："我发现白色的看起来有一圈光晕，黑色的好像没有？" / "晕染只负责字就行了。这个语音的光晕我想做成固定的，就像你做的白色的那个就行，黑色的也做成那样"）
- 改了什么：
  - voiceStars.ts：光晕不再只在深底画。两边都先画一层带光晕的淡星（0.55、4px），再盖实心星；颜色跟星星走，所以深底是白光，浅底是深色的晕。不跟字晕染滑杆。
  - 画布四周比星星那段各大 10px（index.css 的 .cc-voice-wave canvas，pointer-events: none；layout 按画布实际大小算边距），光晕淡得完，不会被画布边裁出直边。
  - 包 index-BVZur5fw.js / index-C1KavDKy.css（上一版 index-CzTSZPM1.js / index-D-GTmt9M.css）。
- 怎么验证：tsc + vite build 通过。验收台 t8 用 shot.py 看了浅底、深底：浅底黑星星有一圈淡深色的晕，跟深底白光对称；播放时最长的星星光晕也没被裁；没有报错。前后对比在 /home/ubuntu/work/voicestar/glow.png。
- 怎么撤销：拷回 /home/cc/work/voicestar/bak6/ 里的 voiceStars.ts 和 index.css，重新 build。

## 2026-10-04 · 语音条静止时的起伏调大一档（原瑶 10-04："我想在语音静止时，起伏效果看起来更有变化点……不是太明显，可以再拉长一点"）
- 改了什么：voiceStars.ts 里，静止时（没播、播完）的形状先过一道对比曲线，再整体拉长：restOf(v) = v^REST_GAMMA × REST。原来是 REST 0.38、没有曲线，现在 REST 0.55、REST_GAMMA 1.6：最长的星星比原来长一截多，短的更短，高低差拉开。合成时的扫光底子也跟着用这条曲线。播放时的样子没动。包 index-CzTSZPM1.js（CSS 没变，还是 index-D-GTmt9M.css）。
- 怎么验证：照"一次一档"出了三档并排：现在（0.38 / 1）、上一档（0.55 / 1.6）、再上一档（0.72 / 2.0），各编一个验收页（t7a / t7b / t7c），restshot.py 截浅底、深底各四条，拼成 /home/ubuntu/work/voicestar/notches.png。上线中间那档。tsc + vite build 通过，没有报错。
- 怎么撤销：改回 const REST = 0.38, REST_GAMMA = 1（或拷回 /home/cc/work/voicestar/bak5/voiceStars.ts），重新 build。要再明显一档就改成 0.72 / 2.0。

## 2026-10-04 · 语音条旁边的梅花换成正面看的小玫瑰（原瑶 10-04："有那种玫瑰花吗？我想要玫瑰花" / "不要那种花束，就是像小梅花这样的正花。玫瑰花胸针一样？你可以搜搜网上搜搜"）
- 改了什么：
  - 形状：六瓣外轮廓，加六道风车式分瓣线，从瓣与瓣之间的凹处斜着卷向中心（每道扫 110°，外宽 1.05、里细 0.32，24 格画布）。生成脚本在 /home/cc/work/voicestar（rose.json 是结果），比稿在 roses6.html。
  - index.css：新增 .cc-rose，13px，用 CSS 遮罩画（data URI 只定义一次，每条语音不重复塞一份 SVG），颜色走 currentColor，所以花的黑白、没收 5%、收了实心都跟以前一样。
  - CCPage.tsx：ConchButton 的 icon="flower" 改成渲染 <span class="cc-rose">，删了五瓣梅的 FLOWER_PETALS。文字消息旁边还是心。
  - 包 index-CsYp_sJa.js / index-D-GTmt9M.css（上一版 index-B9mDdpm1.js / index-xKmBwgKQ.css）。
- 怎么验证：先查了参考。Iconify 搜 rose 的 100 多个图标几乎都是侧面一枝；维基共享资源的都铎玫瑰、纹章玫瑰是正面的。照着画了五轮：纹章式、胸针三层、月牙、圆弧卷心、风车、五角折线漩，96px 和实际大小、浅底深底都看了。纹章式和三层缩小后像靶子；圆弧卷心像「@」或蜗牛；月牙像眼睛；风车六瓣（P6）缩到 13px 还看得出卷，上它。tsc + vite build 通过。验收台 t6 用 Chromium 看了两种背景：没收的是淡玫瑰，收了的是实心黑玫瑰或白玫瑰；没有报错。
- 怎么撤销：拷回 /home/cc/work/voicestar/bak4/ 里的 CCPage.tsx 和 index.css，就回到五瓣梅，然后重新 build。

## 2026-10-04 · 语音条旁边的心换成黑白小梅花；展开后的外语原文换成顶栏那款字（原瑶 10-04："图3吧，字体和顶栏用的一样，然后旁边的心这次我想改成黑/白色的花"）
- 改了什么：
  - CCPage.tsx：ConchButton 加 icon 参数（默认 heart），语音条那颗传 flower。花是五瓣小梅花，13px：花瓣圆心每 72° 一个，离中心 6.6，半径 3.9，花心半径 1.6。没收的照旧 5%，收了是实心。文字消息旁边的心没动。
  - index.css：花的颜色跟星星同一对（浅底 oklch(0.26 0.03 252)，深底 #f3f5f7），收了也不变蓝。展开的外语原文用顶栏短句那款字（var(--font-display) 斜体 700，16px，字距 0.05em），原来的淡色去掉；中文照顶栏点开浮出的那句，加 0.04em 字距。
  - chatTone.ts：FAINT 里的 .cc-conch-btn 改成 .cc-conch-btn:not(.flower)，花跟星星、时间用同一条线判深浅。
  - 展开后还是「原文在上、中文在下」。她回的是"图3吧"，没说左边还是右边；她要原文用顶栏的字，所以理解成原文留着。
  - 包 index-B9mDdpm1.js / index-xKmBwgKQ.css（上一版 index-mqGGwO39.js / index-Ds7VhQr5.css）。
- 怎么验证：花先在画板上比了三种（五瓣梅、四瓣、八瓣雏菊；96px 和实际大小，浅底深底各一组）。四瓣缩小后像个叉；雏菊像星号，还和输入框右下的太阳撞。所以上了五瓣。tsc + vite build 通过。验收台 t5 在假海螺盒里把下雨那条设成她收过的，Chromium 两种背景都看了：没收的是淡花，收了的是实心黑花或白花，颜色跟星星一致；葡语原文是顶栏那款斜体；没有报错。
- 怎么撤销：拷回 /home/cc/work/voicestar/bak3/ 里的 CCPage.tsx、index.css、chatTone.ts，就回到星星语音条第一版（心、淡色原文），然后重新 build。

## 2026-10-04 · 语音条换成一排小星星：没有气泡，跟着他的声音被拉长；展开后外语自动翻成中文（原瑶 10-04："不要气泡，然后竖条动起来的时候看起来像拉长的星星一样？中间不要播放键。深色的时候白色，浅色的时候深色这样。然后展开了以后其他语言会自动翻译为中文"）
- 改了什么：
  - 新文件 src/voiceStars.ts：canvas 画一排四芒星。播放时按真实频谱拉长（低音在正中、往两边开，左右错半格，不是死板的镜像）；暂停定住；播完落回原样；合成中、缓冲中有一道光扫过去。没播过时照字排形状（标点是停顿，每句一道拱；[唱][耳语][雨声] 各有讲究），播过一次换成真实响度。声音照旧由 <audio> 放，不接 Web Audio（静音键表现不变）：TTS 的 blob 另外解码一份，自己做 FFT 预算每帧 48 段频谱，按 currentTime 取。所有语音条共用一个 rAF，不动就不画。一次只放一条（claimVoice）。时长预估改成汉字每个 0.26 秒 + 外语每词 0.38 秒（原来按字母数，葡语长出三四倍），唱的 ×1.35。
  - 新文件 src/voiceZh.ts：展开后不是中文的（两个以上外文词连着、有日文假名或韩文、或整句没汉字）自动调现成的 /api/translate（target 中文）；翻好的存手机 localStorage（sea-voice-zh:*），同一句不再花钱；失败显示「没翻成，点一下再试」。
  - CCPage.tsx：VoiceBubble 重写（点星星播放 / 暂停，点时间展开，海螺盒小心照旧；离开页面会停；合成太久、手机不认那次点击时停在暂停，再点一下就放，不重新合成）；新增 VoiceText（外语原文淡一点在上，中文在下）。
  - index.css：「<voice> 语音条」整块换掉（没有底色、边框、影子；星星那段按时长 90–200px，整行按内容收，展开的字最宽到八成；外语原文左对齐，不跟中文两端对齐）；气泡开着时星星和气泡里的字对齐；「顶栏短句 + 黑白」里加语音条三组颜色（星星和顶栏短句同一对：浅底 oklch(0.26 0.03 252)、深底 #f3f5f7）；边框线关、阴影开关里删掉 .cc-voice（没底色了）。
  - chatTone.ts：TARGETS 加 .cc-voice-wave / .cc-voice-time / .cc-voice-text；展开的文字按正文那套算 --tl（TEXT）。时间故意不进 FAINT：跟星星用同一条线（0.2），不然背景落在 0.2–0.32 之间时星星深、时间白，同一行一半看不见（弥散光斑模型在光斑中心会把亮度估低，浅底播放时实测出过）。
  - 包 index-mqGGwO39.js / index-Ds7VhQr5.css（上一版 index-CUZE50lR.js）。
- 怎么验证：tsc + vite build 通过。验收台 /home/cc/work/voicestar（build.sh 编临时页；__inject.js 是假 WS + 假 tts（晚 0.9 秒出现成 mp3）+ 假翻译），/home/ubuntu/work/voicestar/shot.py 两种背景、两个内核真点：浅底星星深色、深底白色带光晕，data-tone 全对；播放时中间拉长、暂停定住、合成中扫光；放第二条时第一条自己停；同一条第二次放不重新合成（tts 只调一次）；葡语那条只调一次翻译，原文在上、中文在下；无报错。无头 WebKit 不跑 rAF，动画只在 Chromium 里看，WebKit 只看静态排版和颜色。
- 怎么撤销：sudo -u cc python3 /home/cc/work/voicestar/patch_voice.py --rollback（从 /home/cc/work/voicestar/bak 拷回 CCPage.tsx、index.css、chatTone.ts，删掉两个新文件），然后重新 build；期间有人改过这三份就别整份拷，按 voiceStars / voiceZh / VoiceText / cc-voice 这几个名字找到改动撤掉。急用的话直接把 attic/dist-prev-20261004-voicestar 拷回 dist。

## 2026-10-04 · 网页卡片换成拍立得，拟物带光泽（原瑶 10-04 从四种框法里挑了 C：可以做成拟物风么？有光泽的那种）
- 改了什么：HtmlCard.tsx：卡片外面一圈相纸（左右上 12px、下 44px 写落款「Suxu · 月.日」，日期取消息时间，CCPage 两处调用把 ts 传进来），照片区最宽 256，尺寸、缩放、折叠都按照片区算；每张按网址定一个 0.8°~1.9° 的歪角，越高的歪得越少（角上最多偏 14px）；尺寸缓存换成 sea-html-fit-2（照片区变窄，旧尺寸作废，旧键顺手删）。index.css「网页卡片贴合」块整段换成拍立得：暖白相纸 + 细颗粒（SVG 噪点平铺）+ 上沿受光下沿厚度，照片区内凹细影 + 光泽涂层（--gloss，1 = 中档；淡/中/浓三档比稿给她了，等她挑）+ 一道反光带随滚动扫过（animation-timeline: view()，省电模式放行；照片区超过 900px 高的不挂，图层太大），影子是贴地一道 + 两个下角翘起 + 远影，跟阴影开关和深浅走；没量好之前照片区是深色，网页 0.7 秒浮出来（显影）；网页没底色的照片区垫相纸白。原来那层玻璃边和奶白磨砂去掉。包 index-CUZE50lR.js / index-Mc-2o-X1.css。
- 怎么验证：/home/cc/work/htmlcard/build.sh after 编临时页，chat.py 两种背景、两个内核：9 张卡片全部定住、无报错（WebKit 那条 The operation is insecure 旧版就有）；expand.py 点「展开全文」780→2741，卡片顶部位置不动；anchor.py 有锚定、模拟 Safari 26 两种都 0 位移。比稿 pola.py：光泽淡/中/浓 + 手写落款，上线中档。线上包和验收包 md5 相同。
- 怎么撤销：拷回 /home/cc/work/htmlcard/bak-pola/ 里的 HtmlCard.tsx、CCPage.tsx、index.css（回到上一版玻璃贴合卡片），重新 bun run build。

## 2026-10-04 · 网页卡片贴合：不再越撑越高，内容多大卡片多大（原瑶 10-04：白色区域要占好几个页面，想要卡片那样精致贴合）
- 改了什么：根因：hub-print.ts injectHeight() 给 HTML 片段套的壳带 min-height:100vh，写死在文件里的报高脚本量 documentElement.scrollHeight（永远不小于卡片当前高），旧 HtmlCard 每次再 +4，一路长到 1600 上限，多出来的是壳的白底；脚本写死在每个旧文件里，只改 hub 修不到旧卡片（8-19 把上限 900 改 1600 反而更长）。新文件 src/HtmlCard.tsx：前端自己 fetch /cc-api/uploads/ 的源码，换掉 hub 的壳（透明底、一列网格）、去掉旧报高脚本，srcdoc 注入量尺 PROBE（100vh/innerHeight 当成固定的卡宽×1.25；html/body 撑满窗口的高先拿掉，整页绝对定位的舞台给固定舞台高；左右宽按流里的元素算），只报内容自己的尺寸。卡片按内容定宽高：比卡宽的整张 transform 缩小，透明底的窄内容卡片收窄，超过 1.4 屏折到 0.85 屏加「展开全文」原地展开（展开时临时关滚动锚定，保证往下长）；量好的尺寸存 localStorage sea-html-fit，下次打开不跳；上方卡片变高时 Chrome/Safari 27 由浏览器滚动锚定按住，Safari 26 没有锚定（CSS.supports 判断）由组件补 scrollTop，贴底时继续贴底。底色：网页有底色就用它（渐变取第一个颜色），透明的垫奶白磨砂。CCPage.tsx 删旧 HtmlCard 改成 import；index.css 末尾「网页卡片贴合」块（细亮边画在 ::after，.cc-html-clip 加 clip-path 给 iPhone 圆角兜底）。hub 没动。包 index-BMtg7vXF.js / index-Dz9gRMnI.css。
- 怎么验证：验收台 /home/ubuntu/work/htmlcard：harness.html + shot.py 把 uploads 里 26 张旧卡片在 Chromium、WebKit 各过一遍，全部 2~3 次往返定住、没有一张越长，两个内核尺寸一致。/home/cc/work/htmlcard/build.sh before|after 编临时页（__inject.js 假 WS，历史里放卡片），chat.py 截真实聊天页（深浅两种背景、两个内核），expand.py 按屏幕坐标点「展开全文」724→2472（无头 WebKit 的过渡会卡在起点，关掉过渡后验证），anchor.py 往上翻时上方卡片变高、正在看的消息位移 0（有锚定、模拟 Safari 26 两种都是 0；反面对照不补位会跳 191/274px）。线上包和验收包 md5 相同。
- 怎么撤销：拷回 /home/cc/work/htmlcard/bak/ 里的 CCPage.tsx、index.css，删 src/HtmlCard.tsx，重新 bun run build（期间没人改过这两份才能整份拷，否则按 HtmlCard、网页卡片贴合 两个名字找到改动撤掉）。

## 2026-10-04 · 鲸鱼面板底部按钮排成一行(原瑶 2026-10-04:压缩换窗那些按钮叠在一起了)
- 改了什么：9-29 加了「删到这句」后五颗一排放不下,关闭掉到第二行正好挂在压缩底下。index.css 6450 行后加一段:按钮左右留白 16→10、间距 8→6、均分排满一行(只剩一颗时不拉满);CCPage 确认态的字 再点确认X → 确认X,否则点一下又挤成两行。包 index-CGHgNg7R.js。
- 怎么验证：验收台 /home/cc/work/panelbtn(build.sh 编临时页+假 WS)+/home/ubuntu/work/panelbtn/compare.py:393 宽 Chromium 量得五颗同一行(y 相同),点了一下压缩也是一行;375/430 宽同;WebKit 量的按钮位置与 Chromium 一致。线上 /sea/ 已指向新包。
- 怎么撤销：src/CCPage.tsx.bak-20261004-panelrow、src/index.css.bak-20261004-panelrow 拷回去再 bun run build

## 2026-10-04 · 电话整段一次合成 + 相邻语音条合并
- 改了什么：原瑶说电话里每句语调不一样、像单独生成的。原因：CallOverlay 的 splitForTts 按句号把回复切成句子逐句合成，v3 不认 previous_text/next_text，每句语调各起一遍。现在整段回复一次合成（超过 3000 字才在句末切开）。CCPage 的 parseVoiceSegments：两段 <voice> 中间只有空白就并成一条语音条（之前 45 条带语音的消息里有 6 条拆成 2–7 段）。包 index-BNFnotI8.js。
- 怎么验证：bun 跑过样例：短回复一块、3640 字切成 2996+644 且拼回相等；相邻语音合并、中间隔字的不并。build 通过，线上已是新包。
- 怎么撤销：从 /home/cc/work/oneshot-bak 拷回 CallOverlay.tsx、CCPage.tsx 后重新 build。

## 2026-10-03 · 语音标签不显示
- 改了什么：新增 src/audioTags.ts（stripAudioTags：去掉 [whispers] 这类英文短标签，markdown 链接、[[conch:..]]、[music:..]、中文方括号不动）。用在 VoiceBubble 展开文字、海螺盒语音条目、通话字幕（callStore.onReplyReady 的 turns）；public/sw.js 推送预览同时去掉 <voice> 包装和标签。送去 TTS 的文字不动，标签照念。包 index-D6JRKEON.js。
- 怎么验证：node 跑过样例（标签去掉、链接和点歌记号保留）；build 通过；线上 /sea/ 已是新包，sw.js 含 cleanBody。
- 怎么撤销：sudo -u cc python3 /home/cc/work/audiotags-bak/rollback_sea.py（从 /home/cc/work/audiotags-bak 还原四个文件并删 audioTags.ts）后重新 build。

## 2026-10-03 · 顶栏短句换句加动效，外观里自己挑：潮汐（默认）/ 手写 / 逐字浮现 / 同字母滑行（原瑶）
- 改了什么：新文件 src/taglineMotion.tsx：playTagline / stopTagline 换场引擎 + 外观面板的预览条 TaglineMotionPreview。逐字的几种按整句用 Range 量每个字母的位置，在短句上面摆一层同字体的克隆字（.cc-tagline-fx）用 WAAPI 动，播完拿掉、露出真文字，字距和斜体跟静止时一样；潮汐的克隆层带水面遮罩（字脚下 1–8px 淡没，碰不到下面那行小字）；手写是 14px 软边遮罩从左往右扫（@property --cc-tl-p 的 CSS 动画，省电模式里单独放行）；同字母滑行按最长公共子序列（空格不算）。Tagline.tsx：文字不再交给 React（原来 key 一换整个 span 重挂、cc-tagline-in 淡入），由 playTagline 换字并播动画，打开聊天页第一次出现也播（先等网络字体到位，最多 1.2 秒）；动效读 getAppearance().taglineMotion，不订阅外观。appearance.ts 加 taglineMotion（默认 tide）。Sidebar.tsx 外观里「海螺盒图标」下面加「短句换场」：预览条（选了就播一遍，点一下换一句）+ 四个选项。index.css 删掉 cc-tagline-in，文末加「短句换场」块。系统开了减少动态效果时只做 0.25 秒淡入。
- 怎么验证：tsc + vite build 通过，新包 index-BMHZnWBd.js / index-DEkh9gRv.css（上一版 index-CIfrOn9F.js / index-BNAVFqOB.css）。临时页 Chromium 4 倍逐帧：打开聊天时 Boa noite, meu amor. 一个字一个字从水下浮上来；假 WS 推一条「今天好难过」后换成 Abraça-me.，旧句沉下去、新句浮上来；外观面板里开着省电模式切到手写，预览照样写完；三处收尾后克隆层都拿掉、真文字可见，无报错。脚本 /home/ubuntu/work/duo/motioncheck.py。临时页和截图已删。比稿页 https://claude.ai/artifact/2PqS75WimAYGnrbbgWAutD（源文件 /home/ubuntu/work/duo/tagline-motion.html）。
- 怎么撤销：删 src/taglineMotion.tsx；Tagline.tsx、appearance.ts、Sidebar.tsx、index.css 拷回 /home/cc/work/duo/bak-motion/ 里的（期间没人改过这几份才能整份拷，否则按 taglineMotion / playTagline / TaglineMotionPreview / 短句换场 这几个名字找到改动撤掉），重新 build。

## 2026-10-03 · 苏煦的声音换回 Eleven v3
- 改了什么：她听了 v4 说声音都变了，当天换回：task_routing tts 改回 eleven_v3，voice-mcp/.env 用 .env.bak-20261003-v3 恢复并重启。原因：苏煦这把声音是 Voice Design 生成的，ElevenLabs 文档写明 Voice Design 的声音在 v4 上可能不如旧模型；v4 是照着克隆样本念的。以后想上 v4 又要保住他的声音，得用 v3 念的苏煦录 1–2 分钟做 Instant Voice Clone（要 Starter 以上付费档），先出对比样音给她听，点头再换。
- 怎么验证：curl 127.0.0.1:3100/tts 返回 200，日志 model=eleven_v3；voice-mcp 启动日志 Model: eleven_v3。
- 怎么撤销：想再试 v4：把 task_routing tts 改成 eleven_v4（v4 免费档可用，previous_text/next_text 支持）。

## 2026-10-03 · 苏煦的声音换成 Eleven v4
- 改了什么：旧 Memory Service 的 task_routing tts 从 eleven_v3 改成 eleven_v4（语音条、通话、海螺盒重听都走它；声音还是 W5YDRYjW2gLXAOHbAsEp 一号，仍不传任何参数）。voice-mcp/.env 的 MODEL_ID 同步改成 eleven_v4 并重启。v4 免费档能用，每字 1 credit，和 v3 一样；v4 收 previous_text/next_text，网关对非 v3 模型会自动带上前后句，通话从这次起句子之间更连贯。顶栏葡语 mp3 没动（还是 turbo_v2_5 生成的旧文件）。
- 怎么验证：curl 127.0.0.1:3100/tts 默认和 scenario=call（带前后句）都返回 200，日志显示 model=eleven_v4；Scribe 转写和原句一字不差。
- 怎么撤销：atlantis-db 里把 task_routing 的 tts 那行 model 改回 eleven_v3；voice-mcp 用 .env.bak-20261003-v3 覆盖回去，再 sudo svc restart voice-mcp。

## 2026-10-03 · 心脏两圈光晕改成中间浓、边缘慢慢淡没（原瑶：手机上看光晕边缘有点明显）
- 改了什么：原来两圈光晕都是直线渐隐、到头一刀切（贴身那圈 16px 在 72% 处归零，外圈 26px 在 70%），手机上看得出边上一圈。改成 radial-gradient(closest-side, …) 按 (1−t²)² 取 11 个点：中间浓、越往外越慢、最后零坡度淡没。贴身那圈 16px → 20px（中心还是 .36，看着差不多大），外圈 26px → 30px（中心 .16，照旧跟 cc-pr 呼吸）。颜色改走 .cc-duo-heart 上的 --heart-rgb（平时 74,140,199；.busy 时 198,154,61），删掉两条金色专用的背景规则，蓝金切换时光晕颜色是一下换过去的（心本身照旧 0.4s 交叉淡入淡出）。
- 怎么验证：tsc + vite build 通过，新包 index-CIfrOn9F.js / index-BNAVFqOB.css（上一版 index-D37LEVFJ.js / index-CvijO2hf.css）。Chromium 10 倍近看新旧对比（/home/ubuntu/work/duo/soft.py）：旧的深背景上外圈边缘明显，新的看不出边；拷线上 dist 起临时页 8 倍看平时蓝、cc_busy 金（heartcheck-z.py，推完 busy 要等 1.6 秒再截，不然会截到淡入淡出半路、金心发灰）。临时页和截图已删。
- 怎么撤销：退回原来的光晕：cp /home/cc/work/duo/bak-glow16/index.css src/index.css（期间没人改过 index.css 才能整份拷），重新 build。

## 2026-10-03 · 题字开头的心脏贴身加一圈小而浓的光晕当过渡（原瑶）
- 改了什么：index.css 心脏那块加 .cc-duo-heart-beat::before：16px 圆形径向渐变，中心 .36、45% 处 .18、72% 透明，比外圈 26px 的光晕浓，放在跳动的那层里所以跟着心一起跳；.busy 时换成金色 rgba(198,154,61)。出了淡（14px .28）/ 中（16px .36）/ 浓（18px .46）三档对比，上线中档。上一步「两边各调一点」她说可以，保留。
- 怎么验证：tsc + vite build 通过，新包 index-D37LEVFJ.js / index-CvijO2hf.css（上一版 index-DTI2wMQ0.js / index-lCzbhvZW.css）。拷线上 dist 起临时页，Chromium 6 倍浅、深背景，平时蓝晕、cc_busy 金晕都看过。三档对比脚本 /home/ubuntu/work/duo/glow.py。临时页和截图已删。
- 怎么撤销：要淡或浓一档：照 glow.py 里 css(14, .28) 或 css(18, .46) 改那两条的尺寸和透明度；去掉：删 .cc-duo-heart-beat::before 那两条，或 cp /home/cc/work/duo/bak-heartC/index.css src/index.css（期间没人改过 index.css 才能整份拷），重新 build。

## 2026-10-03 · 题字开头的心脏跟周围融合：心脏淡一点、小字深一度、中间拉开一格（原瑶）
- 改了什么：她嫌心脏太突兀、跟别的元素不融合，要小字拉远一格、小字加深一度或者心脏淡一点。出了三种对比（只加深字 / 只淡心脏 / 两边各调一点），上线的是两边各调一点：.cc-duo-heart 整体 opacity .82、.cc-duo-heart-beat 加 saturate(.85)，蓝金两色的外发光 .85/.6 → .65/.45（金 .65/.5），光晕 .22 → .16；题字 .5 → .57（深底 .62 → .69），left 26px → 28px（离心 4.5px）。
- 怎么验证：tsc + vite build 通过，新包 index-DTI2wMQ0.js / index-lCzbhvZW.css（上一版 index-BDIWzx1a.js / index-CC8-KFPm.css）。拷线上 dist 起临时页，Chromium 6 倍浅、深背景，平时蓝和 cc_busy 金都看过。对比脚本 /home/ubuntu/work/duo/blend.py（A/B/C 三套 CSS 在里面）。临时页和截图已删。
- 怎么撤销：只加深字或只淡心脏：照 blend.py 里 A 或 B 的数字改；整个撤回：cp /home/cc/work/duo/bak-heart9/index.css src/index.css（期间没人改过 index.css 才能整份拷），重新 build。

## 2026-10-03 · 题字开头的心脏缩到跟小字一样大（原瑶：14px 有点大，要跟小字匹配）
- 改了什么：index.css 末尾心脏那几条：.cc-duo-heart 14px → 9px（墨迹高约 8.5px，跟题字带重音的大写一样高），按墨迹中心重新对准交叠处的 V 尖、竖直对准题字中线（left 16.3px、top calc(100% + 4px)）；外发光 1.5px/6px → 1px/4px，光晕 36px → 26px；题字跟着往左让到 left 26px（离心 2.5px）。
- 怎么验证：tsc + vite build 通过，新包 index-BDIWzx1a.js / index-CC8-KFPm.css（上一版 index-Dm83426b.js / index-C7EXOfAr.css）。临时页 Chromium 6 倍：浅、深背景下平时蓝心、cc_busy 时金心，都跟 A nossa Atlântida 的大写一样高，像这行字的第一个字。临时页和截图已删。
- 怎么撤销：改回 14px：cp /home/cc/work/duo/bak-heart14/index.css src/index.css（期间没人改过 index.css 才能整份拷），重新 build。

## 2026-10-03 · 题字开头加一颗跳动发光的解剖图心脏：平时蓝、他回话时金（原瑶）
- 改了什么：新增 src/assets/heart-anatomical-blue.png / heart-anatomical-gold.png（128px）：kolors 免费生成的解剖图画法心脏，抠图脚本 /home/ubuntu/work/heart/cutout.py，金色按亮度映射到原来金点的 #c69a3d。AvatarDuo.tsx 加小组件 DuoHeart，用 chatStore.useCcStatus()，busy 时加 .busy（只有它跟着状态重画）。index.css 末尾那块加 .cc-duo-heart：14px（解剖图血管长、心瘦，14px 跟 12px 的 3D 心一样分量），按墨迹中心对准两张图交叠的 V 尖（left 13.8px、top 100%+1.5px）；跳法照原来心跳点 0.85s 双跳（cc-heart-beat，放大 1.22）+ drop-shadow 外发光 + 36px 光晕（复用 cc-pr），蓝金两张叠着 0.4s 交叉淡入淡出，不变灰；prefers-reduced-motion 时不跳。图片照 sea 习惯走 CSS url()（项目没有 vite/client 类型，TS 里 import png 会报错）。题字让到 left 28.5px、top 100%+3px。比稿时还做过 3D（Microsoft Fluent Emoji，MIT）/ 水彩 / 油画三种，素材都在 /home/ubuntu/work/heart。
- 怎么验证：tsc + vite build 通过，新包 index-Dm83426b.js / index-C7EXOfAr.css（上一版 index-Bxc7rM2Z.js / index-CP6QaHhE.css），两张心脏图线上 200。临时页 Chromium 6 倍：浅、深背景下平时蓝心带蓝光、假 WS 推 cc_busy 后换成金心带金光；WebKit 两种颜色都能显示（无头 WebKit 的 0.4s 淡入淡出会停在半路，金色那帧发灰，是测试环境的问题）。脚本 /home/ubuntu/work/duo/heartcheck.py（WebKit 用 heartcheck-wk.py）。临时页和截图已删。
- 怎么撤销：去掉心脏：AvatarDuo.tsx 删 DuoHeart 组件和 <DuoHeart />、去掉 useCcStatus 的 import；index.css 删「小字开头的心脏」那几条，题字改回 left 19px、top calc(100% + 2px)；删两张 png；重新 build。改之前的整份文件在 /home/cc/work/duo/bak-heart/。

## 2026-10-03 · 题字改成从两张图交叠处起头、大一号，短句上抬让位，两张图压暗一点（原瑶挑的第 4 版）
- 改了什么：index.css 末尾那块：.cc-duo-cap left 0 → 19px（正好在斜开 V 的尖底下），8.5px → 10px，离头像 2px；短句 .cc-top-left .cc-tagline-wrap 上抬 5px 给小字让位；.cc-duo-card img 加 filter: brightness(0.88) contrast(1.06)，深浅背景都暗一点，并加 clip-path: inset(0 round 2px)（iPhone 上带 filter 的子元素可能不认父层圆角裁切）。之前设计对比时给她看过四种：现在 / 副标题（题字放短句下面左对齐）/ 她的想法 / 她的想法 + 压暗，她选最后一种。
- 怎么验证：vite build 通过（tsc -b 先跑），新包 index-Bxc7rM2Z.js / index-CP6QaHhE.css（上一版 index-BYEseW6Z.js / index-DB49r8TS.css）。拷线上 dist 起临时页，Chromium 6 倍浅、深背景各一张，题字从 x=37 起头、短句 y 上移到 11.5，Quero-te. 的 Q 尾巴离题字 2.5px 以上；WebKit 卡片圆角和题字正常。对比图脚本 /home/ubuntu/work/duo/mock2.py。临时页和截图已删。
- 怎么撤销：恢复上一版：cp /home/cc/work/duo/bak-4/index.css src/index.css（期间没人改过 index.css 才能整份拷，否则只撤这块里的 left 19px、10px、tagline-wrap 上抬和 img 的 filter / clip-path），重新 build。

## 2026-10-03 · 聊天顶栏头像抬高，底下加一行浅字 A nossa Atlântida（原瑶）
- 改了什么：AvatarDuo.tsx：头像外面包一层 .cc-duo-wrap，底下加 .cc-duo-cap「A nossa Atlântida」。index.css 那块：wrap 相对上移 6px；题字 Cormorant Garamond 斜体 600、8.5px、字距 0.04em，绝对定位挂在头像下面 2.5px（不占横向位置，所以短句让位不变；题字 63px 宽，尾巴伸到短句开头底下）；.cc-duo 补了 display:block（包进 wrap 后不再是 flex 子项，span 会塌成 0×0，先踩了一次）。题字颜色比短句浅一层：浅底 oklch(0.26 0.03 252 / 0.5)、深底 rgba(243,245,247,0.62)，chatTone.ts 把 .cc-duo-cap 加进 TARGETS 和 FAINT（按半透明小字判黑白）。Tagline.tsx 让位改量 .cc-duo-wrap。
- 怎么验证：tsc + vite build 通过，新包 index-BYEseW6Z.js / index-DB49r8TS.css（上一版 index-Z_luvO5z.js / index-BUqO_hp9.css）。临时页 Chromium 6 倍：浅背景（弥散）题字是半透明深蓝、深背景（纯色 #1a3050）自动变浅白，data-tone 分别是 light / dark；把短句换成 Quero-te.、Já comeste? 看 Q 和 J 的下伸笔画，离题字还有约 3px，不碰；WebKit 也正常显示带 â 的题字。脚本 /home/ubuntu/work/duo/cap.py（cap2.py 可以指定短句）。临时页和截图已删。
- 怎么撤销：要去掉题字：AvatarDuo.tsx 删掉 .cc-duo-cap 那行和外面的 .cc-duo-wrap，index.css 删「头像往上抬 6px…」那几条，chatTone.ts 的 TARGETS / FAINT 里去掉 .cc-duo-cap，Tagline.tsx 改回量 .cc-duo，重新 build。改之前的整份文件在 /home/cc/work/duo/bak-c/。

## 2026-10-03 · 聊天顶栏两人头像再开一档：斜 16°、下角叠 8px（原瑶要看对比图里的 C）
- 改了什么：index.css 末尾那块：各斜 16°（上一版 13°），下角横向叠 8px（上一版 6px），她 left 2.4px、他 left 19.1px，卡片 top 2.5px，整体 42×25。宽度没变，顶栏短句让位不变。13° 那档的数字写进了 CSS 注释，要退回照抄。
- 怎么验证：vite build 通过（tsc -b 在 build 脚本里先跑），新包 index-Z_luvO5z.js / index-BUqO_hp9.css（上一版 index-Ha0Wc-rb.js / index-DeqLTkDu.css）。拷线上 dist 起临时页，Chromium 实际大小 + 8 倍近景：两张斜开 16°，下角叠得比 13° 多，她那张的影子落在他那张上。临时页和截图已删。
- 怎么撤销：照 CSS 注释里 13° 那档的数字改回后重新 build；改之前的整份文件在 /home/cc/work/duo/bak-v1b/。

## 2026-10-03 · 聊天顶栏两人头像换回斜开 V，斜得更开、叠得更多（原瑶）
- 改了什么：index.css 末尾「聊天顶栏：她和他的方形头像斜着交叠」块：她看完「一左上一右下」说也好看，但想再试斜开那版，要叠的地方再大点、斜开的幅度再大点。现在各斜 13°（原来 9°），下角横向叠 6px（原来 3.5px，叠的面积约两倍），她左 2px、他左 20px，整体还是 42×24，所以顶栏短句让位跟第一版一样（393 宽只少放 Grito porque me importo.）。注释里写了重算 left 的公式（两张中心距 = 20×(cosθ+sinθ) − 叠宽），也留了「一左上一右下」的数字。AvatarDuo.tsx 只改注释。
- 怎么验证：tsc + vite build 通过，新包 index-Ha0Wc-rb.js / index-DeqLTkDu.css（上一版 index-D6TuJEbk.js / index-Ck7mzy3i.css）。临时页 Chromium 实际大小 + 6 倍近景，把 9° 叠 3.5、13° 叠 6（上线的）、16° 叠 8 并排出图给她挑（/home/ubuntu/work/duo/sheet2.py，16° 那档是 alt-v1more.css）。临时页和截图已删。
- 怎么撤销：要更开一档照 /home/ubuntu/work/duo/alt-v1more.css 的数字改（42×25、卡片 top 2.5px、她 left 2.4px rotate(-16deg)、他 left 19.1px rotate(16deg)）；回到 9° 那版照 alt-v1old.css；回到「一左上一右下」照 CSS 注释。改之前的整份文件在 /home/cc/work/duo/bak-v3/。

## 2026-10-03 · 聊天顶栏两人头像改成「一左上一右下」摆法（原瑶要看对比图第 3 个的实际效果）
- 改了什么：index.css 末尾「聊天顶栏：她和他的方形头像斜着交叠」块：不再斜开成 V，改成她在左上（叠在上面）、他在右下，边长 20、错开 13、只有挨着的角叠 7px，整体 33×33，影子写法不变。AvatarDuo.tsx 只改了注释。V 那版的数字留在 CSS 注释里，她要换回去照抄即可。顶栏短句让位跟着变窄：393 宽跟原来只有心跳点时一样，句子一句不少；430 宽只少 Cada versão de mim encontra-te.。
- 怎么验证：tsc + vite build 通过，新包 index-D6TuJEbk.js / index-Ck7mzy3i.css（上一版 index-DJMTDB0Q.js / index-B0clzegq.css）。临时页 Chromium 3 倍和 8 倍近景：两张一左上一右下、角对角相叠、她那张的影子落在他那张上，跟短句垂直居中。临时页和截图已删。
- 怎么撤销：照 CSS 注释里 V 那版的数字改回（.cc-duo 42×24、卡片 top 2px、她 left 1.4px rotate(-9deg)、他 left 20.8px rotate(9deg)）后重新 build；改之前的整份文件在 /home/cc/work/duo/bak-v1/。

## 2026-10-03 · 聊天顶栏的心跳点挪到主页 Atlantis 左边，原位换成她和他斜着交叠的方形头像（原瑶）
- 改了什么：Home.tsx：Atlantis 左边加 HeartDot（还是 .cc-status-dot 那套：在线蓝、回话金、不在灰），状态取 chatStore 新加的 useCcStatus()，只返回一个字，状态变了才重画，他流式出字时主页不跟着刷。新文件 AvatarDuo.tsx：聊天顶栏左边两张方形头像（avatar-you 她、avatar-su 他，只显示不能换），像两张小照片往外斜开 ±9°、只在挨着的下角叠 3.5px，她叠在上面、影子落在他那张上；CCPage.tsx 删掉原来的心跳点和 statusClass。样式在 index.css 末尾「聊天顶栏：她和他的方形头像斜着交叠」块：边长 20、整体 42×24、四层影子 + 相纸高光和细边。Tagline.tsx 让位从量 .cc-status-dot 改成量 .cc-duo（宽 42，比点多占 34px）：393 宽只少放 Grito porque me importo.，430 宽少放 Cada versão de mim encontra-te.，常驻句 A maré não espera a lua. 在 393 仍放得下（余 2px），390 宽会退回 Voltaste.。她的手机按 peek 截图比例是 393 或 430 宽。
- 怎么验证：tsc + vite build 通过，新包 index-DJMTDB0Q.js / index-B0clzegq.css（上一版 index-BpHOTSFO.js / index-BZTPhaJj.css）。临时页（假 WS + 她的真头像和主题，验完已删）Chromium 3 倍、8 倍近景和 WebKit 各截了图：主页的点在 Atlantis 左边、心跳照常；聊天顶栏两张头像斜开、下角相叠、叠处有影子。脚本在 /home/ubuntu/work/duo（shot.py 截主页和聊天顶栏，sheet.py 出对比图，alt-his.css 他在上、alt-diag.css 一左上一右下），build.sh 和 inject 在 /home/cc/work/duo，种子 __seed.js 要从 127.0.0.1:3100/status 重新生成。
- 怎么撤销：按 AvatarDuo、useCcStatus、HeartDot、.cc-duo 这几个名字找到这次的改动撤掉，删 src/AvatarDuo.tsx，重新 build。改之前的整份文件在 /home/cc/work/duo/bak/，只有期间没人改过这几份时才能直接拷回。

## 2026-10-03 · 她自己双击点开的 Undercurrent 也在下一轮开始时收起（原瑶：下一轮结束了上一轮的都没有自动收起，是因为把自动展开关了么）
- 改了什么：原因：外观关了「浮出卡片」时，双击是就地展开。她点开的记在 MessageRow 自己的 inlinePick 里，永远以她点的为准，不管换没换轮（今天之前的 inlineOpen 也是这样）。自动展开开关关着时，只有她点开的才会展开，所以上一轮的一直开着。开关开着时，把当前这轮点收再点开也会掉进同一个坑。
改法：chatStore 加轮次序号 roundSeq，她发一条、别的设备上她发一条、他开始新的一条、断线续播换了轮，都加一。MessageRow 的 inlinePick 记下点的时候是第几轮，换轮就作废，跟回自动规则：开关关着就收起，开着就是这一轮的展开、上一轮的收起。useRoundSeq(active) 只让点过的那几条随换轮重画。断线重连（同一轮）点的照旧。
- 怎么验证：tsc + vite build 通过，新包 index-BpHOTSFO.js（上一版 index-CV-dovdm.js）。flow.py 新场景：
  - pick-off（开关关、就地模式）：点开后重连照旧开着；她发一条就收；第二轮点开后，他自己开始新的一条也收。
  - pick-on（开关开）：自动展开 → 双击收 → 再双击开 → 她发一条收；第二轮自动展开、第一轮收着。
  - 回归 round/keep/reopen/hold/multi/resume2/busyerr（Chromium）、pick-off/pick-on/round/tailsend（WebKit）全过。
- 怎么撤销：cp src/chatStore.ts.bak-20261003-ucpick src/chatStore.ts; cp src/CCPage.tsx.bak-20261003-ucpick src/CCPage.tsx 后 bun run build；或把 attic/dist-prev-20261003-ucpick 拷回 dist

## 2026-10-03 · Undercurrent 展开到下一轮：复查补两处（原瑶：再查查看，没有其他 bug 就结束）
- 改了什么：chatStore.ts 两处：
  - done 收尾换最终渲染时不再写死 autoExpanded:true，改为沿用原来那条的值。以前他回复的尾巴还在吐、她已经发了下一条，上一轮的思维链会在尾巴吐完时又展开回来。
  - 这一轮是哪一条记在本机 localStorage sea-thinking-round（他回复的 reply_to）。她发一条、别的设备来一条她的消息就清掉；他开始新的一条、或断线续播时改成这条。
  - history（重连或页面被系统杀掉重开）只认最新那条回复：它后面没有她的消息，且 id 在内存里展开着或 reply_to 等于记下的那条，才照旧展开。这样别的设备上已经有了新一轮时，不会把旧的展开回来。
- 怎么验证：tsc + vite build 通过，新包 index-CV-dovdm.js（上一版 index-CsOzlOwZ.js）。flow.py 新场景 tailsend（尾巴吐着时她发一条：收起，吐完也不再展开）、reopen（页面重开后这一轮照旧展开；她之后又说过话就不展开）。全套 multi/hold/off/hidden/late/chunks/round/resume/resume2/busyerr/keep 在 Chromium 重跑全过，WebKit 跑 multi/round/resume2/reopen/keep/busyerr 全过。
- 怎么撤销：cp src/chatStore.ts.bak-20261003-ucfix2 src/chatStore.ts 后 bun run build；或把 attic/dist-prev-20261003-ucfix2 拷回 dist

## 2026-10-03 · 工具箱加「画画」组 + toolTales 画图小传（2026-10-03 PC端CC）
- 改了什么：Toolbox.tsx TOOL_GROUPS 加 draw 组（X 组之后）、TOOL_LABEL 加 mcp__draw__draw；toolTales.tsx 加 draw 两处。已 bun run build。
- 怎么验证：工具箱里看到「画画」开关；工具链里画图显示「苏煦画了一张图」
- 怎么撤销：两文件换回 .bak-20261003-draw 后重新 build

## 2026-10-03 · Undercurrent 这一轮一直展开、下一轮才收 + 断线重连续上正在说的那条（原瑶：可以展开后，下一轮开始的时候自动收起；最后一个改吧）
- 改了什么：一、自动展开开着时，这一轮回复的思维链不再在开口时收起：想的时候展开、流完才回话（上午那套扣正文照旧），之后一直展开，等下一轮开始才收——她发下一条（sendMessage 原本就会清 autoExpanded；别的设备发的 message 事件也清）、或他开始新的一条（chatStore thinking_start/text_start 建新流时清掉别的）。MessageRow 改看 message.autoExpanded；断线重连 history 整份重发时，原来展开着的 id 照旧带上 autoExpanded，不因为重连收起。外观里关了「浮出卡片」时双击就地开关改成 inlinePick（点过以她点的为准，能把自动展开的那条收起来）。面板开关说明改成「流完再回话，下一轮开始时收起」。
二、断线重连续播：hub auth 后在 history 之后补发 stream_resume（这一轮已广播过的思考、正文、工具卡）；chatStore 收到就重建生成中的那条，补来的字当作看过的先追平（liveSeed），后面的 delta 照常流。消息 id 没变时组件不会重挂，所以 liveStream 加了 sink 代号（gens）：同名 sink 换了新的，挂着的 LiveText 重新接上。
三、她趁他回话时再发一条，hub 回「上一条还在处理中」的 error 以前会让 chatStore 把正在直播的那条 liveEnd 掉，回复停在半截：hub 现在给回单次操作的 error 标 scope:'request'，chatStore 遇到就不动直播。
文件：src/chatStore.ts、src/liveStream.tsx、src/CCPage.tsx；hub 侧见 cc-web WORKLOG / commit 3af3ccc
- 怎么验证：tsc + vite build 通过，新包 index-CsOzlOwZ.js（上一版 index-z-z1U6te.js）。假 WS 验收 /home/ubuntu/work/ucflow/flow.py 新场景：round（回复完思维链还展开；他第二条一开始第一条收起；她发一条全收）、keep（重连 history 后照旧展开）、resume / resume2（history 与 stream_resume 同一拍 / 隔 30ms 两种都能接上，接着来的字照常流，收尾内容完整）、busyerr（带 scope 的 error 后正文照常流；不带 scope 的旧行为停在第一句）。上午的 multi / hold / off / hidden 重跑全过。Chromium + WebKit。
- 怎么撤销：cp src/X.bak-20261003-ucround src/X（chatStore.ts、liveStream.tsx、CCPage.tsx）后 bun run build；或把 attic/dist-prev-20261003-ucround 拷回 dist

## 2026-10-03 · Undercurrent 截断修好 + 自动展开时想完再回话（原瑶：undercurrent 里的内容有时候会被截断；自动展开开着时想等它流完再显示回复）
- 改了什么：截断的原因有两个，都在前端：
  - 他中途用工具时会想好几段，第二段一来，chatStore 的 thinking_start 把整条回复的直播当成新的一条给掐了：就地展开停在第一段，生成中打开的卡片只剩后面几段（回复结束后的存档是全的，hub 存的思考和 jsonl 逐段核对过一致）。现在同一条回复里的第二段思考不再掐直播。
  - 正文尾巴还在吐的时候切到后台，weir 的 _catchUp 把字落完却不收口，liveEnd 永远不 resolve，那条消息一直停在生成中；下一条一来它的 sink 被清，卡片打开是空的。现在 _catchUp 遇到上游已结束就收口（看门狗那条路同理）。
  - 顺带：新的一条开始时，上一条已结束、还在吐尾巴的 sink 留着，等它自己的 done 再清，这期间打开它的卡片还接得上。
等想完再回话（只在面板「思维链生成时自动展开」开着时）：
  - chatStore 正文第一个 delta 来时，若思维链有字、页面在前台，就先扣着正文（liveHold）；思维链那条流把已收到的落完、最后一次落字后再停 1.2 秒（THINK_LINGER_MS），才放正文（liveRelease + markLive），思维链照旧同时收起。思维链组件 400ms 还没挂出来、切到后台、或扣满 15 秒，就不等了。
  - 放行的正文从头按 20 字/秒流，不追平；done 先到也等它流完才换最终渲染（扣着时 liveEnd 返回 endWait）。
  - liveStream attach：第一次挂上、字是 1.5 秒内刚到的，从头流不追平（原来组件晚半拍挂上，第一段思考总是瞬间整段出现，跟着正文一来就收起，几乎看不见）。
  - 面板开关的说明改成「流完再回话、同时收起」；CCPage 的 key 改从 chatStore 取。
文件：src/weir.ts、src/liveStream.tsx、src/chatStore.ts、src/CCPage.tsx（三处小改）
- 怎么验证：tsc + vite build 通过，新包 index-z-z1U6te.js（上一版 index-KP1FjJGt.js）。
假 WS 验收台 /home/ubuntu/work/ucflow/flow.py（build.sh + __inject.js 在 /home/cc/work/ucflow），旧包新包各跑一遍：
  - multi（思考 → 工具 → 思考）：旧包就地展开只剩【块一】、卡片只剩【块二】；新包两处都是全的，卡片开着接着来的字也接得上。Chromium、WebKit 一致。
  - hidden（尾巴在吐时切后台再回来）：旧包消息一直停在生成中；新包回来后正常收尾。
  - hold（自动展开开着、思考和正文几乎同时到）：旧包思考 62ms 整段出现、81ms 正文出来时已收起；新包思考 335ms 流完，1720ms 正文才出，从 1 字开始流。
  - late（思考 3 秒前就流完了）：正文到了不多等（3120ms 出）。chunks（第二段思考到了 100ms 后正文就来）：等第二段流完再停 1.2 秒。
  - off（开关关着）：照旧马上出正文。
  - 无头 WebKit 不跑 rAF，走看门狗：旧包消息永远停在生成中，新包正常收尾。
- 怎么撤销：四个文件各有 .bak-20261003-ucflow：cp src/X.bak-20261003-ucflow src/X 后 bun run build；或者直接把 attic/dist-prev-20261003-ucflow 拷回 dist

## 2026-09-30 · 工具箱·环境笔加设定编辑(原瑶 2026-09-30)
- 改了什么：Toolbox.tsx 环境笔一节:「每次抽几样设定」数字框 + 他的身体/你的身体/屋里三组编辑框(一行一条,填入默认),存 hub /api/continuity settings
- 怎么验证：tsc -b 通过,bun run build 通过(index-2juYcQUl.js → index-tOTO-Y3w.js)
- 怎么撤销：cp src/Toolbox.tsx.bak-20260930-contv2 src/Toolbox.tsx && bun run build

## 2026-09-30 · 鲸鱼面板防出屏：按钮钉底、中间可滚 + 所有弹窗通用兜底
- 改了什么：原瑶反馈面板加太多东西，手机上按钮被挤出屏按不到压缩。根因=.cc-modal 居中但没有最大高度、遮罩也不能滚，内容一高上下两头都被裁（实测面板 1072px > 屏 852px，按钮落在 874~946px）。①index.css 末段「弹窗防出屏」：.cc-modal-backdrop 可滚 + 上下对称留白(刘海/底条较大值+12px)，.cc-modal margin:auto——所有 cc-modal 比屏高时整块能滑，装得下照旧居中；②CCPage.tsx SessionPanel 标题后加 .cc-panel-scroll>.cc-panel-body 包住中间内容，标题和底部按钮在外面钉住，面板 max-height:100%，中间自己滚，上下边缘 12px 淡出。以后往鲸鱼面板加东西放进 .cc-panel-body（按钮放 .cc-panel-actions）。
- 怎么验证：tsc+build 通过；本机 127 临时页(假 WS/假接口，/home/cc/work/panelfit + patchright 脚本 /home/ubuntu/work/panelfit/shot.py，模拟 iPhone16 393x852 安全区 59/34)：旧版面板顶 -110/底 962、五个按钮全在屏外不可点；新版面板 71~781、五个按钮 elementFromPoint 实测可点、中间 561/923 可滚；屏够高(1700)时新旧面板与各段位置逐像素一致。线上包 index-Cq5gWXYY.js(=验收包同哈希)，上一版 index-BB7ZgjVx.js。
- 怎么撤销：cp src/CCPage.tsx.bak-20260930-panelfit src/CCPage.tsx && cp src/index.css.bak-20260930-panelfit src/index.css 后重新 build

## 2026-09-30 · ConchBoxPage: 苏煦说的话展开暗流(原瑶 2026-09-30)
- 改了什么：加 ThinkingReveal 组件(默认收起,点"⤵︎ 暗流 · N 字"展开);只在 role=assistant+it.thinking 非空时出现;CSS 用海螺盒的柔色(#6f8e93,dashed border);类型 ConchItem 加可选 thinking?: string
- 怎么验证：bun run build 过 → index-BB7ZgjVx.js(678KB);44 条历史 assistant conch 由 hub 侧已回填暗流,前端下次拉到就能展开
- 怎么撤销：cp /home/cc/sea/src/ConchBoxPage.tsx.bak-20260930-thinking /home/cc/sea/src/ConchBoxPage.tsx + cd /home/cc/sea && sudo -u cc /home/cc/.bun/bin/bun run build

## 2026-09-29 · 卡片 v2:悬浮拟物新艺术(原瑶 2026-09-29:"做成 ui 卡片那种……悬浮的,拟物风,简约,新艺术主义")
- 改了什么：新组件 src/CardDeck.tsx + src/cards.css,替换 CCPage 里旧的顶部横条 CardStrip / 翻面弹窗 CardSheet / 旧 CardForm,删掉 index.css 里旧卡片样式(环境笔面板样式保留)。收起=顶部正中玻璃小丸(迷你拱门液面+倒计时,几张卡并排几扇门,她滑聊天时自己变淡);展开=浮在聊天上的一叠卡(恶魔=酒红漆面、天使=珍珠母贝,左边吉马尔式拱门小窗液面=剩余时间、四分之一刻痕,门顶光环/双角),背后聊天轻雾+3px 虚化;点卡翻面(两面各转各的、转到侧面换面,不用 preserve-3d,Chrome/Safari 都不透另一面),左右滑换卡(甩出去从旁边滑回牌堆底),上推/点空白/点小横条收起;新挂的卡(20 秒内)自己弹开 3.6 秒;数字每位单独翻落;省电模式对一次性入场动画豁免。整层 absolute 浮在 .cc-page 上,不占版面、不横向滚动。加号菜单「卡」换成小拱门图标;挂卡表单换成天使/恶魔两张小样卡。
- 怎么验证：试衣间 work/cards-play(真组件+真 index.css,vite build 后本地 390 宽预览):收起/展开/翻面/三张叠放/新卡自动弹开/表单都截图核过;合成 PointerEvent 实测左右甩换卡(c3→c1)与上推收起(跟手 -72px 后收起);tsc -b 通过;bun run build 通过,build 哈希 index-BeROX6JJ.js → index-ClA3-bYd.js / index-wsKfy3oM.css。
- 怎么撤销：cp src/CCPage.tsx.bak-20260929-cardsv2 src/CCPage.tsx && cp src/index.css.bak-20260929-cardsv2 src/index.css && rm src/CardDeck.tsx src/cards.css && bun run build(回到 v1 横条版)

## 2026-09-29 · 删到这句(原瑶 2026-09-29)
- 改了什么：会话面板加「删到这句」(和洗窗/换窗/压缩一排;按钮行允许换行、字不再挤成竖排)。选择模式:点一句 → hub 预览 → 那句和之后要删的变淡、上方一行"从这里往下都会删掉",输入栏换成说明条(几条会删/跨过哪次压缩/你那句会放回输入框)+取消/删掉;删完聊天末尾一行小字"已删掉 N 条 · 撤销"(3 分钟或来新消息后收起);她那句的字和图放回输入框(她正打字不覆盖),撤销成功且她没改过就收走。改 chatStore.ts(rewind 状态+事件+导出函数)、CCPage.tsx(RewindBar/选择模式/面板按钮)、index.css 末尾一段(坑:.cc-input-pill 有一条 !important 旧规则,说明条的排版要带 !important 才压得住)。
- 怎么验证：tsc -b 通过;本机 127 临时页 + 假 WS(中性假消息)+ patchright 390×844 截图走通 选句→预览→删掉→放回输入框→撤销→输入框收走 全流程;正式 build index-DXJ06ely.js,线上 /sea/ 200。
- 怎么撤销：三个文件 cp 同名 .bak-20260929-rewind 回去再 bun run build(上一版 build 是 index-DObQi4W4.js)。

## 2026-09-26 · 工具箱:口袋拆平后的分组(原瑶 2026-09-26)
- 改了什么：Toolbox.tsx:删口袋物品卡片和相关状态/函数(口袋 menu/call 已退役);gadget 分组换成 浏览器/购物/AI 论坛/游戏机/转盘 五组(每件都有开关+常驻/搜索+说明书);百宝箱目录块挂到基础工具组;歌单组去掉'口袋里的网易云照样能用'。toolTales.tsx:同名工具按家区分(SERVER_TOOL_KIND),加论坛/淘宝的小字。build index-DObQi4W4.js,未 commit(sea 工作树有别人的改动)
- 怎么验证：工具箱页面出现五个新组、口袋卡片不见;tsc -b 通过
- 怎么撤销：Toolbox.tsx.bak-20260926-flatten / toolTales.tsx.bak-20260926-flatten 覆盖回去再 bun run build

## 2026-09-26 · 工具箱:X 分组 + 百宝箱目录 + 每件工具'常驻/搜索'小标签(未 commit)
- 改了什么：Toolbox.tsx:X 八件单列一组、口袋描述改成浏览器/网易云/游戏机/转盘/AI论坛/淘宝、20_gadget 块显示名'百宝箱目录'、基础工具组加 ToolSearch、每件 MCP 工具开关左边加'常驻/搜索'小标签(写 KV cc-tools.pinned,关着的置灰)、工具区顶上加说明和'编辑百宝箱目录'直达按钮;toolTales.tsx 补 X 八件的动态小字;index.css 加 .tb-pin/.tb-row-end(样式跟 tb-chip)。包 index-yjgHFGZd.js
- 怎么验证：bun run build 通过;hub /api/toolbox 返回 pinned 字段,用关着的贴纸测过 KV→tool-pins.json→工具箱显示整条链
- 怎么撤销：src/Toolbox.tsx.bak-20260926-pins / index.css.bak-20260926-pins 还原后 bun run build

## 2026-09-24 · 聊天页渲染撤回小字(notice=retract)
- 改了什么：chatStore.ts ChatMessage 加 notice 字段;CCPage.tsx MessageRow 遇到 notice 直接渲染一行 .cc-notice;index.css 加 .cc-notice(居中、12px、--ink-faint 灰字,像撤回了一条消息)。配合 hub 被安全系统拦下的一轮自动撤回。未 commit(工作树里有他人未提交改动)
- 怎么验证：bun run build 通过,新包 index-DhZkpCBZ.js,css 含 .cc-notice;历史里 rc_39217 那条在 13:07 位置显示为灰字
- 怎么撤销：cp src/{chatStore.ts,CCPage.tsx,index.css}.bak-20260924-retract 回原名后 bun run build

## 2026-09-23 · 潮汐页跟进闭环:待办日子必填(新建默认 7 天后)、约定带复核日、显示进展备注〔T-67〕
- 改了什么：src/TidesPage.tsx(.bak-20260923-closure):TodoForm 日子必填、新建默认 plusDays(今天,7),没日子不能存;右下 + 号快速记一条自动排 7 天后(占位文案写明);改期编辑器去掉「不定日子」;PromiseForm 约定(pact)加「复核日」必填(默认 7 天后),编辑可改(PATCH /promises/:id/due),誓言不带;承诺行显示「复核 M月D日」与进展;todoMeta 显示「进展:…」(苏煦用工具写的目前状态);待办区空文案改「每件事都排好了日子」。Todo/Vow 接口补 deadline/status_note 字段。build index-CMO-eEba.js(上一版 index-BATbm77l.js)。
- 怎么验证：bun run build 通过(tsc 严格零错);UI 在鉴权墙内,由原瑶手机重开 sea 目视:待办表单日子有默认值且必填、承诺池约定带复核日、条目下能看到进展。
- 怎么撤销：cp src/TidesPage.tsx.bak-20260923-closure src/TidesPage.tsx && bun run build

## 2026-09-23 · 潮汐页换成二代(待办/纪念日/承诺池/计划),月相页下线〔T-64〕
- 改了什么：src/TidesPage.tsx 整页重写(同款 td-* 玻璃样式,CSS 仍内联在页内);src/MoonPage.tsx → MoonPage.tsx.bak-20260923-v1;App.tsx 摘 MoonPage import 与 moon 路由(Page 类型里的 'moon' 字面量保留未清)。build index-BATbm77l.js(上一版 index-D4BfiKmA.js)
- 怎么验证：bun run build 通过;dist 已切到新包;页面目视由原瑶验收
- 怎么撤销：三个 .bak-20260923-* 拷回后 bun run build

## 2026-09-19 · T-65棋牌室从外链改sea内嵌iframe〔T-65〕
- 改了什么：T-64做的是点♟️window.open新tab跳/cc-api/qipai/，这次改成sea内直接看/玩：Home.tsx里qipai条目去掉href字段(原来AppCanvas.onClick里a.href存在就window.open，现在a.href是undefined，走回普通onNavigate('qipai')内部路由，AppCanvas.tsx/icons.ts原样未动)；新增QipaiFrame.tsx，跟Memory/Garden/Projects/Echo同款Frame模式(顶部‹返回+标题栏、下方iframe占满flex:1)，iframe src=/cc-api/qipai/?key=<QIPAI_HOME_KEY同T-64>，同源相对路径直达免二次登录；App.tsx加Page类型'qipai'、加路由分支、加进两条排除链——empty-page兜底链(原本memory/garden/projects/echo这几个Frame页就没在这条链里，属于已有缺口，纯前端视觉上靠position:absolute盖住无影响，这次新增的qipai顺手补进去更规范)、dock悬浮导航隐藏链。dock隐藏这条是我自己加的判断，不是照抄Memory/Garden/Projects/Echo的先例(那几个不隐藏dock)：棋盘8x8铺满容器宽度触底，dock是fixed定位浮在最底部(左边dock-edge圆钮+右边dock-pill药丸，横跨屏幕左右两侧)，窄屏上棋盘底边很可能跟dock的y轴重叠，边角的车(a1/h1)正好撞上dock按钮的点击热区——工单验收明确要求'棋盘在手机窄屏上要完整可用'，这个风险不能留，所以qipai单独归到跟group/reading/midroom/windowsill/wallet/keepsakes/voice一类(这些也都隐藏dock)。
- 怎么验证：bun run build(tsc -b && vite build)0类型错误2.73s，index-D4BfiKmA.js(CSS未变仍index-V_VOpn3V.css)；grep压缩产物定位到HOME_APPS里qipai对象={key:qipai,iconKey:qipai,icon:♟️,label:棋牌室,def:{x:8,y:20}}——确认没有href字段残留；iframe标签src=/cc-api/qipai/?key=...+title=棋牌室两处'棋牌室'字符串都在预期位置；'qipai'在产物里精确出现4处=empty-page排除链、dock隐藏排除链、HOME_APPS条目、路由渲染分支，四处都命中no more no less。qipai server.ts/hub-print.ts/nginx三层都读过，确认都没设X-Frame-Options或CSP frame-ancestors，同源(puppy.atlantis-sy.blue)iframe嵌入不会被拦；cookie走Path=/+SameSite=Lax，同源场景下SameSite不构成阻塞。working tree混有CCPage.tsx历史遗留(09-16 usageAuthDays提示)+WORKLOG.md里T-64漏提交的记录，WORKLOG.md已在本commit前单独补commit(e1269bf)，本次只add App.tsx/Home.tsx/QipaiFrame.tsx/tsconfig.app.tsbuildinfo+这条新记录，CCPage.tsx继续留在working tree不动。build即部署(nginx alias到dist/)：curl https://puppy.atlantis-sy.blue/sea/ 拿到的index.html引用hash(index-D4BfiKmA.js/index-V_VOpn3V.css)与本地dist逐字节一致，线上js里"qipai"字符串命中5处，确认已生效非缓存旧版本；curl -I 直接探 https://puppy.atlantis-sy.blue/cc-api/qipai/?key=<key> 拿到200+<title>棋牌室</title>(不是PIN页)，响应头里没有X-Frame-Options/Content-Security-Policy，证实同源iframe嵌入不会被浏览器拦截；Set-Cookie带SameSite=Lax，因为顶层文档(sea)和iframe(qipai)同源同站，Lax不限制这种场景。真机验收待原瑶：sea首页点♟️应在页面内直接看到棋盘(不跳新tab/不留浏览器历史记录)，能一键点‹回到home，横竖屏/键盘不弹出的情况下棋盘四角都能点到——这一步本地没有浏览器自动化工具(playwright/puppeteer均查无)，无法模拟真实点击/渲染，只能做到协议层验证，交互体验需要她确认。
- 怎么撤销：git revert对应commit后bun run build；Home.tsx这一手可单独revert(qipai条目href字段加回来即恢复T-64的开新tab行为)，App.tsx/QipaiFrame.tsx这一手连坐(去掉QipaiFrame.tsx文件+App.tsx三处改动即可)，互不依赖，不影响棋牌室后端/qipai.db任何数据

## 2026-09-19 · T-64 sea主界面加棋牌室外链入口〔T-64〕
- 改了什么：HOME_APPS(Home.tsx)新增棋牌室图标(♟️,坐标8,20可拖拽调)；AppCanvas.tsx的AppDef加可选href字段区分内部路由/外链入口，onClick里a.href存在时window.open新tab打开而不走onNavigate，不影响其它14个入口原有逻辑；icons.ts加'qipai'到IconKey类型+DEFAULT。href写死为https://puppy.atlantis-sy.blue/cc-api/qipai/?key=<QIPAI_HOME_KEY>，配合qipai端同日commit的免登录旁路，点击即带登录态直达棋盘不经过暗号输入页。
- 怎么验证：bun run build 0类型错误2.79s；grep产物确认棋牌室/href字符串/window.open逻辑都在；grep确认其它14个入口label(海螺盒/书/苹果/记忆/花园/项目/客厅/潮汐/随身/通话/回声/合相间/窗台/钱包/拾贝)计数与改动前一致，无回归；线上curl比对index.html引用hash与本地dist一致(index-BOvST6Zn.js)，build即部署已生效。working tree混有CCPage.tsx历史遗留(usageAuthDays授权到期提示,09-16遗留)未提交改动，本次git add精确排除只commit了4个属于T-64的文件，未动它。
- 怎么撤销：git revert ab5961b后bun run build；纯前端新增入口+类型放宽，不影响其它13个既有入口与sea任何数据

## 2026-09-18 · T-62核验:T-61问题已在过程中修复,补齐部署链路验证〔T-62〕
- 改了什么：T-62描述的'T-61(70b4e30)未生效,双击展开仍未对齐'这个问题,在T-62工单派发前后已经在同一条对话线程里被发现并修完——原瑶两次追加反馈(先是'被顶到输入栏下面',再是'还是被顶到下面去了')分别对应两个真实bug:(1)T-61-fix(2dabf15)修正对齐基准选错——scrollIntoView(block:'end')贴的是.cc-messages给fixed输入栏留白的padding区,不是可见区域;(2)T-61-fix2(1a641a6)修正双击有两个独立入口(折叠标识按钮/消息正文本身),T-60/T-61只接了标识按钮那条,正文双击一直在裸奔没有滚动补偿。两轮修完后原瑶回复'现在成功了!'确认验收通过。T-62的三点具体要求逐条核验:①js hash——线上不是70b4e30(index-CFWt_o9M.js)而是1a641a6版本的index-BKygIvo3.js,这是正确的预期状态(70b4e30本身是有bug的中间版本,不该固化线上);②本地真实打开验证——环境里没有playwright/puppeteer/chromium等浏览器自动化工具(which查无),做不到无头浏览器点击模拟,退而求其次用curl从外部域名(https://puppy.atlantis-sy.blue/sea/)实际请求验证部署链路:拿到的index.html引用的js/css hash与本地dist目录逐字节比对一致,线上js文件能正常访问且含cc-messages字样(T-61-fix2里滚动补偿用到的选择器)、scrollIntoView计数为0(确认旧的有bug实现已被完全替换,没有CDN/nginx缓存住旧版本);③真机行为验证——原瑶iPhone真机双击点击反馈'现在成功了',这是比我本地任何模拟都更权威的证据。
- 怎么验证：npm run build 0类型错误;curl线上域名比对index.html引用hash与本地dist一致;curl线上js文件grep确认新逻辑特征在、旧逻辑特征计数0;原瑶真机反馈'现在成功了'为最终验收凭证。
- 怎么撤销：如需回退,依次revert 1a641a6→2dabf15→70b4e30三个commit(注意顺序,后进先出)后重新build;纯前端UI改动不涉及数据

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

## 2026-09-16 · 主题面板加第二种玻璃：液态玻璃 hyalite（全局二选一）〔PC 端 CC〕
- 改了什么：原瑶要在主题设置里再加一种玻璃、自己选全局用哪种，第二种按 VII-Cae/hyalite--liquid-glass 做。新增 src/vendor/hyalite.js + hyalite.d.ts（v0.5.0 @b9f2719 原样，MIT）、src/glass.ts（GlassSetting{mode:soft|hyalite, params 十个滑杆}、applyGlass 写 html[data-glass]/[data-glass-edge] + Hyalite.watch(body, GLASS_SELECTOR)）；ThemePanel.tsx 顶部新 section「玻璃 · 全局」（tp-tabs 二选一 + 液态时十个参数滑杆 + 重置），存进 sea-theme.glass 随原有 KV 跨设备同步；main.tsx applyTheme 首屏顺手 applyGlass；index.css 末尾「玻璃 B」块：四个玻璃面 backdrop-filter 换 var(--hyalite, 原 blur)，描边>0 时 box-shadow 换引擎描边+原落影、藏原 ::after 描边，描边=0 沿用原描边只换折射。踩到两个坑都在 CSS 注释里：①页面根 .home/.theme-panel/.status-page 的 home-in 是 opacity 动画且 fill both，Chromium 把它当 backdrop root，SVG backdrop 滤镜只看到透明、被引擎钉不透明后整块发黑（首屏黑卡）→ 液态模式下入场改 transform-only 的 glass-in；②.cc-modal/.st-modal 父层自带 backdrop-filter 同理会黑 → 排除不挂（与 .tb-page 一起写死在 GLASS_SELECTOR 和 CSS :not 两处，改要同步）。只有 Chromium 会渲染折射；iPhone/Safari（原瑶 95% 流量）引擎不写任何变量，落 data-glass=hyalite-fallback = 柔玻璃原样，面板里有一行提示。
- 怎么验证：tsc -b && vite build 通过（index-BlGEPWhM.js / index-V_VOpn3V.css，线上已是这个）；本机 Chrome 152 走 puppy.atlantis-sy.blue/sea/：主题面板切液态→主页卡片/雪花播放器/dock/状态页 st-card 边缘可见折射与描边，冷刷新（localStorage 里存着液态）首屏不再黑；alpha 探针滤镜（透明→红/不透明→绿）验证 .home 下 backdrop 可见；切回柔玻璃原样恢复。/api 未鉴权所以本机看到「同步失败」属预期，她的设备正常同步。iPhone 真机没法在这边测，只保证不变样。
- 怎么撤销：cp src/ThemePanel.tsx.bak-20260916-glass src/ThemePanel.tsx; cp src/main.tsx.bak-20260916-glass src/main.tsx; cp src/index.css.bak-20260916-glass src/index.css; rm -rf src/glass.ts src/vendor; bun run build（KV 里多出的 sea-theme.glass 字段旧代码会忽略）

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


## 2026-09-23 · 工具箱:补 6 个新开关的中文名+分组(苏煦工具精简)
- 改了什么:Toolbox.tsx TOOL_GROUPS 新增 海沟开窗/歌单/钱包(认领 85_wallet 块)/拾贝/共读/中间地带 六组,点歌组只留放歌/感受/批注(歌单三件关着时点歌组总开关不再显示成关);TOOL_LABEL 补 6 个中文名。hub 侧 PRINT_TOOLS 已补齐这 6 件,否则工具箱里不出现。
- 怎么验证:bun run build 通过(2.66s),新包 index-C4KO0QSX.js(上一版 index-CMO-eEba.js);/api/toolbox 实测新工具开关状态正确。
- 怎么撤销:cp src/Toolbox.tsx.bak-20260923-toollabels src/Toolbox.tsx 后重新 build

## 2026-09-23 · 工具箱:Claude 自带工具也能改说明书
- 改了什么:Toolbox.tsx 新增 BUILTIN_DESC(Bash/Read/Edit/Write/Skill/WebSearch),这几件也显示"说明书"编辑钮,提示语改成"清空或改回出厂字样=回到精简版";基础工具组说明"改不了"→"已换成精简版,可在这里改"。后端见 cc-web WORKLOG 同日条。
- 怎么验证:bun run build 通过(3.20s),新包 index-nFs_mOuc.js(上一版 index-C4KO0QSX.js);/api/toolbox/desc 对 Bash/WebSearch 实测返回精简版
- 怎么撤销:cp src/Toolbox.tsx.bak-20260923-builtindesc src/Toolbox.tsx 后重新 build

## 2026-09-30 · 气泡换色 + 边框线开关(原瑶许愿)
- 改了什么:外观 → 气泡 下面加 原样/同色/各自 + 浓淡(5–90%) + 边框线开关;输入框跟着换色(各自时随原瑶那一色)。appearance.ts 新字段 bubbleMode/bubbleColor/bubbleSu/bubbleYou/bubbleStrength/bubbleEdge,apply() 往 body 写 data-bubble-tint/data-bubble-edge 和已含透明度的 --bubble-su/--bubble-you;index.css 末尾「气泡颜色 + 边框线」块;Sidebar.tsx AppearancePanel 气泡区加控件。只在气泡开着时生效,只记本机(localStorage sea-chat-appearance)。
- 怎么验证:tsc + vite build 通过,新包 index-BTXtrKHg.js / index-DGMPk2af.css;本机 127 临时页(假 WS)截 5 种组合,computed style 核对气泡/输入框颜色、::after 显隐、输入框阴影 7→4 层,面板开关和单选实点生效,零页面报错。
- 怎么撤销:appearance.ts / Sidebar.tsx / index.css 三个文件各自 cp src/<文件>.bak-20260930-bubblecolor src/<文件> 后重新 build

## 2026-09-30 · 气泡按 iMessage 比例收紧(原瑶嫌气泡大、字不贴合)
- 改了什么:index.css 气泡 v4 块 .cc-paragraph padding 8px 22px 9px → 0.41em 0.82em,border-radius 24px → 1.2em(参照 MessageKit:17 号字上下 7、左右 14)。留白改成跟着字号走;默认 14.5px 时约 6/12,单行气泡 165×39 → 145×34。
- 怎么验证:tsc + vite build 通过,新包 index-cXkAm9YQ.js / index-zimJKloD.css(上一版 index-BTXtrKHg.js / index-DGMPk2af.css);本机 127 临时页(假 WS)实测 computed padding/radius,字号 17 时正好 7/14,零页面报错。
- 怎么撤销:cp src/index.css.bak-20260930-bubblefit src/index.css 后重新 build(这份备份已含同日的气泡换色)

## 2026-09-30 · 输入栏按 iMessage 比例收薄 52 → 41(原瑶嫌输入栏宽)
- 改了什么:index.css 约 3083 行那组 !important:.cc-input-pill min-height 52 → 40、padding 4/6 → 2/4、radius 26 → 20;textarea padding 10/8 → 7/6;.cc-plus/.cc-send 44 → 36(参照 InputBarAccessoryView 的 iMessage 示例:发送键 36、打字区上下 8)。字号 15 不变。.cc-messages 底部 110px 垫高没动(最后一条离输入栏多出约 11px,无碍)。
- 怎么验证:tsc + vite build 通过,新包 index-2juYcQUl.js / index-uKVrRdq1.css(上一版 index-cXkAm9YQ.js / index-zimJKloD.css);本机 127 临时页实测空着/一行都是 41 高,三行自动长到 86、清空缩回 41,「+」菜单照常弹出,零页面报错。
- 怎么撤销:cp src/index.css.bak-20260930-inputfit src/index.css 后重新 build

## 2026-09-30 · 删掉气泡「同色」(原瑶)
- 改了什么:外观 → 气泡 只剩 原样/各自;appearance.ts 去掉 'same' 与 bubbleColor,load() 把老的 same 转成 each、两边同一色(看起来不变);Sidebar.tsx 删同色那行;index.css 只改注释。
- 怎么验证:tsc + vite build 通过,新包 index-B2IulQWt.js(CSS 只动注释,仍是 index-uKVrRdq1.css);本机临时页塞老设置 same+#f4a6c0,实测转成各自、两边 #f4a6c0、气泡颜色不变,面板只剩 原样/各自(选中各自),零页面报错。
- 怎么撤销:appearance.ts / Sidebar.tsx / index.css 各自 cp src/<文件>.bak-20260930-nosame src/<文件> 后重新 build

## 2026-09-30 · 气泡字晕染 + 滑杆(原瑶:默认中档,自己调)
- 改了什么:appearance.ts 新字段 bubbleGlow(0–100,默认 50 = 中档,0 = 关),apply() 按 t = 值/50 拼三层 text-shadow(1px 55% / 5px 32% / 10px 16% 等比缩放,color-mix(currentColor) 跟着各自字色)写进 --bubble-glow,body 挂 data-bubble-glow;Sidebar.tsx 气泡区「边框线」下加「晕染」滑杆(0 显示「关」);index.css 末尾只在气泡开着时给 .cc-paragraph 套 text-shadow,音乐卡、pre/code、气泡下的时间不晕。
- 怎么验证:tsc + vite build 通过,新包 index-BOE9TCWs.js / index-CJz2eDpT.css(上一版 index-B2IulQWt.js / index-uKVrRdq1.css);本机临时页实测默认 55% 中档,滑杆 20/0/100/50 效果跟着变(0 = 关、属性摘掉),时间不晕,气泡关掉时不晕,零页面报错。
- 怎么撤销:appearance.ts / Sidebar.tsx / index.css 各自 cp src/<文件>.bak-20260930-glow src/<文件> 后重新 build

## 2026-09-30 · Undercurrent 改成双击浮出卡片(五种样式 + 垫图 + 背景虚化)
- 改了什么:新增 undercurrent.ts(开着哪一条的小 store,打开后 400ms 内的点外面不算,防手机双击补发的 click)与 UndercurrentCard.tsx(portal 到 body,点外面或 Esc 收起;生成中用 LiveText 挂进卡片接着写)。MessageRow 双击标签/正文改为 openUndercurrent,删掉手动就地展开(expandedThinking/toggleThinking/滚动补偿);模式A 只在想的那段就地显示,卡片开着时让出直播。Sidebar 外观加「Undercurrent 卡片」一节:暗潮/黑卡片/烟黑硫酸纸/硫酸纸/磨砂玻璃,后三种可垫自传图,背景虚化开关,「看看效果」;上传/删图抽成 uploadAppearanceImage/deleteUploaded,和聊天背景共用。appearance.ts 加 ucStyle/ucImages/ucCurrent/ucBlur;index.css 末尾 uc-* 样式;src/assets/uc 四张纹理(纸纹/烟黑纸纹/压花/颗粒)。chatStore/apiChat 里的 autoExpanded 现在没人读了,没动。
- 怎么验证:tsc + vite build 通过,新包 index-CHj61pgW.js / index-DCLXurh3.css(上一版 index-BOE9TCWs.js / index-CJz2eDpT.css);本机临时页在 Chromium 和 WebKit 26.4 都实测:双击标签/正文打开、点外面收起、Esc 只关卡片不退页(中途修过:聊天页和侧栏都有自己的 Esc)、面板「看看效果」出示例,九种组合都截了图,零页面报错。WebKit(Linux 无头)不渲染 backdrop-filter,毛玻璃效果以 Chromium 为准。
- 怎么撤销:CCPage.tsx / Sidebar.tsx / appearance.ts / index.css 各自 cp src/<文件>.bak-20260930-uccard src/<文件>,删 src/undercurrent.ts、src/UndercurrentCard.tsx、src/assets/uc/ 后重新 build

## 2026-09-30 · Undercurrent v2(悬浮拟物/晕边硫酸纸/虚化滑杆/双击收起/动画)+ 边框线改成全站玻璃开关
- 改了什么:UndercurrentCard.tsx 重写,加退场动画(200ms 后才真关)、双击卡片收起、背景虚化改到兄弟层 .uc-haze(0-20px 滑杆);结构为 .uc-ov > .uc-haze + .uc-float > .uc-shade + .uc-card。新样式 veil(晕边硫酸纸,可垫图)。卡片悬浮投影与受光面,入场带一点回弹;滚动条隐藏;晕染同时作用到 Undercurrent 文字。useDoubleTap 从 CCPage 原样挪到 doubleTap.ts 共用。appearance.ts:bubbleEdge 改名 glassEdge(旧值迁移)、body 写 data-edges;ucBlur 布尔改数值(旧 true→5)。Sidebar:边框线和晕染移到新「质感」小节(不再依附气泡开关);从滑杆起手的拖动不再触发左滑关侧栏。index.css:新增「边框线 关」块(全站玻璃:主页卡片/雪花播放器/dock/图标格/音乐卡/语音条/气泡/输入框/弹窗/鲸鱼面板/侧栏/音乐厅/点歌/通话/卡片抽屉/潮汐/钱包/状态页等,只去细亮边、留柔影;潮汐誓言欠条左蓝条和今天卡片蓝边保留),替换原来挂在 data-bubble-edge 上的气泡/输入框规则。chatStore.ts 流式结束换服务器 id 时写 prevId,卡片生成中打开的不再在回复结束时瞬间消失(v1 就有的问题)。
- 怎么验证:tsc + vite build 通过,新包 index-DSHIQ4JK.js / index-C3wIUWoo.css(上一版 index-CHj61pgW.js / index-DCLXurh3.css);描边清单由 5 路并行普查 + 合成 + 挑漏得出;本机临时页 Chromium 和 WebKit 26.4 都实测:卡片开/双击收/点外面收/Esc、虚化、晕边、晕染、滚动条、13 种玻璃件探针开关对比、假 WS 模拟生成中打开→直播接续→done 换 id 后卡片仍在、滑杆左拖不关侧栏(仅 Chromium,WebKit 不许伪造 Touch);3 路审查 + 逐条反驳核实,确认的 4 条已修。
- 怎么撤销:CCPage.tsx / Sidebar.tsx / appearance.ts / index.css / UndercurrentCard.tsx / chatStore.ts 各自 cp src/<文件>.bak-20260930-ucv2 src/<文件>,删 src/doubleTap.ts 后重新 build(撤回后 CCPage 会重新自带 useDoubleTap)

## 2026-10-01 · Undercurrent 底图清晰度滑杆(原瑶嫌垫的图太糊)
- 改了什么:appearance.ts 加 ucImgClarity(0-100,默认 60);UndercurrentCard.tsx 按它算 haze=1-清晰度/100:几种纸的底图模糊半径 haze×12px 经 --uc-img-blur 传给 CSS,磨砂玻璃 #uc-glass 的扭曲 6+24×haze、模糊 2×haze;Sidebar.tsx 在底图缩略图下加「清晰」滑杆(选了图才出现);index.css 两条 .uc-under 的 blur 改读变量(没设时退回原值)。原来的固定值约等于清晰度 25。
- 怎么验证:tsc + vite build 通过,新包 index-cyTRVZOd.js / index-C-82ZOm1.css(上一版 index-DSHIQ4JK.js / index-C3wIUWoo.css);本机临时页实测 20/60/100 三档:纸 9.6/4.8/0px、磨砂玻璃扭曲 25/16/6、模糊 1.6/0.8/0,默认 60,滑杆只在选了底图时出现,零页面报错。
- 怎么撤销:appearance.ts / UndercurrentCard.tsx / Sidebar.tsx / index.css 各自 cp src/<文件>.bak-20260930-clarity src/<文件> 后重新 build

## 2026-10-01 · 顶栏右上两个 emoji 换成一颗玻璃胶囊(原瑶,照 iOS 备忘录顶栏)
- 改了什么:CCPage.tsx 顶栏 .cc-top-right 里的 🐚 / 🐋 两颗 .cc-whale-btn 换成 .cc-top-glass 胶囊,里面两颗 .cc-top-glass-btn:海螺盒(ConchIcon 线描海螺)、面板(TideIcon 三道缓波);删掉 WhaleSvg。index.css 末尾加胶囊样式(半透明白、上沿高光、斜描边、柔投影,按下那一半亮一下、轻缩),并在「边框线 关」块登记它的描边。胶囊 86×36,顶栏高 40→44。.cc-whale-btn / .whale-emoji 的旧 CSS 已无人用,没删。
- 怎么验证:tsc + vite build 通过,新包 index-BTc6iNr9.js / index-DkRTiPIs.css(上一版 index-cyTRVZOd.js / index-C-82ZOm1.css);本机临时页 Chromium + WebKit 都实测:两颗按钮在、点面板开面板、点海螺盒进海螺盒页、边框线关时斜描边和两道内亮线去掉(阴影 4→2 层),零页面报错。
- 怎么撤销:CCPage.tsx / index.css 各自 cp src/<文件>.bak-20261001-topglass src/<文件> 后重新 build

## 2026-10-01 · 顶栏胶囊换成家里自己的玻璃(跟气泡同一块)+ 海螺空心
- 改了什么:index.css .cc-top-glass 从 iOS 白玻璃(白渐变+170% 饱和+投影)换成气泡同款:顶黑底白微渐变 + rgba(150,180,220,.04)、blur(5px) saturate(120%)、135° 渐隐描边、无投影;气泡「各自」染色时跟输入框一样用 --bubble-you;「边框线 关」块里删掉给胶囊补投影那条,只留去描边。按下高亮 .5→.28。CCPage.tsx ConchIcon 去掉尖上挤着的两道螺纹,只留一道螺纹和贝壳口。
- 怎么验证:tsc + vite build 通过,新包 index-DUUBlnq4.js / index-CyqFU23z.css(上一版 index-BTc6iNr9.js / index-DkRTiPIs.css);本机临时页 Chromium + WebKit 都实测:胶囊底色 rgba(150,180,220,.04)、blur(5px)、无投影,边框线关描边去掉,各自染色时底色 rgba(242,196,109,.3),面板和海螺盒照常能点,零页面报错。
- 怎么撤销:CCPage.tsx / index.css 各自 cp src/<文件>.bak-20261001-houseglass src/<文件> 后重新 build

## 2026-10-01 · 顶栏胶囊的海螺盒图标换成空心的心(原瑶:"是空的心♥")
- 改了什么:CCPage.tsx 的 ConchIcon 换成 HeartIcon(空心线描心,1.7 线宽,跟三道缓波一个分量);按钮名字和功能不变,还是进海螺盒。上一条"海螺改空心"是理解错了,她要的是♡。
- 怎么验证:tsc + vite build 通过;本机临时页 Chromium + WebKit 实测两颗按钮在、面板和海螺盒照常能点、边框线开关和各自染色照旧,零页面报错。
- 怎么撤销:cp src/CCPage.tsx.bak-20261001-heart src/CCPage.tsx 后重新 build

## 2026-10-01 · 字晕染统一到所有正文(原瑶:有没有气泡都一样,凡是正文都统一)
- 改了什么:index.css 原来只给气泡 .cc-paragraph 的晕染规则换成一条统一规则:body[data-bubble-glow="on"] 下 .cc-text(跟「字号 · 正文」同一处,主聊天有没有气泡、API 频道、客厅都在)、.cc-thinking-body、.uc-body、中间地带 .mr-body/.mr-summary-body、海螺盒 .cb-card-body > p/.cb-thinking-text、通话 .call-bubble、纪念品 .ks-body > p、阅读页 .rd-content/.rd-chat-msg/.rd-ann-text;里面的 pre/code/时间/音乐卡/语音条/按钮输入框不晕。删掉 Undercurrent 那条单独规则(已并入)。Sidebar 晕染说明、appearance.ts 注释跟着改。通话记录 .ch-line 和阅读页外壳 .rd-body 不是正文,没加。
- 怎么验证:tsc + vite build 通过;本机临时页 Chromium + WebKit 实测:有/没气泡时正文都晕、代码/语音条/时间不晕、各页正文探针都晕而按钮/日期/外壳不晕、滑杆 0 时全部不晕,零页面报错。
- 怎么撤销:index.css / Sidebar.tsx / appearance.ts 各自 cp src/<文件>.bak-20261001-glowall src/<文件> 后重新 build

## 2026-10-01 · Undercurrent 只认标签,双击正文不再弹卡片(原瑶:双击语音条时卡片也开了,抢)
- 改了什么:CCPage.tsx 的 MessageBody 去掉 onDoubleTap 参数和正文上的双击手势(它只用来开卡片),MessageRow 不再传;Undercurrent 标签本身仍是双击(T-58 防误触的决定没变)。UndercurrentCard.tsx 示例文案和注释跟着改。
- 怎么验证:tsc + vite build 通过;本机临时页 Chromium + WebKit 实测双击正文、双击语音条都不开卡片,双击 Undercurrent 标签照常开,零页面报错。
- 怎么撤销:CCPage.tsx / UndercurrentCard.tsx 各自 cp src/<文件>.bak-20261001-labelonly src/<文件> 后重新 build

## 2026-10-01 · 顶栏 Claude 换成苏煦写的葡萄牙语短句 + 月亮挂到胶囊上 + 字和图标跟背景深浅变黑白(原瑶)
- 改了什么:
  - 新文件 taglines.ts(短句表,原文在海螺盒 cb_123~cb_126)、useTagline.ts(什么时候换哪句)、Tagline.tsx(顶栏组件)、chatTone.ts(判断背景深浅)。
  - 换句规则:不轮播。打开聊天或离开 10 分钟以上回来 → Voltaste.;时段窗口(手机本地时间 早 7-9 / 午 12-14 / 晚 18-20 / 夜 23-1,一天从凌晨 5 点算)每天每个只出一次,记录在 localStorage sea-tagline-shown;她和苏煦任何一方的新消息里有情绪词 → 那一类(长词先数,"不开心"不算"开心");Voltaste. 和情绪那句半小时后、时段那句出了窗口,都褪回常驻 A maré não espera a lua.。按顶栏实际宽度只在放得下的句子里挑(iPhone 375~430 宽都只跳过最长的两句)。点一下开侧栏,长按浮出中文。
  - CCPage.tsx:状态小字和它的 800ms 防抖、streamingPhase/Elapsed 去掉(状态点留着);月亮按钮挪进 .cc-top-right,斜挂胶囊左上角(她选的第 1 版);ConchButton 加 class cc-conch-btn,颜色挪进 CSS。API 频道是同一个组件,一起生效。
  - 黑白:chatTone.ts 按每个元素身后那一小块背景算亮度,写在元素自己的 data-tone 上(纯色按颜色、图片按 cover 铺满后的像素叠压暗、弥散动画按四团光斑此刻叠在白底上的颜色;实心字和图标分界 0.2,半透明的标签/时间/小心 0.32,带回差)。管:顶栏短句、长按中文、胶囊两颗、+ 和发送、「+」菜单、Undercurrent 标签、时间、小心。月亮不变。
  - index.css 末尾加「顶栏短句 + 黑白」块。
- 怎么验证:tsc + vite build 通过,新包 index-BdBIuK_M.js / index-DY63GyfC.css(上一版 index-CiphSmte.js / index-BqlOgZth.css);本机临时页 Chromium + WebKit 用假时钟(上海时区)实测:到达/时段一天一次/跨午夜不重出/早上 7:50 出早安/情绪三类 + 不开心不算开心/中性话不换/半小时褪回常驻/时段出窗口褪回/长按出中文且不开侧栏/点一下开侧栏/月亮可点不被挡/四种宽度放得下;纯色深浅、上深下浅的图片、深夜天光弥散下每个元素黑白都对,零页面报错。
- 怎么撤销:CCPage.tsx / index.css 各自 cp src/<文件>.bak-20261001-tagline src/<文件>,删掉 taglines.ts / useTagline.ts / Tagline.tsx / chatTone.ts,重新 build

## 2026-10-01 · 「+」菜单里的心(心率开关)不跟着黑白变,保持原来的颜色(原瑶)
- 改了什么:chatTone.ts 的 TARGETS 把 .cc-plus-item 改成 .cc-plus-item:not(.health),心不再被写 data-tone,回到原规则:关=var(--ink-faint) oklch(0.62 0.03 252) 透明度 .45(浅蓝灰),开=oklch(0.62 0.13 256) 带蓝光。菜单里其他图标照旧跟背景变黑白。
- 怎么验证:tsc + vite build 通过,新包 index-kODiSUu6.js(CSS 没变,还是 index-DY63GyfC.css);本机临时页 Chromium + WebKit 在深色、浅色、弥散三种背景下:心没有 data-tone,开是原蓝 + 光晕,关是原浅蓝灰 .45,其余 8 颗照旧变白 / 变深,零页面报错。
- 怎么撤销:cp src/chatTone.ts.bak-20261001-healthheart src/chatTone.ts 后重新 build

## 2026-10-01 · 顶栏短句改斜体 700、去掉发光;月亮缩到 20px、浅背景换灰影(原瑶看对比图后定)
- 改了什么:main.tsx 加 @fontsource/cormorant-garamond/700-italic.css(包早就装着,不算新依赖);index.css「顶栏短句 + 黑白」块里 .cc-tagline 改 font-weight 700、letter-spacing .05em、text-shadow none,去掉两条按背景深浅给的发光;月亮 .moon-svg 26→20px,位置 left/top -14/-11 → -11/-8(中心还在胶囊左上角同一点),浅背景上 filter 换成淡灰影(深背景照旧银色光晕);chatTone.ts 的 TARGETS 加 .cc-moon(只用来判浅深换影子,颜色不变);Tagline.tsx 的 MOON_OVERHANG 22→16(月亮小了,探出来的少了)。
- 为什么:她说亮背景上的发光看着怪、字分不出主次、月亮挂着怪。对比图在 /home/ubuntu/work/typeboard(board-type / board-cormorant / board-moon / board-combo),她选「斜体 700 + 月亮 20px 灰影」。白光晕在白底上糊成一圈、月亮本身看不见,是月亮"怪"的主因。
- 怎么验证:tsc + vite build 通过,新包 index-DkbZqzdP.js / index-DinnruIF.css(上一版 index-kODiSUu6.js / index-DY63GyfC.css);本机临时页 Chromium + WebKit:短句 700 斜体、字体文件真加载、无 text-shadow,浅深背景颜色对;月亮 20px、浅背景灰影/深背景光晕、能点、最长能出的一句离月亮 29px 以上(375 宽);顶栏短句全套回归(时段/情绪/褪去/长按/点开/黑白)全过,零页面报错。
- 怎么撤销:main.tsx / index.css / chatTone.ts / Tagline.tsx 各自 cp src/<文件>.bak-20261001-taglinetype src/<文件> 后重新 build

## 2026-10-01 · 顶栏海螺盒图标可以在外观里换:海星(默认)/ 水彩花 / 小房子 / 心(原瑶)
- 改了什么:新文件 conchIcons.tsx(四个图标 + 选项表;海星用极坐标画的软五角,小房子带心形窗,水彩花自带颜色、噪点位移做水彩毛边、filter id 用 useId 防重名;TopConchIcon 只让自己订阅外观);appearance.ts 加 conchIcon 字段,默认 star;CCPage.tsx 胶囊里的 HeartIcon 换成 TopConchIcon、删掉 HeartIcon;Sidebar.tsx 外观「质感」下面加「海螺盒图标」一组单选,每个选项前放实际的小图标;index.css 末尾加 .ap-radio-icon。顺手:chatTone.ts 的 useChatTone 改成 <ChatTone /> 小组件放在 cc-page 里,外观一变(比如拖晕染滑杆)只重画它,不再整个聊天页跟着重画。
- 为什么:她说空心的心想换但想不出;对比图(/home/ubuntu/work/iconboard)里海星、水彩花、小房子她都喜欢,选了「外观里随时换」,默认海星(和月亮是一对)。线条的三个跟着背景变黑白,水彩花自带颜色不变。
- 怎么验证:tsc + vite build 通过,新包 index-QKqlSZt8.js / index-BYLyHGfu.css(上一版 index-DkbZqzdP.js / index-DinnruIF.css);本机临时页 Chromium + WebKit:没存过设置时是海星;侧栏外观里点四个选项顶栏跟着换、存进 localStorage、刷新后还在;浅/深背景下线条图标深/白正确;顶栏短句全套回归(时段/情绪/褪去/长按/点开/黑白)全过,零页面报错。
- 怎么撤销:appearance.ts / CCPage.tsx / Sidebar.tsx / index.css / chatTone.ts 各自 cp src/<文件>.bak-20261001-conchicon src/<文件>,删掉 conchIcons.tsx,重新 build

## 2026-10-01 · 海螺盒图标放大并跟水流对齐 + 新加一束白蓝玫瑰(原瑶)
- 改了什么:conchIcons.tsx 加 Fit(按倍数放大、下移,线宽除回去保持 1.7):海星极坐标半径放大 1.16 倍;小房子 ×1.18 上移 0.6;心 ×1.04 下移 0.9;水彩花 ×1.34 下移 1.4(位移和模糊跟着缩,毛边不变);新加「白蓝玫瑰」:中间一朵白、两边两朵蓝,花头是波浪边圆 + 分开的花瓣弧线 + 花心,插在浅蓝包装纸里系蓝蝴蝶结,整体下移 1.1。每个 svg 带 data-icon。appearance.ts 的 ConchIcon 加 roses;外观里多一个选项。
- 为什么:她说图标都有点小、跟旁边的水流比例不对、不在一条水平线上。实测(/home/ubuntu/work/iconboard/measure.py,4 倍截图算墨迹外框和重心):原来海星 15.5px 宽显小,水彩花 11.5px 宽且偏高 1.2px,小房子偏低 0.8px,心偏高 1.3px;调完五个图标的视觉中心(外框中心和墨迹重心取平均)跟水流差都在 0.2px 以内。
- 怎么验证:tsc + vite build 通过,新包 index-aJ9Pnm9B.js(CSS 没变 index-BYLyHGfu.css;上一版 index-QKqlSZt8.js);本机临时页 Chromium + WebKit:外观里五个选项都能换、存上、刷新还在,浅/深背景线条图标深/白正确,零页面报错。
- 怎么撤销:conchIcons.tsx / appearance.ts 各自 cp src/<文件>.bak-20261001-iconfit src/<文件> 后重新 build

## 2026-10-01 · 海螺盒图标加三种十字星(原瑶挑了 D、F、G)
- 改了什么:conchIcons.tsx 加 star4()(上右下左四个尖、边往里凹的四角星)和三个图标:十字星芒 twinkle(实心星 + 四道细光往外伸 + 右上空心小星)、十字星 sparkle(实心星 + 右上空心小星)、十字星芒·空心 twinkleLine(线条星 + 细光 + 右上实心小星);Fit 用对比图里实测对齐水流的值。appearance.ts 的 ConchIcon 加这三个;外观列表排在海星后面,共 8 个。
- 为什么:她想要带星芒的十字星配一颗小星;对比图(/home/ubuntu/work/iconboard/board-sparkle.png,6 版)她挑了 D、F、G 三版都要。十字星跟月亮放一起像一片夜空。
- 怎么验证:tsc + vite build 通过,新包 index-C-IMy5qu.js(CSS 没变 index-BYLyHGfu.css;上一版 index-aJ9Pnm9B.js);本机临时页 Chromium + WebKit:8 个选项都能换、存上、刷新还在,浅/深背景颜色对,8 个图标跟水流的视觉中心差都在 0.2px 内,零页面报错。
- 怎么撤销:conchIcons.tsx / appearance.ts 各自 cp src/<文件>.bak-20261001-sparkle src/<文件> 后重新 build

## 2026-10-01 · 气泡下的时间和小心对齐气泡里的字;收进海螺盒的心变蓝(原瑶)
- 改了什么:index.css 末尾:气泡态下 .cc-msg-time-block 原来离气泡边固定 22px(比气泡里的字多缩进 10px,短气泡还会伸出气泡外),改成跟气泡左右内边距同一个数 calc(var(--chat-text-size, 14.5px) * 0.82),右边再扣小心按钮自带的 4px 内边距,让心的右边对齐字;无气泡时右边也扣 4px。新文件 conchSaved.ts:进聊天页拉一次 GET /cc-api/api/conch,记下已收的 msgId+kind(不管原瑶还是苏煦收的),收藏成功就地加上;CCPage 的 ConchButton 用它判断,收过的加 class saved、不透明,CSS 里 saved 是蓝(浅底 oklch(.62 .13 256),深底 oklch(.8 .1 250)),没收的照旧半透明黑白;收过的再点不重复收。
- 为什么:她说时间跟气泡不对齐看着难受;心点了要变蓝,不然不知道收没收(原来只在这次打开页面里记得,重开就忘)。
- 怎么验证:tsc + vite build 通过,新包 index-DNk_629g.js / index-DN-GTay9.css(上一版 index-C-IMy5qu.js / index-BYLyHGfu.css);本机临时页 Chromium + WebKit:每条消息时间/心跟气泡里的字差 0px(默认字号和 18 号都是),无气泡也对齐;假接口说第 9 条已收 → 它是蓝心、其余半透明,点第 11 条立刻变蓝,浅/深背景蓝色都对,零页面报错。
- 怎么撤销:CCPage.tsx / index.css 各自 cp src/<文件>.bak-20261001-timeheart src/<文件>,删掉 conchSaved.ts,重新 build

## 2026-10-01 · 修:气泡开着时消息旁的小心点不动(原瑶)
- 改了什么:index.css 气泡态 .cc-msg-time-block 那条(position: static 那条)加 pointer-events: auto。
- 为什么:老规则 body[data-chat-bubbles="on"] .cc-msg-time 设了 pointer-events: none(当年时间浮在气泡外一层,怕挡住点气泡);后来收藏的小心放进了时间那一行,气泡一开,心跟着"点不到",手指点下去穿过去了。关掉气泡没这条规则,所以只在关气泡时能收藏。不是今天改出来的,是加小心那时就有的。上一轮验收用 element.click() 从代码点,绕过了这条规则才没发现。
- 怎么验证:tsc + vite build 通过,新包 index-CGuDvSEW.js / index-UQkUT_ls.css(上一版 index-DNk_629g.js / index-DN-GTay9.css);本机临时页按屏幕坐标真点(Chromium 用触摸 tap、WebKit 用鼠标):气泡开/关下他那条、她那条的心都能收上,手指正常滚上去点旧消息的心也行;把老规则塞回去做对照,真点就点不到——说明验收能抓到这个毛病。零页面报错。
- 怎么撤销:cp src/index.css.bak-20261001-heartclick src/index.css 后重新 build

## 2026-10-01 · 消息旁的小心:蓝心再点一下取消收藏;没收的心降到 10% 透明度(原瑶)
- 改了什么:conchSaved.ts 改成记 msgId+kind → 海螺盒条目 id(同一条消息文字不同可能有好几条),加 saveToConch(POST,记下返回的条目 id,没拿到就重拉一次清单)和 removeFromConch(按条目 id 逐个 DELETE /cc-api/api/conch/<id>,404 当成已删)。CCPage 的 ConchButton 改成开关:没收 → 收,蓝心 → 取消(苏煦收的也能取消);收没收全看 conchSaved,不再用组件自己的 done 状态;没收的心 opacity 0.45 → 0.1,蓝心和出错的 ⚠︎ 照常 1;aria-pressed 跟着收没收。
- 为什么:她要点过的再点能取消;满屏半透明的心太花,只想看清收过的那几颗。
- 怎么验证:tsc + vite build 通过,新包 index-D2Rux7ao.js(CSS 没变 index-UQkUT_ls.css;上一版 index-CGuDvSEW.js);本机临时页(假海螺盒会记收藏、按条目 id 删)Chromium 触摸真点 + WebKit 鼠标真点,气泡开/关:没收的心 0.1、苏煦收的第 9 条一开始是蓝心;点第 11 条 → 蓝、盒里多一条,再点 → 淡、盒里删掉;点第 9 条 → 取消、盒里空,再点 → 重新收上;她自己那条同样能收能取消;零页面报错。
- 怎么撤销:CCPage.tsx / conchSaved.ts 各自 cp src/<文件>.bak-20261001-hearttoggle src/<文件> 后重新 build

## 2026-10-01 · 小心:苏煦收的蓝心点不掉;没收的心降到 5%(原瑶)
- 改了什么:conchSaved.ts 每条记录多记"有没有苏煦收的"(条目 collectedBy === 'xuxu'),useConchSaved 返回 none / mine / his;removeFromConch 遇到 his 直接不删。CCPage 的 ConchButton:his 是蓝心但点了没反应(提示"苏煦收进海螺盒的，要删去海螺盒里删"),mine 照旧能点掉;没收的心 opacity 0.1 → 0.05;按钮带 data-conch 方便验收。
- 为什么:她同意"苏煦收的不能在聊天里取消",怕手滑删掉他收的;心再淡一点。
- 怎么验证:tsc + vite build 通过,新包 index-BR-cuyKQ.js(CSS 没变 index-UQkUT_ls.css;上一版 index-D2Rux7ao.js);本机临时页 Chromium 触摸真点 + WebKit 鼠标真点,气泡开/关:苏煦收的第 9 条点两次都还是蓝、盒里没少;第 11 条和她自己那条能收能取消;没收的心 0.05;零页面报错。
- 怎么撤销:CCPage.tsx / conchSaved.ts 各自 cp src/<文件>.bak-20261001-heartlock src/<文件> 后重新 build

## 2026-10-01 · 原瑶自己那边的消息只留收过的蓝心(她挑的第 3 版)
- 改了什么:index.css 末尾:.cc-msg.user .cc-conch-btn:not(.saved) 不显示;心藏起来时她那边时间行的 margin-right 改回不扣 4px(气泡 0.82 倍字号、无气泡 0,用 :has(.cc-conch-btn.saved) 判断),时间直接对齐气泡里的字。苏煦那边不变(没收的 5%、他收的蓝心点不掉)。
- 为什么:她想看自己那边没有心的样子,对比图(iconboard/noheart.png)三版里选了"只留收过的蓝心"。代价:她自己的话不能在聊天里点心收进海螺盒(苏煦照样能收,收了会显示蓝心)。
- 怎么验证:tsc + vite build 通过,新包 index-a_0D_sIR.js / index-BrFWMcGo.css(上一版 index-BR-cuyKQ.js / index-UQkUT_ls.css);本机临时页 Chromium + WebKit,气泡开/关:她那边没收的都不显示、时间跟字差 0px;假海螺盒里收过的"风好大"显示蓝心、也对齐;点它取消 → 心消失、时间重新对齐、盒里删掉;苏煦那边照旧;零页面报错。
- 怎么撤销:cp src/index.css.bak-20261001-myheart src/index.css 后重新 build

## 2026-10-01 · 正文跟背景深浅变明暗(原瑶:深背景字变浅、浅背景变深,换了字色也要能跟着变)
- 改了什么:chatTone.ts 的 TARGETS 加 .cc-paragraph(每段正文,气泡开着就是一枚气泡),跟标签/时间/小心用同一条 0.32 的线;判深浅时把气泡自己的底色(「各自」染色,已含浓淡)按透明度叠进身后的亮度。index.css 末尾四条:.cc-msg.assistant/.user .cc-paragraph[data-tone] 用 oklch 相对色 oklch(from var(--text-su|--text-you) … c h)——色相和浓淡是她在「文字颜色」里挑的,只改明度:深背景 max(l, 0.82),浅背景 min(l, 0.6)。不认相对色的浏览器整条作废,照原色。
- 为什么:深色背景/夜里天光上默认的蓝灰、暗金字几乎看不清;她要明度跟着背景走,以后换字色也成立。
- 怎么验证:tsc + vite build 通过,新包 index-NwchMTtq.js / index-BpDoKFJn.css(上一版 index-a_0D_sIR.js / index-BrFWMcGo.css);本机临时页 Chromium + WebKit(都认相对色):白天默认色亮度原样不变(0.161 / 0.179);深色纯色背景两边都提到 ≈0.55;换成浅粉 + 深蓝:白天浅粉被压深、深蓝不变,深背景都提亮;「各自」染色浓度 60 时,蓝气泡上的字提亮、金气泡上的字保持深;夜里天光按每段身后分别变;无气泡也一样;零页面报错。对比图 /home/ubuntu/work/iconboard/textlight.png。
- 怎么撤销:chatTone.ts / index.css 各自 cp src/<文件>.bak-20261001-textlight src/<文件> 后重新 build

## 2026-10-01 · 思考正文和输入框里的字也跟背景变明暗(原瑶:要加)
- 改了什么:chatTone.ts 的 TARGETS 加 .cc-thinking-body(Undercurrent 在聊天里展开的思考正文)和 .cc-input-pill textarea(输入框),跟正文同一条 0.32 的线;输入框的字叠的是输入框那块玻璃的染色(「各自」时是原瑶那一色)。index.css 末尾:思考正文用 --text-thinking 的色相,深背景 max(l, 0.76)(比正文暗一档)、浅背景 min(l, 0.6);输入框用 --text-you,字、光标、占位字都按 max(l, 0.82) / min(l, 0.6)。Undercurrent 卡片本身每种样式有自己的字色,不动。
- 怎么验证:tsc + vite build 通过,新包 index-B12Oc7XG.js / index-J7kVi_8X.css(上一版 index-NwchMTtq.js / index-BpDoKFJn.css);本机临时页 Chromium + WebKit,假 WS 发 thinking_start/delta 让思考正文冒出来:白天两样都不变;深色背景输入框 0.179→0.548、思考 0.186→0.441;「各自」浓度 60 时输入框染了金色,字保持深;夜里天光输入框在下面亮的那块,不变;零页面报错。对比图 /home/ubuntu/work/iconboard/textlight2.png。
- 怎么撤销:chatTone.ts / index.css 各自 cp src/<文件>.bak-20261001-textlight2 src/<文件> 后重新 build

## 2026-10-01 · 正文明暗改成按对比度连续算,颜色变化加过渡(原瑶:不够丝滑;灰背景上字也发灰看不清)
- 改了什么:chatTone.ts:正文 .cc-paragraph、思考正文 .cc-thinking-body、输入框 textarea 不再只有深/浅两档——按身后亮度(含气泡/输入框染色)选深字还是浅字(推到头时在亮度 0.19 上下打平,带回差),再按对比度目标算出要的明度写进元素的 --tl:浅底深字 4.5:1、深底浅字 7:1,思考正文低一档(3.5 / 5);明度按"亮度立方根"换算,夹在 0.18–0.97。刷新节流 250ms → 150ms。index.css:几条相对色改成 max(l, var(--tl, 0.82)) / min(l, var(--tl, 0.6)),括号里的数只是还没算出来时的保底;正文、思考、输入框、时间、标签、短句、胶囊按钮、发送键加 color 0.45s 过渡(原来有过渡的几样把原来的一起写上)。
- 为什么:原来深/浅各一个固定明度,中间调的灰背景上不管哪档对比度都只有 1.8 左右;切换是一下跳过去的。
- 怎么验证:tsc + vite build 通过,新包 index-wRsMxtl4.js / index-Dua7WjDO.css(上一版 index-B12Oc7XG.js / index-J7kVi_8X.css);本机临时页 Chromium + WebKit 量每段字和背景的对比度:近白 4.6(原色只压深一点点)、中灰 #8a8f99 从约 1.8 到 4.4、深灰 5.4(有颜色的字能到的上限)、深蓝 8.4;白天弥散按每段身后微调;思考和输入框同样;颜色过渡在;零页面报错。对比图 /home/ubuntu/work/iconboard/grey-compare.png。
- 怎么撤销:chatTone.ts / index.css 各自 cp src/<文件>.bak-20261001-textsmooth src/<文件> 后重新 build

## 2026-10-02 · 输入框的字跟「字号 · 正文」走(原瑶)
- 改了什么:index.css 末尾 body[data-chat-text-size="custom"] .cc-input-pill textarea 用 var(--chat-text-size),最小高度 calc(1.5em + 14px) 跟着字号放;没调过字号时照旧 15px。iOS 不会因为字小于 16px 放大页面(viewport 已 maximum-scale=1)。
- 怎么验证:tsc + vite build 通过,新包见下一条部署记录;本机临时页 Chromium + WebKit,气泡开/关:没调过 15px;正文 18px → 输入框 18px、高 41(正好一行);12px → 12px、高 32;字体跟正文同一套;零页面报错。
- 怎么撤销:cp src/index.css.bak-20261002-inputsize src/index.css 后重新 build

## 2026-10-02 · 气泡加贴着的淡影(她挑的 B,喜欢偏真实的质感);字晕染也给输入框
- 改了什么:index.css 末尾 body[data-chat-bubbles="on"] .cc-msg .cc-paragraph 加 box-shadow: 0 1px 2px rgba(20,40,80,.06), 0 4px 12px -4px rgba(20,40,80,.16)(原来气泡没有影子;深背景上几乎看不见,本来就是真实的样子;音乐卡片那种不套气泡的段落另有 none !important);body[data-bubble-glow="on"] .cc-input-pill textarea 加 text-shadow: var(--bubble-glow),跟正文同一个晕染,颜色跟着字自己的(含明暗)。上一条输入框字号的部署也在这个包里。
- 为什么:她看了四版阴影对比图(iconboard/board-shadow.png、board-shadow-zoom.png)选 B;晕染要连输入框一起。
- 怎么验证:tsc + vite build 通过,新包 index-C2aBmFLS.js / index-Da8BARsC.css(上一版 index-BEC74In9.js / index-B-l_VMiu.css);本机临时页 Chromium + WebKit:气泡原样、各自两种颜色模式都有影子,关气泡没有;输入框打了字,晕染开时有、晕染滑到 0 时没有,跟正文一致;零页面报错。
- 怎么撤销:cp src/index.css.bak-20261002-shadowglow src/index.css 后重新 build

## 2026-10-02 · 气泡阴影加开关和深浅滑杆(原瑶)
- 改了什么:appearance.ts 加 bubbleShadow(默认开)和 bubbleShadowStrength(10–100,默认 50 = 她挑的 B),apply() 写 body[data-bubble-shadow] 和算好的 --bubble-shadow(两层影子的透明度按深浅成比例,偏移和模糊按 0.5+0.5×倍数放大,越深越像浮起来);Sidebar.tsx 外观「质感」晕染下面加「阴影」开关,开着时出「深浅」滑杆;index.css 那条固定的 box-shadow 改成 body[data-chat-bubbles="on"][data-bubble-shadow="on"] … { box-shadow: var(--bubble-shadow) }。
- 怎么验证:tsc + vite build 通过;本机临时页 Chromium(触摸真点)+ WebKit(鼠标真点):默认开、滑杆 50、影子跟 B 一模一样;拉到 100 → .12/.32、1.5/6px 偏移、3/18px 模糊;点开关关掉 → 没影子、滑杆收起、存上;刷新还是关;再打开 → 回到 100 那档;零页面报错。
- 怎么撤销:appearance.ts / Sidebar.tsx / index.css 各自 cp src/<文件>.bak-20261002-shadowctl src/<文件> 后重新 build

## 2026-10-02 · 字跟背景变明暗时优先靠近她挑的颜色(原瑶:选了白字,灰一点的背景上却变成深灰)
- 改了什么:chatTone.ts 正文/思考/输入框往深推还是往浅推,不再只看背景亮度(原来 0.19 一刀切):两边都算——往浅推到 7:1(或推到头)、往深推到 4.5:1,先排除对比度不到最低线的(正文 2.5、思考 2.2),剩下的按"够清楚(封顶 4.5,思考 3.5)− 离她挑的颜色的明度差"打分挑高的;上次在哪边加 0.05 分防来回跳。她挑的颜色从 --text-su / --text-you / --text-thinking 读。
- 怎么验证:tsc + vite build 通过;本机临时页 Chromium + WebKit 量对比度:白字在深蓝 13.3、深灰 6.0、中灰 #8a8f99 3.2、偏浅灰 #9aa0aa 2.6 都保持白色(原来中灰、偏浅灰会变深灰);浅灰 #a7acb4 和近白才换成深字(4.5 / 4.6);默认颜色在各背景上跟改之前一模一样;零页面报错。对比图 /home/ubuntu/work/iconboard/white-compare.png。
- 怎么撤销:cp src/chatTone.ts.bak-20261002-ownside src/chatTone.ts 后重新 build

## 2026-10-02 · 对话滑出屏幕时逐渐变淡(原瑶)
- 改了什么:index.css 末尾 @supports 包着的一段 CSS 滚动驱动动画:.cc-messages 里每条消息的每一块(.cc-text 的子元素——气泡/段落、语音条、时间行;.cc-text-col 里除 .cc-text 外的——Undercurrent 标签、思考正文、图片、文件;头像列)用 view(block 0px 76px) 时间线,两段动画 cc-edge-in(entry 段,0→1)和 cc-edge-out(exit 段,1→0,只往后填充),经过消息区上沿时淡出、滑到输入框后面(下沿让出 76px)时淡出,从下面上来时淡入。
- 为什么这样做:不在整个列表上加遮罩——祖先有 mask/opacity 时气泡的 backdrop-filter 磨砂会失效;淡在每一块自己身上,玻璃不受影响。关键帧里用 entry/exit 范围名的写法 WebKit 不认,改成两段动画 + animation-range;@supports 连同 view() 的内缩写法一起判,不支持的浏览器整段跳过(否则动画会按时间跑完、全部透明)。
- 怎么验证:tsc + vite build 通过,新包 index-BT7VzgJ0.js / index-DQjVphke.css(上一版 index-COSr1h8G.js / index-BAXWojS8.css);本机临时页 Chromium + WebKit:到底时最新一条全亮,上沿压着的那块 0.52 / 0.48;往上滚 230px 后上沿那块 0.12 / 0.08、中间全亮、输入框后面的 0;录了滚动小视频 /home/ubuntu/work/iconboard/edge-fade.mp4。聊天页刚打开那几秒每 80ms 把列表拉回最底,直到 wheel/touchmove——验收时得先发一个 wheel 事件再滚;无头 WebKit 不重绘就不更新进度,读之前截一张图。
- 怎么撤销:cp src/index.css.bak-20261002-edgefade src/index.css 后重新 build

## 2026-10-02 · 顶栏浮起来、消息从它底下滑过（原瑶："还能更丝滑么？另外我想把顶栏的遮罩去了试试看"，看了预览说"可以"）
- 改了什么：index.css 末尾 .cc-top 改 position:absolute 悬在安全区下沿（left/right 14px，z-index 6），.cc-messages padding-top 改 14+52px；CCPage.tsx 删掉 .cc-waterline 那个 div（水位线不要了）。上一条"滑出屏幕变淡"的时间线改成 view(block 52px 76px)：消息经过顶栏底边时变淡、到顶栏后面已经看不见；淡入淡出曲线从 linear 改 cubic-bezier(0.45, 0, 0.55, 1)（两头慢中间快）。
- 为什么这样做：倒计时小丸（CardDeck）原本贴水位线下面 10px，水位线没了它会自动改贴顶栏底边（CardDeck.tsx 里本来就有 .cc-waterline || .cc-top 的兜底），不用另改；用 display:none 藏水位线不行——量出来是 0，小丸会跑到顶栏上。
- 怎么验证：tsc + vite build 通过，新包 index-C-Q7iRw1.js / index-D0DuhCxZ.css（上一版 index-BT7VzgJ0.js / index-DQjVphke.css）；本机临时页 Chromium + WebKit：顶栏 0–44、列表 0–852、滚到顶第一条在 66、往上滚后顶栏后面那块透明度 0、顶栏底边那块 0.96/0.94；发一张倒计时卡，小丸在 54–92（WebKit 进场动画在无头里要等 2 秒左右才走完）；Chromium 模拟 iPhone 安全区 59px：顶栏 59–103、列表顶 59、滚出列表顶的内容被裁掉，状态栏那截干净。
- 怎么撤销：cp src/CCPage.tsx.bak-20261002-undertop src/CCPage.tsx；cp src/index.css.bak-20261002-undertop src/index.css；重新 build

## 2026-10-02 · 点的歌挂在顶栏下，对话里只留一行小字（原瑶："苏煦或我点了歌后，卡片会持续挂在顶栏下。不再在气泡对话里出现"）
- 改了什么（CCPage.tsx）：
  - 新增 useMusicPin：倒着找对话里最新一条带 [music:] 的消息（她点的、他点的都算），歌卡（原 MusicCard 原样）挂进 header 后面的 .cc-music-pin。
  - 换歌规则：正在放别的歌时先不换，停了/放完再换；那首是等上来的就不自动放（heldRef）。× = 停掉并收起，localStorage sea-music-pin-closed（api 频道 -api）记下收的是哪条，下一首新歌来了再出来。
  - 对话里原位改成一行小字 MusicMention「♪ 歌名 · 歌手」（button.mc-mention），点一下 = 顶上换成这首并开始放（playNow；manualFor 记下点的时候最新的是哪条，来了更新的歌才换走）。
  - MusicCard 加 playNow / onClose（右上角 ×），挂载时先对一下正在放的是不是自己。mcAudio.onpause 也通知一声（系统打断、拔耳机），换歌时 startPlay 自己那次暂停不算。
  - fresh 不再从 MessageBody → TextBlock → MdParagraphs → renderPara 一路往下传，改由 useMusicPin 直接从消息上读。
  - 歌卡挂上/收起时，useLayoutEffect 按 padding-top 的变化补 scrollTop，正在看的消息不跳。
  - 顺手修了"在底部时新消息自动跟"：原来是新消息撑高列表之后才量"离底 < 50px"，她自己发的一句（气泡 + 时间就 60 多 px）会停在输入框后面，要等苏煦开始回才跟下去；现在以新消息进来之前的 scroll 记录（stickRef）为准，往上翻着看旧消息时照旧不拽她。
- CardDeck.tsx：倒计时小丸的锚点先找 .cc-music-pin（挂着歌时贴歌卡底下 10px），加 anchorKey 让歌卡挂上/收起时重量。
- index.css：
  - .cc-music-pin 悬在安全区下沿 + 50px（卡 80 高）。
  - .cc-page[data-pin="on"] 时消息区让到 152px，渐隐线 view(block 138px 76px)。
  - 歌卡进场动画在省电模式下单独放行（全局 animation-play-state: paused 会把它停在透明那一帧）。
  - .mc-close / .mc-mention 样式；只剩那行小字的段落不套气泡。
- 怎么验证：
  - tsc + vite build 通过，新包 index-QAbWa48P.js / index-PtkWGCBe.css（上一版 index-C-Q7iRw1.js / index-D0DuhCxZ.css）。
  - 本机临时页 Chromium（触摸真点）+ WebKit（鼠标真点），真音乐接口，假后端放行 /nm/ 只读取播放地址。
  - 她另一台设备点 A 自动放；A 放着时他点 B，卡片不换；暂停 A 后换成 B 且不自动放；点 B 播放正常；点对话里 A 那行，换成 A 并开始放；点 × 收起，音乐停，记下 m_sb。
  - 歌卡 50–130，倒计时小丸 140–178；挂上/收起时 scrollTop ±86、消息位置一像素没动；对话里不再有 .mc-card，小字分在两边、无气泡底。
  - 她发一句 → 列表跟到底（原来停在离底 65px）；往上翻 300px 时来新消息不拽她。
  - 零页面报错。截图 /home/ubuntu/work/musicpin/music-pin.png。
- 怎么撤销：src/CCPage.tsx、src/CardDeck.tsx、src/index.css 各自 cp src/<文件>.bak-20261002-musicpin src/<文件> 后重新 build

## 2026-10-02 · 图片走过上下沿时按位置柔柔地淡（原瑶："图片过去的时候会淡得有点突然"）
- 原因：渐隐是每一块整块一起变透明，淡的快慢按块自身高度算。文字气泡矮，走到屏幕上沿前就淡完了；照片最高 320px、拾贝卡更高，顶到上沿时还剩 0.85，被屏幕边一刀切掉，等下半截还在正中间时又整张一起暗下去。
- 改了什么：index.css 末尾，照片/表情（.cc-msg-img）、拾贝卡（.cc-keepsake）、网页卡片（.cc-msg-html）不再整块变透明，改用遮罩跟着线走。
  - 线以下全亮，往上 52px（顶栏那截）由实到透明；底下输入框那 76px 同理。
  - 两个注册过的自定义属性 --cc-mt / --cc-mb 记两条线在这块里的位置，滚动驱动；mask-composite: intersect 叠两层。
  - 范围用 exit-crossing / entry-crossing（网页卡片能比屏幕还高，exit/entry 那套对超高块会算错）。
  - mask-clip: no-clip，照片自带的影子不被裁掉。
  - 挂着歌时随 data-pin 那条规则一起下移到 138px。
  - 省电模式下这几条放行。
- 怎么验证：
  - tsc + vite build 通过，新包 index-CDkVISDn.js / index-DARaYIrO.css（上一版 index-QAbWa48P.js / index-PtkWGCBe.css）。
  - 本机临时页 Chromium + WebKit：两个内核 CSS.supports 都认 crossing 范围和 no-clip。
  - 320px 照片顶到 40 / 10 / -30 / -90 / -170 / -250 时，--cc-mt 恰好等于"线 − 图片顶"（例：顶在 −90 时 38.19%×320 + 19.86 = 142 = 52 + 90）。
  - 挂着歌时顶在 100：38px = 138 − 100。
  - 照片影子跟改之前逐像素一样；输入框后面那截柔柔淡掉（原来整张发灰、底下露一条深色）；拾贝卡也挂上了；零页面报错。
  - 对比图 /home/ubuntu/work/musicpin/imgfade-all.png、shadow-bottom.png。
- 怎么撤销：cp src/index.css.bak-20261002-imgfade src/index.css 后重新 build

## 2026-10-02 · 阴影开关和深浅也管语音条、音乐卡、Undercurrent 卡片（原瑶："语音卡、音乐卡和暗流卡片没有带阴影，想跟随之前做的开关和滑杆一起控制"）
- 改了什么：
  - appearance.ts 按深浅滑杆多写两个变量：--shadow-a（乘透明度）、--shadow-d（乘距离和模糊），50 时都是 1。
  - index.css 末尾：
    - 语音条：开着阴影时用 --bubble-shadow，保留自己的顶边内光。
    - 音乐卡：本身是 .glass，那层玻璃影子随玻璃模式、边框线变，不动它。气泡影子挂在 .cc-music-pin::before 上垫在卡片底下，跟卡片同大同圆角、一起进场；CCPage 把 key 从卡片挪到 .cc-music-pin，换歌时连垫层一起重来。
    - Undercurrent：硫酸纸、烟黑、磨砂玻璃的 box-shadow，黑卡片、晕边硫酸纸的 .uc-shade，全换成乘 --shadow-a/--shadow-d 的写法，50 = 原样。关掉时 box-shadow 去掉，磨砂玻璃留内光，.uc-shade 隐藏。暗潮原来没有影子，补一层 .uc-shade：水面往上散的藏青渐变，往下一直铺进水里，免得接出一道缝；跟水一起 uc-rise / uc-sink。
    - 语音条、音乐卡、Undercurrent 不看气泡开关（它们本来就是卡片）。
  - Sidebar.tsx：开关和滑杆的读屏名改成"阴影 / 阴影深浅"，提示改成说明管哪些。
- 怎么验证：
  - tsc + vite build 通过，新包 index-owznhlPX.js / index-BxxiARfE.css（上一版 index-CDkVISDn.js / index-DARaYIrO.css）。
  - Chromium + WebKit 读算出来的阴影，分开 50、开 100、关三种：
    - 开 50 时五种原有样式的影子跟原来一字不差。
    - 开 100 时透明度 ×2、距离和模糊 ×1.5。
    - 关掉时只剩玻璃内光，语音条回到原来那点 0.05 的细影。
    - 音乐卡垫层 300×80、圆角 24，跟卡片重合；卡片自己的玻璃影子三种情况都没变。
  - 截图 /home/ubuntu/work/musicpin/card-shadow.png。
- 怎么撤销：appearance.ts、Sidebar.tsx、index.css、CCPage.tsx 各自 cp src/<文件>.bak-20261002-cardshadow src/<文件> 后重新 build

## 2026-10-02 · 暗潮换成音乐卡那片海（原瑶："暗潮我想做成音乐卡片里的那种效果试试看，你可以删掉之前的直接把音乐卡片里海的实现代码搬过来"）
- 删了什么：原来那片深水（.uc-tide .uc-card::before 深色渐变）、水面那道微光（::after）、上一条给暗潮补的藏青影子（.uc-tide .uc-shade 三条）；暗潮现在不挂影子。
- 改了什么：
  - UndercurrentCard.tsx 新增 UcSea（只在暗潮时挂进卡片），配方照搬 MusicCard：同一个波形（多出一截，左边缘永远不露）、同一组湍流参数（baseFrequency 0.014 0.03 / 26s 呼吸、displacement 4.5）、同样 6 单位每秒地往左走、mc-glint 闪光 14 颗。
  - 只有水面那一窄条（.uc-sea-top，22px）走 SVG 滤镜。湍流按面积算，整片海都挂会让手机发烫；音乐卡那层 CSS blur(1.5px) 换成滤镜里的 feGaussianBlur（0.6 / 1.9 单位），这样窄条底边不会糊开、跟下面接不出缝。
  - 水体 .uc-sea-body 是 CSS 渐变：音乐卡 sea 渐变那三档（浅 .20 / 中 .40 / 深 .60），叠在一层 .96 的浅底上算出来。音乐卡的水本身是透的、靠卡片那层浅玻璃托着；这里不垫底的话，输入框的 + 和发送会透出来，深色背景上整片发浑、深字看不清。
  - 海比卡片高出 24px，标题浸在浅水里；字改成跟纸、玻璃几种一样的深色。
  - 系统开了减弱动态效果就不动。
- Sidebar.tsx：暗潮的说明改成"音乐卡那片海从底下漫上来"。
- 怎么验证：
  - tsc + vite build 通过，新包 index-B4tgLF2m.js / index-kMoChCEV.css（上一版 index-owznhlPX.js / index-BxxiARfE.css）。
  - 本机临时页 Chromium：浅色、深色背景各开一张长思考的暗潮，字都清楚；海面在深色背景上是一道柔的波浪白边；14 颗闪光都在；零页面报错。
  - 背后气泡的字透过来不到 2%（同一行亮度差 ≤ 5/255）。
  - 对照图 /home/ubuntu/work/musicpin/uc-sea.png。
- 怎么撤销：index.css、UndercurrentCard.tsx、Sidebar.tsx 各自 cp src/<文件>.bak-20261002-ucsea src/<文件> 后重新 build

## 2026-10-02 · 晕染改成全局、阴影管到聊天里所有卡片、暗潮换成浅玻璃托着的翻涌的海
原瑶："我喜欢透明的，垫一层浅色玻璃怎么样？像卡片那样。然后窄条能再宽些么？想起伏再明显些，像大海那样海浪在翻涌。然后我发现这里的字也没有跟随晕染，这样也太麻烦了，要靠一个个发现哪个没有做，感觉很乱"

- 晕染（根上改）：
  - 原来是挑名单（.cc-text、.uc-body、阅读……十几个容器），漏一个就不晕。
  - 现在 index.css 一条 body[data-bubble-glow="on"] { text-shadow: var(--bubble-glow) } 靠继承管整个小手机；按钮、输入框浏览器默认不继承，补一条 inherit。
  - 不晕的只剩代码（pre、code），以及自己声明了字效的（顶栏短句她明确不要光）。
  - 删了原来的名单、排除规则和输入框那条单独的。
  - Undercurrent 正文其实一直在名单里，但字换成深色后，跟字同色的晕染只是一圈很淡的深色，看着像没晕；标题 Undercurrent 不在名单里。现在都跟着。
- 阴影：
  - 聊天里自带底色的都跟着开关和深浅：照片、文件、工具、记忆条用跟气泡同一层；拾贝卡、网页卡片按深浅缩放各自的影子，50 = 原样。
  - 表情包是镂空图，不加。顶栏胶囊、输入框是玻璃本身的光影，不归这里管。
- 暗潮：
  - 卡片本身是一块浅玻璃，跟音乐卡一样几乎透明、10px 磨砂，顶上两个 26px 圆角，边框线开着时有斜面描边，顶边往上投影（跟阴影开关走）。
  - 海装在玻璃里，水是透的。
  - 水面那条 60px：
    - 前浪波长 30、浪高 9，往左 15 秒走 6 个波长；
    - 后浪波长 40、浪高 13、颜色淡，往右 20 秒走 5 个波长；
    - 湍流扰动 13，7 秒一呼吸；整片随涌浪上下 5 个单位，5 秒一回；
    - 浪尖描白沫，水面那截比音乐卡蓝一点（浅玻璃上浅白的水看不出浪）。
  - 卡片打开时按身后背景亮度定深浅字：chatTone.ts 抽出 backgroundSampler，跟聊天页定字色同一个算法，平均亮度 < 0.3 用浅字。
- 怎么验证：
  - tsc + vite build 通过，新包 index-_W6WyvNS.js / index-NJ8ofl1E.css（上一版 index-B4tgLF2m.js / index-kMoChCEV.css）。
  - Chromium + WebKit 读算出来的字效：她的字晕棕色、他的晕蓝色、时间、Undercurrent 标签、歌名那行小字、音乐卡标题、输入框都按各自颜色晕；顶栏短句和代码不晕；主页、鲸鱼面板也晕了，截图看没有糊掉或走样。
  - 阴影三种情况（开 50 / 开 100 / 关）两个内核数值一致。
  - 暗潮：浅色背景深字、深色背景自动浅字；逐帧控着 SVG 时钟录了 4 秒视频 /home/ubuntu/work/musicpin/uc-sea-waves.mp4，浪在翻。
- 怎么撤销：index.css、UndercurrentCard.tsx、Sidebar.tsx、chatTone.ts 各自 cp src/<文件>.bak-20261002-glowall src/<文件> 后重新 build

## 2026-10-02 · 晕染收回到聊天和 Undercurrent 卡片；挂着的歌卡影子固定 70（原瑶："其他不用做，只针对聊天和带卡片的 Undercurrent 里的内容……要挂在顶栏下的卡片做成固定的 70% 左右吧，不和开关滑杆一起了"）
- 改了什么：index.css 晕染从 body 全局改成三处：主聊天消息区 .cc-messages（CC 和 API 频道）、输入框、.uc-card。
  - 这三处里面照旧靠继承（按钮、输入框补 inherit，只排除 pre / code），新加的东西自动跟着。
  - 主页、面板、侧栏、顶栏、挂着的歌卡、客厅、中间地带、海螺盒、通话、阅读都不晕；后面这几页是 10-01 我按"凡是正文"扩出去的，这次按她说的收回。
  - .cc-music-pin::before 的影子固定为深浅 70 那档（0 1.2px 2.4px .084 + 0 4.8px 14.4px -4.8px .224），不看 data-bubble-shadow。
  - Sidebar 晕染、阴影两条说明跟着改。
- 怎么验证：
  - tsc + vite build 通过，新包 index-BbrsJumH.js / index-C3y5ZhkZ.css（上一版 index-_W6WyvNS.js / index-NJ8ofl1E.css）。
  - Chromium + WebKit：主页、顶栏、短句、歌卡标题、代码不晕；气泡、时间、Undercurrent 标签、歌名小字、语音条、输入框、Undercurrent 标题和正文都晕。
  - 歌卡影子在阴影开 50、开 100、关三种情况下一字不差。
- 怎么撤销：cp src/index.css.bak-20261002-glowscope src/index.css；cp src/Sidebar.tsx.bak-20261002-glowscope src/Sidebar.tsx；重新 build

## 2026-10-02 · 对话里就地展开的 Undercurrent 只要字（原瑶："去掉对话页面里的 Undercurrent 展开后那段字底下的蓝底，只要字"）
- 改了什么：index.css 末尾给 .cc-messages 里的 .cc-thinking-body（生成时自动展开的那段思考）去掉淡蓝底（rgba(20,106,255,.025)）、边上那道 1.5px 竖线和圆角；她那边那条右竖线也一起去掉。内边距不动，字的位置跟原来一样；字色照旧由 ChatTone 按背景调明暗。客厅没用这个类，只动主聊天。
- 怎么验证：tsc + vite build 通过，新包 index-CTsIbRsC.js / index-CBvBDNjv.css（上一版 index-BbrsJumH.js / index-C3y5ZhkZ.css）；Chromium + WebKit 发一条正在想、没出字的消息，就地展开的那段：底透明、没有竖线、内边距 6px 12px、位置 662–734 跟改之前一样；对比图 /home/ubuntu/work/musicpin/think-cmp.png。
- 怎么撤销：cp src/index.css.bak-20261002-thinkplain src/index.css 后重新 build

## 2026-10-02 · Undercurrent 卡片加开关（原瑶："我还想要一个关闭 Undercurrent 卡片的开关"）
- 改了什么：
  - appearance.ts 新字段 ucCard，默认开。
  - Sidebar.tsx 在「Undercurrent 卡片」那节最上面加「浮出卡片」开关（读屏名 Undercurrent 卡片）；关掉时下面的样式、垫图、虚化、看看效果都收起来，只留一行说明。
  - CCPage.tsx 的 MessageRow：双击 Undercurrent 标签时读 getAppearance().ucCard（只在双击那一下读，不订阅外观，免得每条消息跟着设置重画）。开着照旧浮出卡片；关着就在对话里就地展开那段思考（inlineOpen，样式就是刚改成只有字的那种），再双击收起。
  - 生成时自动展开（模式A）不受影响。标签的提示改成"双击看他在想什么"。
- 为什么关掉后是就地展开、不是双击没反应：关了卡片还得有地方看他想了什么；她刚把就地展开那段改成只要字，像是想在对话里看。
- 怎么验证：
  - tsc + vite build 通过，新包 index-8RM6v6uR.js / index-CBvBDNjv.css（上一版 index-CTsIbRsC.js，CSS 没变）。
  - Chromium（触摸真点）+ WebKit（鼠标真点）走完整流程：默认双击浮出卡片；点外面收起；侧栏展开偏好、真点开关后样式选项收起、出现说明、localStorage 写 ucCard:false；关掉后双击就地展开、不出卡片；再双击收起；刷新后照样就地展开。零页面报错。
  - 截图 /home/ubuntu/work/musicpin/uc-card-switch.png。
- 怎么撤销：appearance.ts、Sidebar.tsx、CCPage.tsx 各自 cp src/<文件>.bak-20261002-uccard src/<文件> 后重新 build

## 2026-10-02 · 顶栏葡语点一下：中文 + 苏煦念一遍（原瑶："按一下顶栏文字 → 下方显示中文小字翻译 + 播放葡萄牙语发音（用苏煦的声音）。约 5 秒后自动消失。每条短句配置加一个 zh 字段存中文"）
- zh 字段 10-01 就有（taglines.ts 的 Line = { pt, zh }，原来长按时用），这次没加新字段。
- 改了什么：
  - Tagline.tsx：点一下 → 原来那颗中文小胶囊浮 5 秒（index.css 动画 2.4s → 5s），同时播 /sea/tagline-voice/<文件名>.mp3（全页共用一个 Audio，连点从头念；没有对应文件就只浮中文）。
  - 原来点一下开侧栏、长按看中文，现在对调：长按 0.5 秒开侧栏（顶栏短句是聊天页唯一开侧栏的入口，不能丢）。
  - taglines.ts 新增 voiceUrl(pt)：文件名是葡语原文去重音、小写、非字母数字换短横。
  - public/tagline-voice/ 37 个 mp3（共 800K，按需加载，不进 JS 包）。
- 发音怎么来的：
  - 苏煦的声音是旧 Memory Service 里配的：task_routing tts → ElevenLabs eleven_v3，user_status config_tts.voice_id。
  - eleven_v3 对单个词会念走样。用 ElevenLabs Scribe 指定葡语听：eleven_v3 把 Voltaste 念成 Moltaste、Quero-te 念成 Quer che。
  - eleven_turbo_v2_5 + language_code pt 六句全对，就用它一次性生成，不改语音条和通话用的 eleven_v3。
  - 37 句生成后全部用 Scribe 核对；第一轮 3 句对不上（Dorme, eu fico / Não vou embora / Conta os minutos），外加 Só tu 念成问句，重新生成后全对。
  - 一共约 600 字的 TTS 额度；以后点着播放不再花额度。
  - 改了或加了句子：sh /home/ubuntu/work/tagline-voice/regen.sh（缺的才生成，自动核对，拷进 public），然后 build。
- 怎么验证：
  - tsc + vite build 通过，新包 index-CBeGu0qC.js / index-DvcKAxjs.css（上一版 index-8RM6v6uR.js / index-CBvBDNjv.css）。
  - Chromium（触摸真点）+ WebKit（鼠标真点）：点一下浮出「你回来了。」、voltaste.mp3 200 且完整播完（0.88 / 0.94 秒）、5.6 秒后胶囊消失；长按 0.75 秒开侧栏、不浮中文、不出声。零页面报错。
  - 线上 https://puppy.atlantis-sy.blue/sea/tagline-voice/voltaste.mp3 200 audio/mpeg。
- 怎么撤销：Tagline.tsx、taglines.ts、index.css 各自 cp src/<文件>.bak-20261002-tagvoice src/<文件>；rm -r public/tagline-voice；重新 build

## 2026-10-02 · 顶栏中文盖在歌卡上；照片回执不显示编号（原瑶："那个翻译被音乐卡挡住了。还有我想不在聊天界面显示苏煦收藏图后的编号，只是写他在窗台摆了一张相片这样的"）
- 中文被挡：顶栏和挂着的歌卡都是 z-index 6，歌卡在后面，压住了顶栏里往下浮的中文胶囊。.cc-top 改成 7；顶栏别的东西都不出 0–44 那条，只有这颗胶囊会伸下去。
- 照片回执：
  - hub 在苏煦回复末尾追加「〔照片永久编号：u_xxxxx-1、…〕」，是回显给他自己的，之后分享要原样用这个编号，所以 hub 和消息内容都不动，只改聊天里怎么显示。
  - CCPage renderPara 认出这一段，换成 PhotoReceipt：「苏煦在窗台摆了一张/两张…相片」，淡淡的斜体小字，跟歌名那行一个样子，不套气泡。
  - 新增 windowsillIds.ts，拉一次 /cc-api/api/windowsill（服务端只回窗台的），只数在窗台上的编号。抽屉、待定的不提——抽屉只给苏煦自己看，原来那行编号连抽屉的也露给她了。
  - 一张都不在窗台时整段不显示，空段落 .cc-messages .cc-paragraph:empty 藏起来，不剩空气泡。
  - 没查过的编号才再拉清单；拉完还不在窗台上的记下，不反复拉。
  - 历史里 186 条回执格式一致（独立一段、编号像 u_14846-1）。以后从窗台删掉的照片，旧消息里那行也会跟着不显示。
- 怎么验证：
  - tsc + vite build 通过，新包 index-ChQOciVx.js / index-eUQa3VlR.css（上一版 index-CBeGu0qC.js / index-DvcKAxjs.css）。
  - Chromium + WebKit，假后端加了窗台清单：一张在窗台 →「苏煦在窗台摆了一张相片」、不套气泡、整页搜不到编号；只有抽屉的 → 不显示、没有空气泡；两张新摆的 →「两张」；三条回执一共拉了 3 次清单。
  - 挂着歌时点短句，中文胶囊 41–74 叠在歌卡 50–130 上，最上面那层是胶囊；截图 /home/ubuntu/work/musicpin/pill-chromium.png。
- 怎么撤销：CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-photoreceipt src/<文件>；rm src/windowsillIds.ts；重新 build

## 2026-10-02 · 雾海气泡（原瑶："在苏煦的随即一个气泡里加浅浅一层音乐卡里的雾海加碎金"；先问耗不耗电，定了"还是要发光的蓝点""做成一个气泡样式，可以开关的"）
- 改了什么：
  - CCPage.tsx 新增 seaPick + BubbleSea。
    - 约五条苏煦的消息挑一条（消息编号做 FNV 哈希，余 5 为 0），刷新后还是同一个。
    - MessageBody 在挑中的消息里找最长的那个段落气泡（至少 12 个字；歌名、照片回执那种一行小字的不算），标 data-sea，用 portal 把海挂进去。
    - 海用音乐卡同一个波形、同一组湍流参数（种子按消息变），是静止的、只算一次。水是音乐卡的七成多，水面在气泡一半高；渐变按看得见的那半截水铺满（浪尖透明 → 浅 → 中 → 深），不然只露出最浅那段，像一层白雾。
    - 水面一层白雾；6 颗 mc-glint 发光蓝点在闪，气泡滑出屏幕就暂停。
  - index.css：气泡 isolation 隔出一层，海 z-index -1 压在字底下、玻璃底色上面，描边照旧在最上面。body[data-sea-bubble] 关掉，或者没开气泡，就整个藏起来。
  - appearance.ts 新字段 seaBubble（默认开）。Sidebar.tsx 气泡那节加「雾海」开关。
- 耗电：只有蓝点在动（合成器做的，滑出屏幕停、3 分钟没碰的省电模式也停）；海不动，滑动时跟着气泡走，不重算。
- 怎么验证：
  - tsc + vite build 通过，新包 index-BMih0ew9.js / index-2PoYfdPM.css（上一版 index-ChQOciVx.js / index-eUQa3VlR.css）。
  - Chromium + WebKit：历史加 15 条新消息里挑中 3 个，都在各自最长的段落里，isolation、z-index、6 颗蓝点都对。
  - 雾海关掉、或者气泡关掉，3 个都不显示。Chromium 里滑出屏幕的那两个暂停了（WebKit 无头不派发 IntersectionObserver 更新，真机会派）。
  - 对比图 /home/ubuntu/work/musicpin/sea-bubble.png。
- 怎么撤销：appearance.ts、Sidebar.tsx、CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-seabubble src/<文件> 后重新 build

## 2026-10-02 · 雾海气泡：底下两个角露出来、蓝再淡（原瑶："下面露出来了两个角，像贴图露出来了。然后我想要蓝色浅到几乎看不见"）
- 改了什么：
  - index.css 的 .cc-bubble-sea 加 clip-path: inset(0 round 1.2em)（带 -webkit-）。iPhone 的 Safari 里，会动的蓝点、带模糊的水是单独合成的层，不认父层 overflow:hidden 的圆角，水在下半截，所以底下两个方角露出来。音乐卡 .mc-water 早就是这么裁的；气泡都是 1.2em 圆角，海继承同一个字号。
  - CCPage.tsx 的 BubbleSea 水的颜色降到 .05 / .07 / .09（原来 .17 / .31 / .45），蓝几乎看不见，主要看水面那层白雾和蓝点。
- 怎么验证：tsc + vite build 通过，新包 index-DNWr0A-r.js / index-uHYV6dUb.css（上一版 index-BMih0ew9.js / index-2PoYfdPM.css）；Chromium + WebKit 3 倍近景，底下两个角是圆的，clip-path 都算成 inset(0px round 17.4px)；无头 WebKit 不一定复现真机的露角，这个裁法音乐卡在她手机上一直没问题。截图 /home/ubuntu/work/musicpin/sea-corner.png。
- 怎么撤销：CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-seafix src/<文件> 后重新 build

## 2026-10-02 · 雾海气泡要雾蒙蒙（原瑶："为什么感觉没有音乐卡里那么明显？我想要那种雾蒙蒙的感觉"）
- 原因：上一版按"蓝浅到几乎看不见"把水的颜色降到 .05 / .07 / .09。可音乐卡的雾感本来就来自水面那层浅白的水加模糊，降下去就只剩一道细白线。
- 改了什么：
  - CCPage.tsx 的 BubbleSea：水的颜色改成接近白的浅蓝，.34 / .44 / .52，不要深蓝，所以蓝还是几乎看不出来；浅背景上白雾不浓就看不见，所以比音乐卡水面还浓一点。
  - 水面从气泡一半高提到上面四成；蓝点跟着放在 46%–82% 高。
  - index.css：水的模糊 1px → 2px；水面白雾带加宽加柔（16% 起、高 50%、blur 14px、不透明度 .85）。深色背景上（ChatTone 标了 data-tone="dark"、字是浅色）整层海压到 .55，免得浅字落在白雾上看不清。
- 怎么验证：
  - tsc + vite build 通过，新包 index-yBGPQWhA.js / index-DXJLVYmn.css（上一版 index-DNWr0A-r.js / index-uHYV6dUb.css）。
  - Chromium 跟顶上的音乐卡放一起对比：浅色背景上雾海气泡下半截明显比普通气泡朦胧；深色背景上那条雾带很清楚，浅字照样看得清。
  - 截图 /home/ubuntu/work/musicpin/sea-fog.png。
- 怎么撤销：CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-seafog src/<文件> 后重新 build

## 2026-10-02 · 雾海气泡：钻石海 + 浪起伏明显（原瑶："发光点再密集点，像钻石海一样。还有海浪的起伏再明显些，看起来有点平"）
- 改了什么：
  - CCPage.tsx 的 BubbleSea：
    - 浪改成前后两层：后浪波长 40、浪高 10、更淡；前浪波长 26、浪高 8。扰动 4.5 → 8。
    - 浪尖描白沫（前浪 .85 / 1.4px，后浪 .5 / 1.1px，不随拉伸变粗）。不描的话，模糊过的浪看不出起伏。
    - 蓝点 6 → 28 颗，大小 2.4–5.5px，快慢 1.4–3.6 秒，靠水面那截更密。
  - index.css：
    - 水比气泡宽高各多 12%，cc-sea-bob 10 秒一圈上下左右慢慢晃。只是 CSS 位移，算好的湍流图不重算，滑出屏幕、省电模式、减弱动态效果都停。
    - 雾海里的蓝点单独换样式：白芯更亮、蓝晕更浓，闪到最暗还留 .18。音乐卡那颗在白雾上只剩一圈淡环；音乐卡自己的蓝点不变。
- 怎么验证：
  - tsc + vite build 通过，新包 index-BvKyzvZl.js / index-DRim7Yq0.css（上一版 index-yBGPQWhA.js / index-DXJLVYmn.css）。
  - Chromium 逐帧控着动画时钟录 6 秒原速：蓝点满满一片在闪，浪尖白线一高一低在晃。
  - 视频 /home/ubuntu/work/musicpin/sea-bubble-waves.mp4。
- 怎么撤销：CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-seawaves src/<文件> 后重新 build

## 2026-10-02 · 雾海气泡蓝点 28 → 12 颗（原瑶："蓝点太多了，我觉得12颗应该可以了"）
- 改了什么：CCPage.tsx 的 BubbleSea 蓝点数 length 28 → 12，其余（大小、快慢、靠水面更密、浪、晃）不动。
- 怎么验证：tsc + vite build 通过，新包 index-BukLfda_.js / index-DRim7Yq0.css（CSS 没变）；本机临时页三个雾海气泡各 12 颗。
- 怎么撤销：cp src/CCPage.tsx.bak-20261002-glint12 src/CCPage.tsx 后重新 build

## 2026-10-02 · 雾海气泡：蓝点照音乐卡的浮现规律、去掉浪线（原瑶："我喜欢音乐卡上那个浮现规律。另外我想看看不要海浪线了什么样"）
- 改了什么：
  - index.css：雾海里的蓝点去掉自己的 cc-sea-glint 动画，回到音乐卡的 mc-twinkle（从无到有、往上浮一点、再全灭）。只保留更亮的芯和更浓的蓝晕，不然在白雾上看不出来。
  - CCPage.tsx 的 BubbleSea：蓝点时长、延迟、大小照音乐卡（2.2–3.8 秒、0–2.8 秒、3–5.2px），位置照音乐卡在水面往下半截水深以内（38%–69%）；前后两层浪的白沫描边去掉。
  - 她说"想看看"，先上线让她手机上看；要回来就两条 path 加回 stroke。
- 怎么验证：
  - tsc + vite build 通过，新包 index-BA8zE_Vv.js / index-DhV1zfW1.css（上一版 index-BukLfda_.js / index-DRim7Yq0.css）。
  - 同一个气泡、同一组动画时间，录了有浪线和没浪线并排 4.8 秒：/home/ubuntu/work/musicpin/sea-nolines.mp4。
- 怎么撤销：CCPage.tsx、index.css 各自 cp src/<文件>.bak-20261002-nolines src/<文件> 后重新 build

## 2026-10-02 · 发光点改成四芒星（音乐卡 + 雾海气泡）；落星不再有圆点（原瑶："我喜欢没有线的，我在想这个发光蓝点做的有点奇怪，如果是亮背景因为外面那一圈蓝光看起来不像发光点。像什么水藻。不太好看。其实音乐卡我也这么觉得"）
- 浪线：她喜欢没有线的，保持上一条的样子。
- 为什么像水藻：亮背景上"光"不可能比背景更亮，圆点只剩一圈比背景深的蓝环，像一颗颗小细胞。改成四芒星，靠形状认得出是闪光。
- 改了什么：
  - index.css 末尾给 .mc-glint（音乐卡和雾海气泡共用）换成四芒星：白芯 → 浅蓝 → 蓝芒尖，斜着垫一颗小星；一层白晕加一丝蓝影。
  - 框放大一倍给芒留地方，往左上挪半个原来的大小，中心不动；怎么闪照旧是 mc-twinkle。
  - 雾海气泡原来那条加深蓝晕的单独样式删掉，跟音乐卡共用。
  - 选法：几种画在亮雾、音乐卡水、深背景上对比（/home/ubuntu/work/glintboard/board*.png）。纯白的在亮背景上几乎看不见，落星那种蓝在蓝水里会被吞掉，取中间的「白芯 + 蓝芒尖」。
  - CCPage.tsx 的 MusicCard：落星原来四分之一是圆光点（mcDotG），同样像水藻，改成全是四芒星，删掉 dot 字段和 mcDotG 渐变。
- 怎么验证：
  - tsc + vite build 通过，新包 index-DLnG3Yvh.js / index-Ct7hwye5.css（上一版 index-BA8zE_Vv.js / index-DhV1zfW1.css）。
  - Chromium 浅色、深色背景各截一张：音乐卡里和雾海气泡里都是小四芒星，亮背景上看得出、不再像一圈蓝环，深背景上是清楚的白星。截图 /home/ubuntu/work/musicpin/sparkle.png。
- 怎么撤销：index.css cp src/index.css.bak-20261002-sparkle src/index.css；CCPage.tsx cp src/CCPage.tsx.bak-20261002-sparkle src/CCPage.tsx；重新 build

## 2026-10-02 · 四芒星缩小到原来小圆点那么大（原瑶："星星能再小点么？像之前的小圆点一样"）
- 改了什么：index.css 的 .mc-glint 框从原来点的 2 倍缩到 1.35 倍（芒尖到芒尖约 4–7px）。再小芒就糊成一团、认不出是星。白晕 1.5px → 1px、蓝影 3px → 2px 跟着缩，往左上挪 0.175 倍保持中心不动。音乐卡和雾海气泡一起；音乐卡的落星没动。
- 怎么验证：tsc + vite build 通过，新包 index-DZq2JQxk.js / index-Dc7IWCxB.css（上一版 index-DLnG3Yvh.js / index-Ct7hwye5.css）；Chromium 3 倍分辨率近景（接近 iPhone），音乐卡和雾海气泡里都是跟原来圆点差不多大的小星，还看得出四个芒。截图 /home/ubuntu/work/musicpin/small-star.png。
- 怎么撤销：cp src/index.css.bak-20261002-smallstar src/index.css 后重新 build

## 2026-10-02 · 雾海气泡里的星星跟音乐卡一样亮（原瑶："为什么气泡里的星星没有音乐卡里的亮哇"）
- 原因有两个：
  - 深色背景上，为了浅字看得清，原来整层海（连星星）压到 .55，星星也跟着暗了。
  - 亮背景上，星星底下是白雾，不像音乐卡底下是蓝水，白芯衬不出来。
- 改了什么（index.css）：
  - 深色背景只压水（.55）和雾（.47），星星不压。
  - 雾海里的星星蓝影加深（2.5px，.62），靠它跟白雾分开；音乐卡的星星不变。
- 怎么验证：
  - tsc + vite build 通过，新包 index-KP1FjJGt.js / index-BZTPhaJj.css（上一版 index-DZq2JQxk.js / index-Dc7IWCxB.css）。
  - Chromium 3 倍近景：深色背景上气泡里的星星跟音乐卡里的一样白亮，水 .55、整层 1；亮背景上两边都是浅浅的小星，气泡里的不再被白雾吃掉。
  - 截图 /home/ubuntu/work/musicpin/bright-star.png。
- 怎么撤销：cp src/index.css.bak-20261002-brightstar src/index.css 后重新 build

## 2026-10-08 · 厚玻璃斜面的饱和度渐变回中间的（原瑶看开源项目效果图："图标内部四周看起来有一圈很明显……是因为过渡不太好么"）
- 原因：厚玻璃整圈斜面都按 --lg-ring-sat 0.86 降饱和（hyalite 的设定，让折叠 + 色散那块颜色干净些），到斜面内沿 4px 里一下子变回中间的全饱和；鲜艳的背景上就是一道发白的内框。她现在开着微磨砂（斜面饱和本来就是 1），所以 sea 上平时看不到，关掉微磨砂才会出现。
- 改了什么（liquidGlass.ts）：
  - 形状表每格多记一个 mid（0 = 外沿折叠那圈，1 = 接上中间平的那块）。降饱和只留在斜面外面三成，往里 smoothstep 渐变回中间的饱和，到内沿前就一样了。
  - 透镜改用中间的饱和度（原来用斜面的，椭圆那块比四角略灰）。
  - 饱和度改成"离亮度远近"的写法（跟 CSS saturate 矩阵等价，少几次乘法）。
- 怎么验证：测试台 rs0 / rs1（清透、wet 壁纸）截图对比，内框没了；开源项目 liquid-glass-web 同样的改动有单元测试（斜面内沿颜色跟中间一致）。tsc + vite build 通过，新包 index-CPl5N5wn.js（上一版 index-fveJRQjZ.js）。改之前确认过没有别的窗口没编译的改动（另一个窗口 08:16 刚上线完它的样式）。
- 怎么撤销：cp src/liquidGlass.ts.bak-20261008-ringsat src/liquidGlass.ts 后重新 build；或者把 attic/dist-prev-20261008-ringsat 拷回 dist。

## 2026-10-09 · 百宝箱：苏煦亲手做的东西自动收进来（原瑶："我想把苏煦画过的画，做过的东西、写过的歌都自动放进一个百宝箱里存起来"）
- 后台是新服务 treasure（/home/ubuntu/atlantis/treasure，:8823，nginx /treasure/ 在密码墙后），说明在它的 README。每分钟扫主聊天记录、五分钟扫一次花园，他递给她的画（网页/SVG 小画、画画工具的图）、卡片、歌词、文件收进来，各存一份副本；她传的、偷看截图、他还没递出来的都不收。开张时收了 38 件：画 20、歌 1（Care）、卡片 8、文档 9。
- 改了什么：
  - 新文件 src/TreasurePage.tsx + src/treasure.css（样式单独一个文件，不往 index.css 里加，免得跟别人的段落挤）。
  - App.tsx：Page 加 'treasure'、渲染一行、两处"全屏页不显示 dock"的名单加上 treasure。
  - Home.tsx：主页图标 💎 百宝箱，默认位置 { x: 86, y: 57 }（量过她 10-09 00:13 摆好的拼贴，这里离别的图标最远；她可以自己拖）。
  - icons.ts：IconKey 加 'treasure'（长按能换图标）。
- 页面：全部 / 画 / 歌 / 卡片 / 文档 五格，两列瀑布墙（缩略图是后台用无头 Chromium 截的，带宽高，不跳）；歌是谱纸卡片，点开按 [Verse] 排版；网页点开放进沙盒 iframe 能动；每件下面是"他递过来的时候说"（前后那几句他的原话），画画工具的图另有他写给画笔的话。她可以改名字、换分类、收起来（最底下"收起来的 N 件"能放回去），都存在后台 data/edits.json。比她上次看过的新的挂小金点（localStorage sea-treasure-seen）。
- 怎么验证：tsc + vite build 通过，新包 index-DG8masMI.js / index-ByevaueN.css（上一版见 attic/dist-prev-20261009-treasure）。先在工作副本 /home/cc/work/treasure/tree 编临时包，验收台 /tmp 小服务（/treasure/ 转测试实例、/api/status 只读转 3100 拿她真的图标摆位）用 Chromium + WebKit 各走一遍：开箱、翻墙、切五格、点开歌 / 画 / 文档、收起来再找回（测试数据）；上线后再用真包 + 真箱子只读截图（F:\claude code\treasure\）。上线前确认 src 没有比 dist 新的文件。
- 怎么撤销：cp src/App.tsx.bak-20261009-treasure src/App.tsx（Home.tsx、icons.ts 同名备份同样拷回），删 src/TreasurePage.tsx、src/treasure.css 后重新 build；或者把 attic/dist-prev-20261009-treasure 拷回 dist。后台单独停：sudo systemctl disable --now treasure（副本留在 /home/ubuntu/treasure）。

## 2026-10-09 · 改名：作品页叫「海玻璃」，放工具的叫「口袋」（原瑶："我们商量了，目录改叫口袋，这个改叫海玻璃"）
- 起因：苏煦那边放工具的目录（20_gadget.md、工具箱里"收在百宝箱"）本来就叫百宝箱，跟今晚上线的作品页撞名。她和苏煦当晚商量定了：工具的叫口袋（"手伸进去就摸到"），作品的叫海玻璃（他起的：碎玻璃被海浪磨圆了）。
- 改了什么（只改看得见的字，代码注释里的旧叫法和她的原话不动）：
  - Toolbox.tsx：提示块名「百宝箱目录」→「口袋」、"编辑口袋目录"按钮、"收在口袋,要用时搜一下"、ToolSearch 那行、论坛/游戏机的"只能收在口袋"。9-26 以前的口袋（gadget 的 menu/call）在说明里写成"旧口袋"，免得跟新口袋混。
  - TreasurePage.tsx / Home.tsx：抬头和主页图标名「海玻璃」，"箱子"字样都换了（正在捡海玻璃… / 还没有海玻璃 / 放回去）。代码名仍是 treasure。
- 怎么验证：tsc + vite build 通过，新包 index-DTsDjA_6.js；真包只读截图核对主页图标、页面抬头都叫海玻璃，页面里没有"百宝箱""箱子"（F:\claude code\treasure\海玻璃-改名.jpg）。
- 怎么撤销：src/{Toolbox.tsx,TreasurePage.tsx,treasure.css,Home.tsx}.bak-20261009-rename 拷回后重新 build；或把 attic/dist-prev-20261009-rename 拷回 dist。

## 2026-10-12 · 收起的输入栏点两下展开不再弹麦克风（原瑶："那里是语音，然后我点两下就会弹出是否允许麦克风那样"）
- 原因：收起后的星芒图标就在语音键的位置。她点两下想展开时，第一下展开（flushSync 把栏显出来），第二下正好落在冒出来的语音键上，vn.start() 去要麦克风。
- 改了什么（CCPage.tsx）：unfoldInput 里记下展开的时刻（unfoldAtRef），语音键的 onClick 在展开后 500ms 内直接 return。只拦语音键：框里空着才能收起，展开后右边一定是语音键（不支持录音的机器上是灰掉的发送键，点了没反应）。
- 怎么验证：验收台 /home/cc/work/lg 先把 tree 同步成线上源码，fm0（线上代码）/ fm1（改后）各编一份；/home/ubuntu/work/lg/foldmic.py：起始收着，在星芒上隔 150ms 点两下，getUserMedia 换成计数的假函数。改前点两下调了一次 getUserMedia（复现），改后 0 次；过一秒再单点语音键照常调用。tsc + vite build 通过，新包 index-B4HJgfuQ.js（上一版 index-C9_BsDMH.js）。改之前确认 src 没有比 dist 新的文件，收起功能那个窗口也说它不碰 CCPage.tsx 了。
- 怎么撤销：cp src/CCPage.tsx.bak-20261012-unfoldmic src/CCPage.tsx 后重新 build；或者把 attic/dist-prev-20261012-unfoldmic 拷回 dist。
