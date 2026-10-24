(() => {
  'use strict';

  const STATUSES = ['Pendente', 'Em andamento', 'Concluído'];
  const form = document.querySelector('#serviceForm');
  const list = document.querySelector('#serviceList');
  const emptyMessage = document.querySelector('#emptyMessage');
  const searchInput = document.querySelector('#searchInput');
  const statusFilter = document.querySelector('#statusFilter');
  const feedback = document.querySelector('#formFeedback');
  const logoutButton = document.querySelector('#logoutButton');
  let services = [];

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.replace('/login.html');
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (!response.ok) throw new Error(payload.error || 'Não foi possível comunicar com o servidor.');
    return payload;
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
      main.append(titleLine, makeElement('p', 'service-meta', `Cliente: ${service.client} · ${dateLabel} · Chamado ${String(service.id).slice(-6)}`));
      if (service.phone) main.append(makeElement('p', 'service-meta', `Telefone: ${service.phone}`));
      if (service.description) main.append(makeElement('p', 'service-description', service.description));
      const priorityLabel = service.priority === 'urgente' ? 'Urgente' : service.priority === 'alta' ? 'Alta' : 'Normal';
      const priorityClass = service.priority === 'alta' ? 'high' : service.priority === 'urgente' ? 'urgent' : '';
      main.append(makeElement('span', `priority ${priorityClass}`, `Prioridade ${priorityLabel}`));

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
      select.addEventListener('change', () => updateStatus(service.id, select));
      const remove = makeElement('button', 'delete-button', 'Excluir');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Excluir chamado ${service.name}`);
      remove.addEventListener('click', () => deleteService(service.id, remove));
      actions.append(select, remove);
      article.append(main, actions);
      list.append(article);
    });
  }

  async function loadServices() {
    try {
      services = await api('/tickets');
      render();
    } catch (error) {
      showFeedback(`${error.message} Verifique se o servidor e o banco estão ativos.`, true);
      emptyMessage.hidden = false;
      emptyMessage.textContent = 'Não foi possível carregar os chamados.';
    }
  }

  async function updateStatus(id, select) {
    const service = services.find(item => String(item.id) === String(id));
    if (!service || !STATUSES.includes(select.value)) return;
    const previousStatus = service.status;
    select.disabled = true;
    try {
      const updated = await api(`/tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: select.value })
      });
      Object.assign(service, updated);
      showFeedback('Status atualizado.');
    } catch (error) {
      service.status = previousStatus;
      showFeedback(error.message, true);
    }
    render();
  }

  async function deleteService(id, button) {
    if (!window.confirm('Excluir este chamado permanentemente?')) return;
    button.disabled = true;
    try {
      await api(`/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      services = services.filter(item => String(item.id) !== String(id));
      render();
      showFeedback('Chamado excluído.');
    } catch (error) {
      button.disabled = false;
      showFeedback(error.message, true);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const client = String(data.get('clientName') || '').trim();
    const name = String(data.get('serviceName') || '').trim();
    if (!client || !name) {
      showFeedback('Informe o cliente e o serviço solicitado.', true);
      return;
    }
    submitButton.disabled = true;
    try {
      const created = await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          client,
          name,
          description: String(data.get('description') || '').trim(),
          priority: String(data.get('priority') || 'normal')
        })
      });
      services.unshift(created);
      form.reset();
      render();
      showFeedback('Chamado cadastrado no banco de dados.');
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  api('/session').then(session => {
    logoutButton.hidden = !session.loginRequired;
  }).catch(() => { logoutButton.hidden = true; });
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await api('/logout', { method: 'POST', body: '{}' });
    } finally {
      window.location.replace('/login.html');
    }
  });
  render();
  loadServices();
})();
