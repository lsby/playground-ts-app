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

  let layout = document.querySelector('.layout')
  let main = layout.querySelector('main')
  let directory = layout.querySelector('nav')
  let resizer = layout.querySelector('.directory-resizer')
  let requestedWidth
  let drag = null
  function resizeDirectory() {
    if (resizer.offsetWidth === 0) return
    let style = getComputedStyle(layout)
    let available = layout.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    let minimum = 170
    let maximum = Math.min(680, Math.floor(available * 0.55))
    if (requestedWidth !== undefined) {
      let width = Math.max(minimum, Math.min(requestedWidth, maximum))
      layout.style.setProperty('--directory-width', String(width) + 'px')
    }
    resizer.setAttribute('aria-valuemin', String(minimum))
    resizer.setAttribute('aria-valuemax', String(maximum))
    resizer.setAttribute('aria-valuenow', String(directory.offsetWidth))
  }
  resizer.onpointerdown = event => {
    if (event.button !== 0) return
    event.preventDefault()
    resizer.focus({ preventScroll: true })
    drag = { pointer: event.pointerId, x: event.clientX, width: directory.offsetWidth }
    resizer.setPointerCapture(event.pointerId)
  }
  resizer.onpointermove = event => {
    if (drag?.pointer !== event.pointerId) return
    requestedWidth = drag.width + event.clientX - drag.x
    resizeDirectory()
  }
  resizer.onlostpointercapture = () => { drag = null }
  resizer.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    requestedWidth = directory.offsetWidth + (event.key === 'ArrowLeft' ? -20 : 20)
    resizeDirectory()
  }
  new ResizeObserver(resizeDirectory).observe(layout)
  let points = [...document.querySelectorAll('[data-point]')]
  let requirements = [...document.querySelectorAll('[data-requirement]')]
  let requirementGroups = [...document.querySelectorAll('[data-requirement-group]')]
  let pointGroups = [...document.querySelectorAll('[data-acceptance-group]')]
  let flows = [...document.querySelectorAll('[data-flow]')]
  let panels = [...requirements, ...points, ...flows]
  let noSelection = main.querySelector('[data-no-selection]')
  let currentPanel = null
  let stepResets = new Map()
  let links = [...document.querySelectorAll('[data-requirement-target], [data-acceptance]')]
  let directoryLinks = links.filter(link => directory.contains(link))
  function setPointOpen(group, open) {
    for (let item of open ? pointGroups : [group]) {
      let expanded = open && item === group
      item.querySelector('.point-toggle').setAttribute('aria-expanded', String(expanded))
      item.querySelector('.flow-links').hidden = !expanded
    }
  }
  for (let group of pointGroups) {
    let toggle = group.querySelector('.point-toggle')
    toggle.onclick = () => setPointOpen(group, toggle.getAttribute('aria-expanded') === 'false')
  }
  function showPanel(selected, path) {
    for (let panel of panels) panel.hidden = panel !== selected
    noSelection.hidden = selected !== null
    for (let link of directoryLinks) {
      if (link.hash === '#' + path) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
    if (selected !== currentPanel) {
      for (let workspace of selected?.querySelectorAll('[data-step-workspace]') ?? []) stepResets.get(workspace)()
      currentPanel = selected
    }
    main.scrollTop = 0
  }
  function showSelection(path) {
    let [id, flowId, extra] = path.split('/')
    if (extra !== undefined) return false
    let point = points.find(point => point.id === id)
    let requirementId = point?.dataset.requirementId ?? id
    if (!requirements.some(requirement => requirement.id === requirementId)) return false
    if (flowId !== undefined && !point?.dataset.flowIds.split(' ').includes(flowId)) return false
    let selected = panels.find(panel => panel.id === (flowId ?? id))
    if (selected === undefined) return false
    let group = requirementGroups.find(group => group.dataset.requirementGroup === requirementId)
    if (group) group.open = true
    let pointGroup = pointGroups.find(group => group.dataset.acceptanceGroup === id)
    if (pointGroup) setPointOpen(pointGroup, true)
    showPanel(selected, path)
    return true
  }
  function showFromHash() {
    if (!showSelection(location.hash.slice(1))) showPanel(null, '')
  }
  for (let link of links) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      if (!showSelection(link.hash.slice(1))) return
      if (location.hash !== link.hash) history.pushState(null, '', link.hash)
    })
  }
  for (let workspace of document.querySelectorAll('[data-step-workspace]')) {
    let timeline = workspace.querySelector('.timeline')
    let buttons = [...timeline.querySelectorAll('[data-step-select]')]
    let panels = workspace.querySelector('[data-step-panels]')
    let previous = workspace.querySelector('[data-step-prev]')
    let next = workspace.querySelector('[data-step-next]')
    let position = workspace.querySelector('[data-step-position]')
    let current = 0
    function selectStep(index) {
      if (index < 0 || index >= buttons.length || index === current) return
      let before = buttons[current]
      let selected = buttons[index]
      before.removeAttribute('aria-current')
      document.getElementById(before.getAttribute('aria-controls')).hidden = true
      selected.setAttribute('aria-current', 'step')
      document.getElementById(selected.getAttribute('aria-controls')).hidden = false
      current = index
      panels.scrollTop = 0
      position.textContent = String(index + 1) + ' / ' + String(buttons.length)
      previous.setAttribute('aria-disabled', String(index === 0))
      next.setAttribute('aria-disabled', String(index === buttons.length - 1))
      let buttonBounds = selected.getBoundingClientRect()
      let listBounds = timeline.getBoundingClientRect()
      if (buttonBounds.top < listBounds.top) timeline.scrollTop += buttonBounds.top - listBounds.top
      else if (buttonBounds.bottom > listBounds.bottom) timeline.scrollTop += buttonBounds.bottom - listBounds.bottom
    }
    for (let [index, button] of buttons.entries()) button.onclick = () => selectStep(index)
    previous.onclick = () => selectStep(current - 1)
    next.onclick = () => selectStep(current + 1)
    stepResets.set(workspace, () => {
      selectStep(0)
      timeline.scrollTop = 0
      panels.scrollTop = 0
    })
  }
  let dialog = document.querySelector('[data-image-dialog]')
  let fullImage = dialog.querySelector('[data-full-image]')
  let imageTitle = dialog.querySelector('[data-image-title]')
  let dialogControls = dialog.querySelector('[data-gallery-controls]')
  let dialogGallery = null
  let dialogImageButton = null
  let backdropPointer = null

  function onBackdrop(event) {
    if (event.target !== dialog) return false
    let bounds = dialog.getBoundingClientRect()
    return event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom
  }
  dialog.onpointerdown = event => {
    if (event.button === 0 && onBackdrop(event)) backdropPointer = event.pointerId
  }
  dialog.onpointerup = event => {
    if (backdropPointer !== event.pointerId) return
    backdropPointer = null
    if (onBackdrop(event)) dialog.close()
  }
  dialog.onpointercancel = event => {
    if (backdropPointer === event.pointerId) backdropPointer = null
  }

  function updateControls(root, index, count) {
    root.querySelector('[data-index]').textContent = String(index + 1) + ' / ' + String(count)
    root.querySelector('[data-prev]').setAttribute('aria-disabled', String(index === 0))
    root.querySelector('[data-next]').setAttribute('aria-disabled', String(index === count - 1))
  }
  function showFullImage(button, index, count) {
    dialogImageButton = button
    let image = button.querySelector('img')
    imageTitle.textContent = image.alt
    fullImage.alt = image.alt
    fullImage.src = image.src
    dialogControls.hidden = count === 1
    updateControls(dialogControls, index, count)
  }
  function showGalleryPage(gallery, frames, index) {
    for (let [position, frame] of frames.entries()) frame.hidden = position !== index
    if (frames.length > 1) updateControls(gallery, index, frames.length)
  }
  function moveGallery(gallery, direction) {
    let frames = [...gallery.querySelectorAll('[data-frame]')]
    let index = frames.findIndex(frame => !frame.hidden)
    let nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= frames.length) return
    let focusInPage = frames[index].contains(document.activeElement)
    showGalleryPage(gallery, frames, nextIndex)
    if (focusInPage) {
      let target = frames[nextIndex].querySelector('[data-zoom]') ?? gallery.querySelector('[data-next]')
      target.focus({ preventScroll: true })
    }
  }
  function moveFullImage(direction) {
    if (dialogGallery === null) return
    let buttons = [...dialogGallery.querySelectorAll('[data-zoom]')]
    let index = buttons.indexOf(dialogImageButton) + direction
    if (index < 0 || index >= buttons.length) return
    let button = buttons[index]
    let frames = [...dialogGallery.querySelectorAll('[data-frame]')]
    showGalleryPage(dialogGallery, frames, frames.indexOf(button.closest('[data-frame]')))
    showFullImage(button, index, buttons.length)
  }
  function connectGalleryControls(root, move) {
    let controls = root.querySelector('[data-gallery-controls]')
    if (!controls) return
    controls.querySelector('[data-prev]').onclick = () => move(-1)
    controls.querySelector('[data-next]').onclick = () => move(1)
    root.onkeydown = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      if (root === dialog) fullImage.focus({ preventScroll: true })
      move(event.key === 'ArrowLeft' ? -1 : 1)
    }
  }
  for (let gallery of document.querySelectorAll('[data-gallery]')) {
    let buttons = [...gallery.querySelectorAll('[data-zoom]')]
    connectGalleryControls(gallery, direction => moveGallery(gallery, direction))
    for (let [index, button] of buttons.entries()) {
      button.onclick = () => {
        dialogGallery = gallery
        showFullImage(button, index, buttons.length)
        dialog.showModal()
      }
    }
  }
  connectGalleryControls(dialog, moveFullImage)
  dialog.onclose = () => {
    backdropPointer = null
    fullImage.removeAttribute('src')
    dialogImageButton?.focus({ preventScroll: true })
    dialogImageButton = null
    dialogGallery = null
  }
  addEventListener('hashchange', showFromHash)
  showFromHash()
