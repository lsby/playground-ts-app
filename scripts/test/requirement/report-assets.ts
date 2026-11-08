export let 交互脚本 = `
  let themeControl = document.querySelector('[data-report-theme]')
  let themeKey = 'requirement-report-theme'
  function applyTheme(value) {
    if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value
    else delete document.documentElement.dataset.theme
  }
  try {
    let savedTheme = localStorage.getItem(themeKey)
    if (savedTheme === 'light' || savedTheme === 'dark') {
      themeControl.value = savedTheme
      applyTheme(savedTheme)
    }
  } catch { /* 本地 HTML 或隐私设置可能禁止访问浏览器存储。 */ }
  themeControl.addEventListener('change', () => {
    applyTheme(themeControl.value)
    try {
      if (themeControl.value === 'system') localStorage.removeItem(themeKey)
      else localStorage.setItem(themeKey, themeControl.value)
    } catch { /* 当前页面仍可切换主题。 */ }
  })

  let layout = document.querySelector('[data-initial-point]')
  let points = [...document.querySelectorAll('[data-point]')]
  let requirements = [...document.querySelectorAll('[data-requirement]')]
  let requirementGroups = [...document.querySelectorAll('[data-requirement-group]')]
  let flows = [...document.querySelectorAll('[data-flow]')]
  let links = [...document.querySelectorAll('[data-acceptance]')]
  function showPoint(id) {
    let selected = points.find(point => point.id === id)
    if (!selected) return null
    let flowIds = selected.dataset.flowIds.split(' ')
    let group = requirementGroups.find(group => group.dataset.requirementGroup === selected.dataset.requirementId)
    if (group) group.open = true
    for (let point of points) point.hidden = point !== selected
    for (let requirement of requirements) requirement.hidden = requirement.id !== selected.dataset.requirementId
    for (let flow of flows) flow.hidden = !flowIds.includes(flow.id)
    for (let link of links) {
      if (link.dataset.acceptance === id) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
    return selected
  }
  function showFromHash() {
    let selected = showPoint(location.hash.slice(1))
    if (!selected) showPoint(layout.dataset.initialPoint)
  }
  for (let link of links) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      let selected = showPoint(link.dataset.acceptance)
      if (!selected) return
      if (location.hash !== link.hash) history.pushState(null, '', link.hash)
      if (matchMedia('(max-width:620px)').matches) selected.scrollIntoView({block:'start'})
      else window.scrollTo(0, 0)
    })
  }
  for (let gallery of document.querySelectorAll('[data-gallery]')) {
    let frames = [...gallery.querySelectorAll('[data-frame]')]
    let zoomButtons = [...gallery.querySelectorAll('[data-zoom]')]
    let previous = gallery.querySelector('[data-prev]')
    let next = gallery.querySelector('[data-next]')
    let counter = gallery.querySelector('[data-index]')
    let index = 0
    let zoomed = false
    function showFrame(step) {
      index = (index + step + frames.length) % frames.length
      for (let [position, frame] of frames.entries()) frame.hidden = position !== index
      if (counter) counter.textContent = String(index + 1) + ' / ' + String(frames.length)
    }
    for (let button of zoomButtons) {
      button.onclick = () => {
        zoomed = !zoomed
        for (let item of zoomButtons) item.setAttribute('aria-pressed', String(zoomed))
      }
    }
    if (previous) previous.onclick = () => showFrame(-1)
    if (next) next.onclick = () => showFrame(1)
  }
  addEventListener('hashchange', showFromHash)
  showFromHash()
`

