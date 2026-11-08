export let 样式 = `
*{box-sizing:border-box}
html{
  color-scheme:light dark;
  --ink:light-dark(#182e27,#e4f0e9);--muted:light-dark(#576e64,#afc6bb);
  --line:light-dark(#dbe5df,#374c42);--paper:light-dark(#fff,#1a2822);
  --ground:light-dark(#eff4f1,#111c17);--wash:light-dark(#e9f4ed,#263d31);
  --selected:light-dark(#aacbbb,#507761);--green:light-dark(#226148,#a6dfbf);
  --red:light-dark(#97352e,#ffc0ba);--red-bg:light-dark(#fff0ee,#402824);
  --amber:light-dark(#765018,#f1ce88);--amber-bg:light-dark(#fff3da,#3c3220);
}
html[data-theme=light]{color-scheme:light}
html[data-theme=dark]{color-scheme:dark}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;overflow-wrap:anywhere}
h1,h2,h3,p{margin:0}
h2{font-size:20px;line-height:1.3}
h3{font-size:14px;margin-bottom:10px}
a{color:var(--green)}
button,select{font:inherit;color:inherit}
button,summary,select{cursor:pointer}
:focus-visible{outline:2px solid light-dark(#367b68,#7bc7a8);outline-offset:2px}
[hidden],.details-grid:empty{display:none!important}
.top{background:light-dark(#183d34,#142e25);color:#ecf8f1}
.bar{max-width:1440px;margin:auto;padding:15px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.top h1{display:flex;align-items:center;gap:11px;font-size:17px}
.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:#d2efdd;color:#1d5743;font-size:19px}
.top-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}
.top-meta a{color:inherit;text-underline-offset:3px}
.top-meta select{background:#234e42;border:1px solid #74978a;border-radius:6px;padding:4px 6px}
.run{background:var(--paper);border-bottom:1px solid var(--line)}
.run .bar{padding-block:17px}
.muted{margin-top:4px;color:var(--muted);font-size:12px}
.counts,.attempts,.actions{display:flex;gap:6px;flex-wrap:wrap}
.badge{display:inline-flex;width:max-content;max-width:100%;border-radius:100px;padding:3px 9px;font-size:11px;font-weight:650;white-space:nowrap}
.badge.ok,.ok .dot{background:var(--wash);color:var(--green)}
.badge.fail,.fail .dot{background:var(--red-bg);color:var(--red)}
.badge.warning,.warning .dot{background:var(--amber-bg);color:var(--amber)}
.badge.pending,.pending .dot{background:var(--ground);color:var(--muted)}
.layout{max-width:1440px;margin:auto;padding:18px 24px 32px;display:grid;grid-template-columns:minmax(172px,24%) minmax(0,1fr);gap:16px;align-items:start}
.surface{background:var(--paper);border:1px solid var(--line);border-radius:12px}
.directory{padding:12px}
.label{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--muted)}
.directory .label{padding:3px 7px 8px}
.case{display:block;width:100%;padding:10px 8px;text-align:left;background:none;border:1px solid transparent;border-radius:8px}
.case:hover{background:var(--ground)}
.case[aria-pressed=true]{background:var(--wash);border-color:var(--selected)}
.case strong{display:block;margin-bottom:5px}
.case-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
main{min-width:0}
.intro,.run-errors{padding:16px 19px}
.run-errors{margin-bottom:14px}
.run-errors h2{margin-bottom:10px}
.case-title{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:4px 0}
.case-title h2{font-size:23px}
.file{font:12px/1.5 ui-monospace,Consolas,monospace;color:var(--muted)}
.attempts{margin-top:12px}
.attempt-label{align-self:center;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.tool{display:inline-block;padding:5px 9px;border:1px solid var(--line);border-radius:7px;background:var(--paper);text-decoration:none;font-size:12px}
.tool:hover,.tool[aria-pressed=true]{background:var(--wash);color:var(--green);border-color:var(--selected)}
.details-grid{display:grid;gap:17px;padding:15px 19px 19px;border-top:1px solid var(--line)}
.details-grid.split{grid-template-columns:minmax(0,1.12fr) minmax(0,1fr)}
.steps{list-style:none;margin:0;padding:0}
.step{display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:8px;position:relative;align-items:start;padding-bottom:13px}
.step:last-child{padding-bottom:0}
.step:not(:last-child)::before{content:"";position:absolute;left:11px;top:21px;bottom:0;width:1px;background:var(--line)}
.dot{z-index:1;display:grid;place-items:center;width:23px;height:23px;border-radius:50%;font-size:12px;font-weight:700}
.step.fail strong{color:var(--red)}
.step.pending strong{color:var(--muted)}
.step small,.duration{display:block;color:var(--muted);font-size:12px}
.duration{padding-top:2px;white-space:nowrap;font-variant-numeric:tabular-nums}
.problem{background:var(--red-bg);color:var(--red);padding:10px 11px;border-radius:8px;margin-bottom:9px}
.problem:last-child{margin-bottom:0}
.problem pre,.problem dd{font:12px/1.55 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.problem pre{margin:0}
.problem strong+pre,.problem details{margin-top:6px}
.problem summary{font-size:12px}
.problem dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;margin:5px 0;font-size:12px}
.problem dd{margin:0}
.shot{display:block;overflow:hidden;border:1px solid var(--line);border-radius:8px;color:var(--muted);text-decoration:none;cursor:zoom-in}
.shot+.shot{margin-top:8px}
.shot:hover{border-color:var(--selected)}
.shot img{display:block;width:100%;max-height:230px;object-fit:cover;object-position:top}
.shot span{display:block;padding:6px 8px;border-top:1px solid var(--line);font-size:12px}
.step-evidence{grid-column:2/-1;min-width:0}
.evidence-gallery{width:min(100%,300px)}
.evidence-gallery .shot{margin-top:0;background:var(--ground)}
.evidence-gallery .shot img{width:100%;aspect-ratio:16/9;max-height:none;object-fit:contain}
.evidence-gallery .shot span{background:var(--paper)}
.evidence-controls{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.evidence-gallery .evidence-controls{margin-bottom:6px}
.evidence-controls span{text-align:center;min-width:48px}
.evidence-arrow{font-size:19px;line-height:1;min-width:30px}
.evidence-arrow[aria-disabled=true]{opacity:.45;cursor:default;background:var(--paper);color:var(--muted);border-color:var(--line)}
.evidence-errors{margin-top:6px;color:var(--muted);font-size:12px}
.evidence-errors pre{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.actions{margin-top:8px}
dialog{width:min(1100px,calc(100% - 24px));max-height:calc(100% - 24px);padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink)}
dialog::backdrop{background:#14251ec2}
.dialog-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px}
.dialog-head h2{font-size:16px}
.dialog-head h2:focus{outline:none}
.dialog-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
dialog img{display:block;max-width:100%;height:auto;margin:auto}
@media(max-width:850px){
  .layout{grid-template-columns:190px minmax(0,1fr);padding:14px;gap:12px}
  .bar{padding-inline:14px}
  .details-grid.split{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:520px){
  .layout{grid-template-columns:minmax(0,1fr)}
  .intro,.details-grid,.run-errors{padding-inline:13px}
  .case-title h2{font-size:20px}
}
`

