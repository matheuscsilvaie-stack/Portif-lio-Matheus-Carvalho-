(() => {
  'use strict';

  // Persistência local temporária. No futuro, substitua por chamadas à API Node.js/SQL.
  const STORAGE_KEY = 'matheusflow.chamados.v1';
  const STATUSES = ['Pendente', 'Em andamento', 'Concluído'];
  const form = document.querySelector('#serviceForm');
  const list = document.querySelector('#serviceList');
  const emptyMessage = document.querySelector('#emptyMessage');
  const searchInput = document.querySelector('#searchInput');
  const statusFilter = document.querySelector('#statusFilter');
  const feedback = document.querySelector('#formFeedback');
  let services = loadServices();

  function loadServices() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === 'string') : [];
    } catch (error) {
      return [];
    }
  }

  function saveServices() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(services));
      return true;
    } catch (error) {
      showFeedback('Não foi possível salvar neste navegador.', true);
      return false;
    }
  }

  function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    if (message && !isError) window.setTimeout(() => { feedback.textContent = ''; }, 3500);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function render() {
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const selectedStatus = statusFilter.value;
    const visible = services.filter(service => {
      const searchable = `${service.client} ${service.name} ${service.description}`.toLocaleLowerCase('pt-BR');
      return searchable.includes(query) && (selectedStatus === 'todos' || service.status === selectedStatus);
    });

    document.querySelector('#totalServices').textContent = services.length;
    document.querySelector('#pendingServices').textContent = services.filter(item => item.status === 'Pendente').length;
    document.querySelector('#progressServices').textContent = services.filter(item => item.status === 'Em andamento').length;
    document.querySelector('#completedServices').textContent = services.filter(item => item.status === 'Concluído').length;
    list.replaceChildren();
    emptyMessage.hidden = visible.length > 0;
    emptyMessage.textContent = services.length === 0 ? 'Nenhum chamado cadastrado ainda. Use o formulário para começar.' : 'Nenhum chamado encontrado com esses filtros.';

    visible.forEach(service => {
      const article = makeElement('article', 'service-item');
      const main = makeElement('div', 'service-main');
      const titleLine = makeElement('div', 'service-title-line');
      titleLine.append(makeElement('h3', '', service.name));
      const badgeClass = service.status === 'Concluído' ? 'badge completed' : service.status === 'Em andamento' ? 'badge progress' : 'badge';
      titleLine.append(makeElement('span', badgeClass, service.status));
      const date = new Date(service.createdAt);
      const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
      main.append(titleLine, makeElement('p', 'service-meta', `Cliente: ${service.client} · ${dateLabel} · Chamado ${service.id.slice(-6)}`));
      if (service.description) main.append(makeElement('p', 'service-description', service.description));
      const priorityLabel = service.priority === 'urgente' ? 'Urgente' : service.priority === 'alta' ? 'Alta' : 'Normal';
      const priority = makeElement('span', `priority ${service.priority === 'normal' ? '' : service.priority}`, `Prioridade ${priorityLabel}`);
      main.append(priority);

      const actions = makeElement('div', 'service-actions');
      const select = document.createElement('select');
      select.className = 'status-select';
      select.setAttribute('aria-label', `Status do chamado ${service.name}`);
      STATUSES.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = service.status === status;
        select.append(option);
      });
      select.addEventListener('change', () => updateStatus(service.id, select.value));
      const remove = makeElement('button', 'delete-button', 'Excluir');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Excluir chamado ${service.name}`);
      remove.addEventListener('click', () => deleteService(service.id));
      actions.append(select, remove);
      article.append(main, actions);
      list.append(article);
    });
  }

  function updateStatus(id, status) {
    if (!STATUSES.includes(status)) return;
    const service = services.find(item => item.id === id);
    if (!service) return;
    service.status = status;
    saveServices();
    render();
  }

  function deleteService(id) {
    services = services.filter(item => item.id !== id);
    saveServices();
    render();
    showFeedback('Chamado excluído.');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const client = String(data.get('clientName') || '').trim();
    const name = String(data.get('serviceName') || '').trim();
    if (!client || !name) {
      showFeedback('Informe o cliente e o serviço solicitado.', true);
      return;
    }
    services.unshift({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      client,
      name,
      description: String(data.get('description') || '').trim(),
      priority: String(data.get('priority') || 'normal'),
      status: 'Pendente',
      createdAt: new Date().toISOString()
    });
    if (!saveServices()) return;
    form.reset();
    render();
    showFeedback('Chamado cadastrado com sucesso.');
  });

  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  render();
})();