export let 样式 = `
*{box-sizing:border-box}
html{color-scheme:light dark}
html[data-theme=light]{color-scheme:light}
html[data-theme=dark]{color-scheme:dark}
body{margin:0;background:light-dark(#f2f5f4,#111a17);color:light-dark(#182824,#e5f0ea);font:14px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
button{font:inherit}
a:focus-visible,button:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid light-dark(#367b68,#7bc7a8);outline-offset:2px}
header{background:light-dark(#183d34,#122c23);color:light-dark(#fff,#e5f0ea)}
.bar{max-width:1440px;margin:auto;min-height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;gap:12px}
.brand{display:flex;gap:12px;align-items:center;font-weight:700;font-size:17px;letter-spacing:.03em}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:light-dark(#d3f0da,#b4e4ca);color:light-dark(#1b543f,#173f30)}
.sample{border:1px solid light-dark(#5f8278,#668d7d);color:light-dark(#f1fcf6,#e2f3e9);padding:4px 10px;border-radius:7px;font-size:12px}
.layout{max-width:1440px;margin:auto;padding:28px 36px 44px;display:grid;grid-template-columns:310px minmax(0,1fr);gap:24px;align-items:start}
.surface{background:light-dark(#fff,#1a2621);border:1px solid light-dark(#dbe4df,#35483f);border-radius:12px}
.nav{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto}
.navhead{padding:21px 19px 13px}
.label{font-size:12px;letter-spacing:.1em;font-weight:700;color:light-dark(#526d63,#a8c6b8)}
.requirement-group{margin:0 12px 8px}
.requirement{padding:12px 10px;background:light-dark(#f5f8f6,#24352d);border-radius:8px;display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:9px;font-size:15px;font-weight:700;cursor:pointer;list-style:none;overflow-wrap:anywhere}
.requirement::-webkit-details-marker{display:none}
.requirement::before{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(-45deg)}
.requirement-group[open]>.requirement::before{transform:rotate(45deg)}
.point-count{color:light-dark(#60736b,#a6bfb4);font-size:12px;font-weight:400;white-space:nowrap}
.points{display:grid;padding:6px 0 2px;gap:3px}
.point{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;text-align:left;border:1px solid transparent;border-radius:8px;background:light-dark(#fff,#1a2621);padding:10px 7px;color:light-dark(#263c33,#daece2);cursor:pointer;text-decoration:none;overflow-wrap:anywhere}
.point:hover{background:light-dark(#f4f8f5,#293b32)}
.point[aria-current=true]{background:light-dark(#e8f4ed,#254838);border-color:light-dark(#a4c9b6,#527e69)}
.point .badge{justify-self:end;justify-content:center;min-width:52px;font-size:11px}
.muted{color:light-dark(#52665e,#b5c9bf)}
.navfoot{border-top:1px solid light-dark(#e2e9e5,#35483f);padding:15px 18px;font-size:12px;color:light-dark(#52665e,#b5c9bf)}
.layout main{min-width:0}
.hero{padding:20px 25px 22px;margin-bottom:16px}
.breadcrumb{color:light-dark(#5d7167,#a9c0b5);font-size:12px}
.breadcrumb span{padding:0 7px;color:light-dark(#7c9287,#91ac9f)}
h1{margin:4px 0 6px;font-size:29px;line-height:1.27;letter-spacing:-.015em}
p{margin:0}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:6px;padding:3px 8px;font-size:12px;line-height:1.35;font-weight:650;white-space:nowrap}
.ok{color:light-dark(#155e43,#a9e7c9);background:light-dark(#e1f2e8,#234837)}
.manual{color:light-dark(#765118,#f3d094);background:light-dark(#fff2d8,#463720)}
.neutral{color:light-dark(#475f55,#c2d6ca);background:light-dark(#edf2ef,#32443b)}
.pointcard{padding:19px 25px;margin-bottom:16px;border-left:4px solid light-dark(#43886c,#6bba98)}
.pointcard.pendingbar{border-left-color:light-dark(#be8a3d,#d0a65e)}
.headline{display:flex;justify-content:space-between;align-items:start;gap:10px}
.pointcard h2{font-size:21px;margin:4px 0 5px;line-height:1.4}
.flow{overflow:hidden}
.flowhead{padding:20px 25px 17px;border-bottom:1px solid light-dark(#e3ebe6,#35483f)}
.flowhead h3{font-size:19px;margin:5px 0 6px;line-height:1.4}
.cover-title{margin-top:10px;color:light-dark(#52665e,#b5c9bf);font-size:12px}
.covers{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cover{border:1px solid light-dark(#d8e5dd,#456052);border-radius:5px;font-size:11px;padding:2px 6px;color:light-dark(#4a6559,#b0cbbb)}
.cover[aria-current=true]{background:light-dark(#e7f3ec,#254838);color:light-dark(#225e48,#ace4ca);border-color:light-dark(#c4dfd0,#527e69)}
.timeline{list-style:none;margin:0;padding:12px 25px 17px}
.step{position:relative;display:grid;grid-template-columns:35px minmax(0,1fr);gap:10px;padding:9px 0}
.step:not(:last-child)::after{position:absolute;content:"";width:1px;left:13px;top:38px;bottom:-9px;background:light-dark(#cddcd4,#456052)}
.num{display:grid;place-items:center;width:28px;height:28px;background:light-dark(#eff3f1,#25372e);border:1px solid light-dark(#dbe4df,#35483f);border-radius:50%;font-size:12px;color:light-dark(#4a675a,#b4cebf);font-variant-numeric:tabular-nums}
.observe .num{background:light-dark(#e5f3eb,#254838);color:light-dark(#17664a,#a7e2c6);border-color:light-dark(#b9d9c9,#527e69)}
.stepbody{padding-top:2px;min-width:0}
.stepmeta{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:4px}
.stepmeta .type{font-size:12px;font-weight:700;color:light-dark(#516d61,#a9c6b8)}
.observe .stepmeta .type{color:light-dark(#216e51,#9ddcbd)}
.timing{font-size:12px;color:light-dark(#576d62,#a8beb3);white-space:nowrap}
.step h4{font-size:15px;margin:0;font-weight:670}
.step-attachments{display:grid;gap:8px;margin-top:9px;background:light-dark(#f4faf6,#1d3228);border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:8px;padding:10px 12px}
.step-attachments p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.step-image{display:block;width:min(65%,420px);padding:0;border:0;background:none;border-radius:6px;cursor:zoom-in}
.step-image[aria-pressed="true"]{width:100%;cursor:zoom-out}
.step-image img{display:block;width:100%;height:auto;border-radius:6px}
.gallery-frame{margin:0}
.gallery-frame figcaption{margin-top:4px;color:light-dark(#52665e,#b5c9bf);font-size:12px}
.gallery-controls{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.gallery-controls button{cursor:pointer;border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:5px;background:transparent;color:inherit;min-width:30px}
.attachment-preview{display:block;width:min(100%,420px);height:auto;margin-top:4px;border-radius:6px}
.attachments summary{font-size:12px;color:light-dark(#2f6752,#a2dfc3);cursor:pointer}
.empty{margin:16px 25px 0;padding:12px 14px;background:light-dark(#fff7e9,#382c1a);color:light-dark(#785415,#f3d094);border-radius:7px}
.attachments{border-top:1px solid light-dark(#e3ebe6,#35483f);padding:14px 25px;color:light-dark(#597165,#a8beb3);font-size:12px}
.attachments p{margin-top:7px}
.foot{margin:13px 2px 0;color:light-dark(#5c7166,#a8beb3);font-size:12px}
@media(max-width:850px){.layout{grid-template-columns:220px minmax(0,1fr);padding:16px;gap:12px}
.bar{padding:0 16px}
.flowhead,.hero,.pointcard,.timeline{padding-left:16px;padding-right:16px}}
@media(max-width:620px){.layout{display:block}
.nav{position:static;max-height:none;margin-bottom:15px}
.point{padding:7px}
.hero h1{font-size:24px}
.headline{flex-wrap:wrap}}
[hidden]{display:none!important}
.bar-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bar-meta a{color:light-dark(#e1f2e8,#b4e4ca);font-size:12px}
.theme-control{display:flex;align-items:center;gap:6px;font-size:12px}
.theme-control select{font:inherit;color:inherit;background:transparent;border:1px solid light-dark(#5f8278,#668d7d);border-radius:7px;padding:4px 6px}
.theme-control option{color:CanvasText;background:Canvas}
.fail{color:light-dark(#922f28,#ffb8b0);background:light-dark(#fbeae7,#482824)}
.pointcard.failurebar{border-left-color:light-dark(#bd5147,#e18175)}
.problem{margin-top:9px;border-radius:6px;background:light-dark(#fff0ee,#38211e);padding:9px 10px;color:light-dark(#822d26,#ffb8b0);white-space:pre-wrap;overflow-wrap:anywhere}
.problem pre{margin:0;white-space:pre-wrap}
.problems{margin-top:8px}
.flow+.flow{margin-top:16px}
.cover{text-decoration:none}
.cover:hover{text-decoration:underline}
.runhead{margin:0;padding:12px 25px;font-size:13px;cursor:pointer}
.run-problems{padding:0 25px 6px}
.run+.run{border-top:1px solid light-dark(#e3ebe6,#35483f)}
.attachments ul{margin:8px 0 0;padding-left:20px}
.attachments a{color:light-dark(#2f6752,#a2dfc3)}
@media(max-width:620px){.bar{padding-top:10px;padding-bottom:10px}.bar-meta{gap:5px}.runhead,.run-problems{padding-left:16px;padding-right:16px}.empty{margin-left:16px;margin-right:16px}}
`
