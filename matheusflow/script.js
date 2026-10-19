Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
(() => {
  'use strict';

  const STORAGE_KEY = 'matheusflow.chamados.v1';
  const FORM_ENDPOINT = 'https://formsubmit.co/ajax/matheusc.silvaie@gmail.com';
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

  function ticketNumber(service) {
    return `MF-${service.id.slice(-6).toUpperCase()}`;
  }

  function render() {
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const selectedStatus = statusFilter.value;
    const visible = services.filter(service => {
      const searchable = `${service.client} ${service.name} ${service.phone || ''} ${service.description}`.toLocaleLowerCase('pt-BR');
      return searchable.includes(query) && (selectedStatus === 'todos' || service.status === selectedStatus);
    });

    list.replaceChildren();
    emptyMessage.hidden = visible.length > 0;
    emptyMessage.textContent = services.length === 0 ? 'Nenhum chamado enviado por este navegador ainda.' : 'Nenhum chamado encontrado com esses filtros.';

    visible.forEach(service => {
      const article = makeElement('article', 'service-item');
      const main = makeElement('div', 'service-main');
      const titleLine = makeElement('div', 'service-title-line');
      titleLine.append(makeElement('h3', '', service.name));
      const badgeClass = service.status === 'Concluído' ? 'badge completed' : service.status === 'Em andamento' ? 'badge progress' : 'badge';
      titleLine.append(makeElement('span', badgeClass, service.status));
      const date = new Date(service.createdAt);
      const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
      main.append(titleLine, makeElement('p', 'service-meta', `Cliente: ${service.client} · ${dateLabel} · Chamado ${ticketNumber(service)}`));
      if (service.phone) main.append(makeElement('p', 'service-meta', `Telefone: ${service.phone}`));
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

  function randomCount(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function renderDemoStats() {
    const open = randomCount(1, 3);
    const inProgress = randomCount(0, 2);
    const resolved = randomCount(2, 4);
    document.querySelector('#totalServices').textContent = open + inProgress + resolved;
    document.querySelector('#pendingServices').textContent = open;
    document.querySelector('#progressServices').textContent = inProgress;
    document.querySelector('#completedServices').textContent = resolved;
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const client = String(data.get('clientName') || '').trim();
    const name = String(data.get('serviceName') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    if (!client || !name) {
      showFeedback('Informe o cliente e o serviço solicitado.', true);
      return;
    }
    const description = String(data.get('description') || '').trim();
    const priority = String(data.get('priority') || 'normal');
    const service = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      client,
      name,
      phone,
      description,
      priority,
      status: 'Pendente',
      createdAt: new Date().toISOString()
    };

    submitButton.disabled = true;
    services.unshift(service);
    const savedLocally = saveServices();
    if (!savedLocally) {
      services = services.filter(item => item.id !== service.id);
      submitButton.disabled = false;
      return;
    }
    form.reset();
    render();
    showFeedback('Chamado cadastrado neste navegador. Enviando por e-mail...');
    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({
          _subject: `Novo chamado MatheusFlow ${ticketNumber(service)}`,
          _template: 'table',
          numero_do_chamado: ticketNumber(service),
          nome_da_pessoa: client,
          o_que_esta_solicitando: name,
          telefone: phone || 'Não informado',
          prioridade: priority,
          descricao: description || 'Não informada'
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || (result?.success !== true && result?.success !== 'true')) {
        throw new Error(result?.message || 'O serviço de e-mail não confirmou o envio.');
      }

      showFeedback('Chamado cadastrado e enviado por e-mail. Se for o primeiro envio, confirme a ativação recebida por e-mail.');
    } catch (error) {
      showFeedback(`Chamado cadastrado neste navegador, mas o envio por e-mail falhou: ${error.message}`, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  renderDemoStats();
  render();
})();