`

export let 样式 = `
*{box-sizing:border-box}
html{color-scheme:light dark}
html[data-theme=light]{color-scheme:light}
html[data-theme=dark]{color-scheme:dark}
body{margin:0;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:light-dark(#f2f5f4,#111a17);color:light-dark(#182824,#e5f0ea);font:14px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
button{font:inherit}
a:focus-visible,button:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid light-dark(#367b68,#7bc7a8);outline-offset:2px}
header{background:light-dark(#183d34,#122c23);color:light-dark(#fff,#e5f0ea)}
.bar{max-width:1440px;margin:auto;min-height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;gap:12px}
.brand{display:flex;gap:12px;align-items:center;font-weight:700;font-size:17px;letter-spacing:.03em}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:light-dark(#d3f0da,#b4e4ca);color:light-dark(#1b543f,#173f30)}
.sample{border:1px solid light-dark(#5f8278,#668d7d);color:light-dark(#f1fcf6,#e2f3e9);padding:4px 10px;border-radius:7px;font-size:12px}
.layout{--directory-width:310px;flex:1;min-height:0;width:min(100%,1440px);margin:0 auto;padding:28px 36px 24px;display:grid;grid-template-columns:var(--directory-width) 16px minmax(0,1fr);gap:4px}
.surface{background:light-dark(#fff,#1a2621);border:1px solid light-dark(#dbe4df,#35483f);border-radius:12px}
.nav,.layout main{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.nav{--directory-line:light-dark(#aebfb7,#587265);--directory-row-mid:14px;--point-toggle-width:22px;--point-toggle-center:calc(var(--point-toggle-width) / 2);font-size:13px;font-weight:400}
.directory-resizer{display:grid;place-items:center;cursor:col-resize;touch-action:none;border-radius:5px}
.directory-resizer::before{content:"";width:2px;height:100%;background:light-dark(#cbd8d1,#40564c);border-radius:2px}
.directory-resizer:hover::before,.directory-resizer:focus-visible::before{background:light-dark(#367b68,#7bc7a8)}
.directory-resizer:focus-visible{outline:2px solid light-dark(#367b68,#7bc7a8);outline-offset:-2px}
.navhead{padding:14px 19px 8px}
.label{font-size:12px;letter-spacing:.1em;font-weight:700;color:light-dark(#526d63,#a8c6b8)}
.requirement-group{margin:0 12px 2px}
.requirement{position:relative;min-height:28px;padding:4px 10px;display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:9px;cursor:pointer;list-style:none}
.requirement::-webkit-details-marker{display:none}
.requirement-name{color:inherit;text-decoration:none}
.requirement:has(.requirement-name[aria-current=true]){border-radius:5px;background:light-dark(#e8f4ed,#254838)}
.requirement::before{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(-45deg)}
.requirement-group[open]>.requirement::before{transform:rotate(45deg)}
.requirement-group[open]>.requirement::after,.point-row:has(.point-toggle[aria-expanded=true])::after{content:"";position:absolute;left:13px;top:calc(50% + 6px);bottom:0;border-left:1px solid var(--directory-line);pointer-events:none}
.point-row:has(.point-toggle[aria-expanded=true])::after{left:var(--point-toggle-center)}
.point-count{color:light-dark(#60736b,#a6bfb4);font-size:12px;font-weight:400;white-space:nowrap}
.requirement-meta{display:flex;align-items:center;gap:7px}
.nav .directory-status{display:block;width:8px;height:8px;border-radius:50%;background:currentColor}
.points,.flow-links{margin:0 0 0 13px;padding:0 0 0 var(--branch-indent)}
.points{--branch-indent:10px}
.flow-links{--branch-indent:23px;margin-left:var(--point-toggle-center)}
.point-group,.flow-links>li{position:relative;min-width:0}
:is(.point-group,.flow-links>li)::before,:is(.point-group,.flow-links>li)::after{content:"";position:absolute;left:calc(-1 * var(--branch-indent));pointer-events:none}
:is(.point-group,.flow-links>li)::before{top:0;bottom:0;border-left:1px solid var(--directory-line)}
:is(.point-group,.flow-links>li):last-child::before{bottom:auto;height:var(--directory-row-mid)}
:is(.point-group,.flow-links>li)::after{top:var(--directory-row-mid);width:var(--branch-indent);border-top:1px solid var(--directory-line)}
.point-row{position:relative;display:grid;grid-template-columns:var(--point-toggle-width) minmax(0,1fr);align-items:center;min-height:28px}
.point-toggle{display:grid;place-items:center;width:var(--point-toggle-width);height:28px;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer}
.point-toggle::before{content:"";width:5px;height:5px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(-45deg)}
.point-toggle[aria-expanded=true]::before{transform:rotate(45deg)}
.point{grid-column:2;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;text-align:left;border:1px solid transparent;border-radius:5px;background:light-dark(#fff,#1a2621);padding:3px 7px 3px 1px;color:light-dark(#263c33,#daece2);text-decoration:none}
.point:hover{background:light-dark(#f4f8f5,#293b32)}
.point[aria-current=true]{background:light-dark(#e8f4ed,#254838);border-color:light-dark(#a4c9b6,#527e69)}
.flow-links{list-style:none}
.flow-link{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border-radius:5px;color:inherit;text-decoration:none}
.requirement-name,.point-name,.flow-link .flow-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flow-link:hover,.flow-link[aria-current=true]{background:light-dark(#e8f4ed,#254838)}
.muted{color:light-dark(#52665e,#b5c9bf)}
.navfoot{border-top:1px solid light-dark(#e2e9e5,#35483f);padding:15px 18px;font-size:12px;color:light-dark(#52665e,#b5c9bf)}
.layout main{min-width:0}
.hero{padding:20px 25px 22px;margin-bottom:16px}
h1{margin:4px 0 6px;font-size:29px;line-height:1.27;letter-spacing:-.015em}
p{margin:0}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.report-description{color:light-dark(#52665e,#b5c9bf)}
.report-related{margin-top:16px;padding-top:12px;border-top:1px solid light-dark(#dbe4df,#35483f)}
.report-related h2,.report-related h3{margin:0 0 6px;font-size:15px}
.report-related ul{list-style:none;margin:0;padding:0}
.report-related li{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:5px 0}
.report-link{color:light-dark(#17664a,#a9e7c9);text-underline-offset:3px;overflow-wrap:anywhere}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:6px;padding:3px 8px;font-size:12px;line-height:1.35;font-weight:650;white-space:nowrap}
.ok{color:light-dark(#155e43,#a9e7c9);background:light-dark(#e1f2e8,#234837)}
.interrupted{color:light-dark(#765118,#f3d094);background:light-dark(#fff2d8,#463720)}
.unimplemented{color:light-dark(#68429b,#d9baf7);background:light-dark(#f1e8fa,#3e2b52)}
.neutral{color:light-dark(#475f55,#c2d6ca);background:light-dark(#edf2ef,#32443b)}
.pointcard{padding:19px 25px;margin-bottom:16px;border-left:4px solid light-dark(#43886c,#6bba98)}
.pointcard.pendingbar{border-left-color:light-dark(#be8a3d,#d0a65e)}
.headline{display:flex;justify-content:space-between;align-items:start;gap:10px}
.pointcard h2{font-size:21px;margin:4px 0 5px;line-height:1.4}
.flow{overflow:hidden}
.flowhead{padding:20px 25px 17px;border-bottom:1px solid light-dark(#e3ebe6,#35483f)}
.flowhead h3{font-size:19px;margin:5px 0 6px;line-height:1.4}
.flowhead h3 .badge{margin-inline-start:6px;vertical-align:middle}
.flowhead p+p,.pointcard p+p{margin-top:4px}
.flowhead code{overflow-wrap:anywhere}
.flowhead .flow-approach{margin-top:14px}
.flow-conclusion h4{margin:0 0 4px;font-size:14px}
.flow-text{white-space:pre-wrap;overflow-wrap:anywhere}
.flow-conclusion{border-top:1px solid light-dark(#e3ebe6,#35483f);padding:14px 25px 18px}
.flow-conclusion ul{margin:4px 0 0;padding-left:20px}
.flow-conclusion h5{margin:10px 0 3px;font-size:13px}
.step-workspace{display:grid;grid-template-columns:minmax(145px,1fr) minmax(0,2fr);height:clamp(18rem,55dvh,36rem);gap:12px;padding:10px 14px 14px}
.timeline{list-style:none;margin:0;padding:4px;min-height:0;overflow:auto}
.step button{display:grid;width:100%;grid-template-columns:28px minmax(0,1fr);align-items:start;gap:8px;padding:7px 5px;text-align:left;color:inherit;background:transparent;border:1px solid transparent;border-radius:6px;cursor:pointer;overflow-wrap:anywhere}
.step button:hover,.step button[aria-current=step]{background:light-dark(#e8f4ed,#254838)}
.step .type{display:block;font-size:12px;color:light-dark(#516d61,#a9c6b8)}
.num{display:grid;place-items:center;width:28px;height:28px;background:light-dark(#eff3f1,#25372e);border:1px solid light-dark(#dbe4df,#35483f);border-radius:50%;font-size:12px;color:light-dark(#4a675a,#b4cebf);font-variant-numeric:tabular-nums}
.step-evidence{display:grid;grid-template-rows:minmax(0,1fr) auto;min-width:0;min-height:0;border:1px solid light-dark(#dbe4df,#35483f);border-radius:8px}
.step-panels{overflow:auto;padding:12px;min-width:0}
.stepmeta{display:flex;gap:8px;align-items:start;justify-content:space-between;margin-bottom:4px}
.timing{font-size:12px;color:light-dark(#576d62,#a8beb3);white-space:nowrap}
.stepmeta h4{font-size:15px;margin:0;font-weight:670;overflow-wrap:anywhere}
.step-pagination{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid light-dark(#dbe4df,#35483f)}
.step-pagination button{padding:3px 8px;border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:5px;background:transparent;color:inherit;cursor:pointer}
.step-pagination button[aria-disabled=true]{opacity:.45;cursor:default}
.step-attachments{display:grid;gap:8px;margin-top:9px;background:light-dark(#f4faf6,#1d3228);border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:8px;padding:10px 12px}
.step-attachments p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.gallery-page:not([hidden]){display:grid;gap:8px}
.step-log summary{cursor:pointer;font-weight:600}
.step-log p{margin-top:6px;max-height:16rem;overflow:auto}
.step-image{display:block;width:min(65%,420px);padding:0;border:0;background:none;border-radius:6px;cursor:zoom-in}
.step-image img{display:block;width:100%;height:auto;border-radius:6px}
.gallery-frame{margin:0}
.gallery-frame figcaption{margin-top:4px;color:light-dark(#52665e,#b5c9bf);font-size:12px}
.gallery-controls{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.gallery-controls button,.image-dialog button{cursor:pointer;border:1px solid light-dark(#d4e7dc,#395e4d);border-radius:5px;background:transparent;color:inherit;min-width:30px}
.gallery-controls button[aria-disabled=true]{opacity:.45;cursor:default}
.image-dialog{width:min(1100px,calc(100% - 24px));max-height:calc(100% - 24px);padding:14px;border:1px solid light-dark(#dbe4df,#35483f);border-radius:12px;background:light-dark(#fff,#1a2621);color:inherit}
.image-dialog::backdrop{background:#14251ec2}
.image-dialog-head,.image-dialog-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.image-dialog-head{justify-content:space-between;margin-bottom:10px}
.image-dialog-head h2{font-size:16px;margin:0;overflow-wrap:anywhere}
.image-dialog-actions .gallery-controls{margin:0}
.image-dialog img{display:block;max-width:100%;max-height:calc(100dvh - 100px);height:auto;margin:auto;border-radius:6px}
.attachment-preview{display:block;width:min(100%,420px);height:auto;margin-top:4px;border-radius:6px}
.attachments summary{font-size:12px;color:light-dark(#2f6752,#a2dfc3);cursor:pointer}
.plan-steps{margin:14px 25px 0;font-size:14px}
.attachments{border-top:1px solid light-dark(#e3ebe6,#35483f);padding:14px 25px;color:light-dark(#597165,#a8beb3);font-size:12px}
.attachments p{margin-top:7px}
@media(max-width:850px){.layout{--directory-width:220px;padding:16px}
.bar{padding:0 16px}
.flowhead,.hero,.pointcard,.flow-conclusion{padding-left:16px;padding-right:16px}
.plan-steps{margin-left:16px;margin-right:16px}}
@media(max-width:620px){.layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,34%) minmax(0,1fr);gap:12px}
.directory-resizer{display:none}
.step-workspace{height:auto;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,10rem) minmax(0,22rem)}
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
.runhead{margin:0;padding:12px 25px;font-size:13px;cursor:pointer}
.run-problems{padding:0 25px 6px}
.run+.run{border-top:1px solid light-dark(#e3ebe6,#35483f)}
.attachments ul{margin:8px 0 0;padding-left:20px}
.attachments a{color:light-dark(#2f6752,#a2dfc3)}
@media(max-width:620px){.bar{padding-top:10px;padding-bottom:10px}.bar-meta{gap:5px}.runhead,.run-problems{padding-left:16px;padding-right:16px}}
`
