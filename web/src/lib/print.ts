// Print only the `.print-area` element with an explicit paper size. Chrome's header/footer (date, URL) live in the page
// margin, so `margin: 0` removes them. The @page rule is injected just for this print so receipt and report can differ.
const PAPER = {
  receipt: '@page { size: 80mm auto; margin: 0 }', // thermal roll
  report: '@page { size: A4; margin: 12mm }',
}

export function printArea(kind: keyof typeof PAPER) {
  const style = document.createElement('style')
  style.textContent = PAPER[kind]
  document.head.appendChild(style)
  document.body.dataset.print = kind
  const done = () => {
    style.remove()
    delete document.body.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}