export let 交互脚本 = `
let theme = document.querySelector('[data-theme-picker]')
theme.onchange = () => {
  document.documentElement.dataset.theme = theme.value
}

function connectSelection(kind) {
  let buttons = [...document.querySelectorAll('[data-' + kind + '-select]')]
  for (let button of buttons) {
    button.onclick = () => {
      let group = kind === 'case' ? buttons : [...button.parentElement.querySelectorAll('button')]
      for (let item of group) {
        let selected = item === button
        item.setAttribute('aria-pressed', String(selected))
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected
      }
      if (kind === 'case' && matchMedia('(max-width:520px)').matches) {
        document.getElementById(button.getAttribute('aria-controls')).scrollIntoView({ block: 'start' })
      }
    }
  }
}
connectSelection('case')
connectSelection('attempt')

let dialog = document.querySelector('[data-screenshot-dialog]')
let fullImage = dialog.querySelector('[data-full-image]')
let screenshotTitle = dialog.querySelector('[data-screenshot-title]')
let dialogControls = dialog.querySelector('[data-evidence-controls]')
let dialogGallery = null

function showFullImage(link) {
  let thumbnail = link.querySelector('img')
  screenshotTitle.textContent = thumbnail.alt
  fullImage.alt = thumbnail.alt
  fullImage.src = link.href
}

function updateEvidenceControls(controls, index, count) {
  controls.querySelector('[data-evidence-position]').textContent = String(index + 1) + ' / ' + String(count)
  controls.querySelector('[data-evidence-prev]').setAttribute('aria-disabled', String(index === 0))
  controls.querySelector('[data-evidence-next]').setAttribute('aria-disabled', String(index === count - 1))
}

function moveEvidence(gallery, direction) {
  let slides = [...gallery.querySelectorAll('[data-screenshot]')]
  let index = slides.findIndex(link => !link.hidden)
  let nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= slides.length) return
  let current = slides[index]
  let next = slides[nextIndex]
  let focusOnImage = document.activeElement === current
  current.hidden = true
  next.hidden = false
  updateEvidenceControls(gallery.querySelector('[data-evidence-controls]'), nextIndex, slides.length)
  if (focusOnImage) next.focus({ preventScroll: true })
  if (dialogGallery === gallery) {
    showFullImage(next)
    updateEvidenceControls(dialogControls, nextIndex, slides.length)
  }
}

function connectEvidenceControls(element, getGallery) {
  let previous = element.querySelector('[data-evidence-prev]')
  let next = element.querySelector('[data-evidence-next]')
  previous.onclick = () => moveEvidence(getGallery(), -1)
  next.onclick = () => moveEvidence(getGallery(), 1)
  element.onkeydown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    let gallery = getGallery()
    if (gallery === null) return
    event.preventDefault()
    moveEvidence(gallery, event.key === 'ArrowLeft' ? -1 : 1)
  }
}
for (let gallery of document.querySelectorAll('[data-evidence-gallery]')) {
  connectEvidenceControls(gallery, () => gallery)
}
connectEvidenceControls(dialog, () => dialogGallery)

for (let link of document.querySelectorAll('[data-screenshot]')) {
  link.onclick = (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    dialogGallery = link.closest('[data-evidence-gallery]')
    dialogControls.hidden = dialogGallery === null
    if (dialogGallery !== null) {
      let slides = [...dialogGallery.querySelectorAll('[data-screenshot]')]
      updateEvidenceControls(dialogControls, slides.indexOf(link), slides.length)
    }
    showFullImage(link)
    dialog.showModal()
  }
}
dialog.onclose = () => {
  fullImage.removeAttribute('src')
  dialogGallery?.querySelector('[data-screenshot]:not([hidden])').focus({ preventScroll: true })
  dialogGallery = null
}
`
