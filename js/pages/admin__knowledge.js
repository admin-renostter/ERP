/* Extraido de admin/knowledge.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('confirmDeleteArticle', function () { return typeof confirmDeleteArticle !== 'undefined' ? confirmDeleteArticle : undefined; }, function (v) { confirmDeleteArticle = v; });
  def('editArticle', function () { return typeof editArticle !== 'undefined' ? editArticle : undefined; }, function (v) { editArticle = v; });
  def('openCreateArticle', function () { return typeof openCreateArticle !== 'undefined' ? openCreateArticle : undefined; }, function (v) { openCreateArticle = v; });
  def('renderKB', function () { return typeof renderKB !== 'undefined' ? renderKB : undefined; }, function (v) { renderKB = v; });
  def('saveArticle', function () { return typeof saveArticle !== 'undefined' ? saveArticle : undefined; }, function (v) { saveArticle = v; });
  def('setCategory', function () { return typeof setCategory !== 'undefined' ? setCategory : undefined; }, function (v) { setCategory = v; });
  def('triggerQuillImage', function () { return typeof triggerQuillImage !== 'undefined' ? triggerQuillImage : undefined; }, function (v) { triggerQuillImage = v; });
  def('viewArticle', function () { return typeof viewArticle !== 'undefined' ? viewArticle : undefined; }, function (v) { viewArticle = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin', 'tecnico']);
        if (!session) throw new Error('Access denied');

        let currentCategory = null;
        let selectedArticleId = null;

        function setCategory(cat) {
            currentCategory = cat;
            renderKB();
        }

        function renderKB() {
            const articles = db.get('knowledge_base');
            const query = document.getElementById('kbSearch').value.toLowerCase();
            const container = document.getElementById('articleList');
            const catList = document.getElementById('categoryList');

            // Categorias
            const cats = [...new Set(articles.map(a => a.category))];
            catList.innerHTML = `<li class="category-item ${!currentCategory ? 'active' : ''}" data-on-click="setCategory(null)">Tudo</li>` +
                cats.map(c => `<li class="category-item ${currentCategory === c ? 'active' : ''}" data-on-click="setCategory('${c}')">${esc(c)}</li>`).join('');

            const filtered = articles.filter(a => {
                if (a.deletedAt) return false;
                if (a.status === 'rascunho' && !['admin', 'superadmin'].includes(session.role)) return false;

                const matchesSearch = a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query) || (a.tags || []).some(t => t.toLowerCase().includes(query));
                const matchesCat = !currentCategory || a.category === currentCategory;
                return matchesSearch && matchesCat;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="empty-state"><h4>Nenhum artigo encontrado.</h4></div>';
                return;
            }

            container.innerHTML = filtered.map(a => `
                <div class="article-card" data-on-click="viewArticle('${a.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                        <div class="article-title" style="margin-bottom:0;display:flex;align-items:center;gap:8px">
                            ${esc(a.title)}
                            ${a.status === 'rascunho' ? '<span class="tag" style="background:var(--warning-dim);color:var(--warning);padding:3px 6px;line-height:1">Rascunho</span>' : ''}
                        </div>
                        ${['admin', 'superadmin'].includes(session.role) ? `
                            <button class="btn btn-ghost btn-sm btn-icon" title="Excluir artigo" data-on-click="event.stopPropagation(); confirmDeleteArticle('${a.id}')" style="color:var(--danger);padding:4px;height:auto;min-height:0">
                                <span style="font-size:.9rem">🗑️</span>
                            </button>
                        ` : ''}
                    </div>
                    <div class="article-meta">
                        <span>📁 ${esc(a.category)}</span>
                        <span>📅 ${new Date(a.createdAt).toLocaleDateString()}</span>
                        <span>👤 ${esc(db.find('users', a.authorId)?.name || 'Desconhecido')}</span>
                    </div>
                    <div class="article-excerpt">${esc((a.summary || a.content.replace(/<[^>]*>?/gm, '').substring(0, 150)))}...</div>
                    <div class="article-tags">
                        ${(a.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}
                    </div>
                </div>
            `).join('');
        }

        function viewArticle(id) {
            selectedArticleId = id;
            const a = db.find('knowledge_base', id);
            if (!a) return;

            document.getElementById('artHeader').textContent = a.category;
            document.getElementById('artTitle').textContent = a.title;
            document.getElementById('artMeta').innerHTML = `Publicado em ${new Date(a.createdAt).toLocaleString()} por ${esc(db.find('users', a.authorId)?.name || 'Desconhecido')}`;

            // Permite injeção de texto com parágrafo e tags oriundas do Quill Rich Text vs semente limpa antiga ('<br>')
            const richHTML = a.content.includes('<p>') ? a.content : a.content.replace(/\n/g, '<br>');
            document.getElementById('artContent').innerHTML = richHTML;

            document.getElementById('artTags').innerHTML = (a.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('');

            openModal('modalViewArticle');
        }

        let quill;
        function initQuill() {
            if (!quill) {
                quill = new Quill('#editor-container', {
                    theme: 'snow',
                    modules: {
                        toolbar: [
                            ['bold', 'italic', 'underline', 'strike'],
                            ['blockquote', 'code-block'],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                            [{ 'header': [1, 2, 3, false] }],
                            [{ 'color': [] }, { 'background': [] }],
                            ['link', 'image'],
                            ['clean']
                        ]
                    }
                });
            }
        }

        function openCreateArticle() {
            // Carrega Datalist
            const articles = db.get('knowledge_base');
            const cats = [...new Set(articles.map(a => a.category))].filter(Boolean);
            document.getElementById('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

            // Limpa form globalmente
            document.getElementById('addArtTitle').value = '';
            document.getElementById('addArtCat').value = '';
            document.getElementById('addArtSummary').value = '';
            document.getElementById('addArtTags').value = '';
            document.getElementById('addArtData').value = new Date().toISOString().split('T')[0];
            document.querySelector('input[name="artStatus"][value="publicado"]').checked = true;

            initQuill();
            quill.root.innerHTML = '';

            openModal('modalCreateArticle');
        }

        function triggerQuillImage() {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();

            input.onchange = () => {
                const file = input.files[0];
                if (/^image\//.test(file.type)) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const range = quill.getSelection(true);
                        quill.insertEmbed(range.index, 'image', e.target.result);
                        quill.setSelection(range.index + 1);
                    };
                    reader.readAsDataURL(file);
                } else {
                    toast('Erro', 'Por favor, selecione apenas arquivos de imagem.', 'error');
                }
            };
        }

        function editArticle() {
            if (!selectedArticleId) return;
            const a = db.find('knowledge_base', selectedArticleId);
            if (!a) return;

            // Fecha modal de visualização
            closeModal('modalViewArticle');

            // Carrega Datalist
            const articles = db.get('knowledge_base');
            const cats = [...new Set(articles.map(x => x.category))].filter(Boolean);
            document.getElementById('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

            // Preenche Formulário
            document.getElementById('addArtTitle').value = a.title || '';
            document.getElementById('addArtCat').value = a.category || '';
            document.getElementById('addArtSummary').value = a.summary || '';
            document.getElementById('addArtTags').value = (a.tags || []).join(', ');
            document.getElementById('addArtData').value = a.createdAt ? a.createdAt.split('T')[0] : '';

            if (a.status === 'rascunho') {
                document.querySelector('input[name="artStatus"][value="rascunho"]').checked = true;
            } else {
                document.querySelector('input[name="artStatus"][value="publicado"]').checked = true;
            }

            initQuill();
            // Permite injeção de texto com parágrafo e tags oriundas do Quill Rich Text
            const richHTML = a.content.includes('<p>') ? a.content : a.content.replace(/\n/g, '<br>');
            quill.root.innerHTML = richHTML;

            openModal('modalCreateArticle');
        }

        function saveArticle() {
            const title = document.getElementById('addArtTitle').value.trim();
            const category = document.getElementById('addArtCat').value.trim();
            const summary = document.getElementById('addArtSummary').value.trim();
            const tagsInput = document.getElementById('addArtTags').value.trim();
            const pubDate = document.getElementById('addArtData').value;
            const status = document.querySelector('input[name="artStatus"]:checked').value;

            const content = quill.root.innerHTML;
            const textContent = quill.getText().trim();

            if (!title || !category || !textContent) {
                return toast('Erro de Validação', 'Preencha Título, Categoria e redija o Conteúdo.', 'error');
            }

            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

            const payload = {
                title, category, summary, content, tags, status,
                authorId: session.userId,
                updatedAt: new Date().toISOString()
            };

            if (selectedArticleId) {
                db.update('knowledge_base', selectedArticleId, payload);
                logAudit('article_updated', `Artigo '${title}' (ID: ${selectedArticleId}) atualizado por ${session.name}.`);
                toast('Artigo Atualizado', `As evidências e dados do artigo foram salvos com sucesso.`, 'success');
            } else {
                payload.createdAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
                const a = db.insert('knowledge_base', payload);
                logAudit('article_created', `Artigo '${title}' (ID: ${a.id}) criado por ${session.name}.`);
                toast('Novo Artigo Salvo', `O arquivo "${title}" foi arquivado e indexado com sucesso.`, 'success');
            }

            // Reseta a variável let para a próxima operação
            selectedArticleId = null;

            closeModal('modalCreateArticle');
            renderKB();
        }

        function confirmDeleteArticle(id) {
            const a = db.find('knowledge_base', id);
            if (!a) return;
            if (!confirm(`Deseja realmente excluir o artigo '${a.title}'? Esta ação não pode ser desfeita.`)) return;

            db.update('knowledge_base', id, { deletedAt: new Date().toISOString() });

            logAudit('article_deleted', `Artigo '${a.title}' (ID: ${id}) excluído por ${session.name}.`);

            toast('Sucesso', 'Artigo excluído com sucesso.', 'success');
            renderKB();
        }

        document.addEventListener('DOMContentLoaded', () => {
            initSidebar();
            if (['admin', 'superadmin', 'tecnico'].includes(session.role)) {
                document.getElementById('topbarRightActions').innerHTML = `<button class="btn btn-primary" data-on-click="openCreateArticle()">+ Novo Artigo</button>`;
            }
            renderKB();
        });
    
