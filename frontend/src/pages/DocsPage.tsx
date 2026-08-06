import './DocsPage.css'

const DOCS_URL = 'https://doc.zhangpan.online/'

function DocsPage() {
  return (
    <div className="docs-page">
      <iframe
        className="docs-iframe"
        src={DOCS_URL}
        title="文档"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  )
}

export default DocsPage
