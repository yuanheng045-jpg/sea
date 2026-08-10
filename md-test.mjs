// Markdown 渲染验收：直接把源文件编译后服务端渲染，比肉眼看截图更准
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { transform } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const src = readFileSync('./src/miniMarkdown.tsx', 'utf8')
const out = await transform(src, { loader: 'tsx', jsx: 'automatic', format: 'esm' })
writeFileSync('./.md-tmp.mjs', out.code)
const { Markdown } = await import('./.md-tmp.mjs')
unlinkSync('./.md-tmp.mjs')

const html = (text, props = {}) => renderToStaticMarkup(createElement(Markdown, { text, ...props }))

const cases = [
  ['粗体斜体行内码', '这里 **很重** 和 *斜的* 还有 `code()`', h => h.includes('<strong>很重</strong>') && h.includes('<em>斜的</em>') && h.includes('cc-md-inline">code()')],
  ['无序清单', '- 苹果\n- 梨子\n- 桃', h => (h.match(/<li>/g) || []).length === 3 && h.includes('cc-md-ul')],
  ['有序清单', '1. 一\n2. 二', h => h.includes('cc-md-ol') && h.includes('<li>一</li>')],
  ['代码块', '```js\nconst a = 1\n```', h => h.includes('cc-md-pre') && h.includes('const a = 1')],
  ['流式未闭合代码块', '```py\nprint(1)', h => h.includes('cc-md-pre') && h.includes('print(1)')],
  ['标题', '## 小标题', h => h.includes('cc-md-h2') && h.includes('小标题')],
  ['井号无空格不算标题', '#不是标题', h => !h.includes('cc-md-h') && h.includes('#不是标题')],
  ['引用', '> 她说她不撒娇', h => h.includes('cc-md-quote') && h.includes('她说她不撒娇')],
  ['分割线', '正文\n\n---\n\n后文', h => h.includes('cc-md-hr')],
  ['乘号不被吃', '3 * 4 * 5 = 60', h => !h.includes('<em>') && h.includes('3 * 4 * 5')],
  ['安全链接放行', '[花园](https://galatea.abysslumina.com/x)', h => h.includes('rel="noopener noreferrer"') && h.includes('href="https://galatea')],
  ['危险协议拦下', '[点我](javascript:alert(1))', h => !h.includes('<a ') && h.includes('[点我]')],
  ['附件标记不被吃', '[[img: /uploads/a.png]] 看这张', h => h.includes('[[img: /uploads/a.png]]') && !h.includes('<a ')],
  ['颜文字原样', 'ᐢ..ᐢ (╯°□°)╯ 哼', h => h.includes('ᐢ..ᐢ') && h.includes('(╯°□°)╯')],
  ['段内单换行保留', '第一行\n第二行', h => h.includes('第一行\n第二行')],
  ['空行分段', 'A\n\nB', h => (h.match(/<p/g) || []).length === 2],
  ['嵌套：粗体里的行内码', '**看 `here` 这里**', h => h.includes('<strong>') && h.includes('cc-md-inline')],
  ['主聊天气泡类名', '- 一\n- 二', h => h.includes('cc-paragraph cc-md-block'), { blockClass: 'cc-paragraph' }],
  ['纯文本快路径', '今天下雨了，我想你。', h => h.includes('今天下雨了，我想你。') && !h.includes('cc-md-block')],
]

let bad = 0
for (const [name, text, check, props] of cases) {
  const h = html(text, props || {})
  const ok = check(h)
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '\n    → ' + h}`)
}
console.log(bad ? `\n❗ ${bad} 例不过` : `\n全部 ${cases.length} 例通过`)
process.exit(bad ? 1 : 0)
