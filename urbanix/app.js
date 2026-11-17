/* Urbanix · Cidade Invisível
 * Com config.js preenchido, usa o Supabase (contas reais, banco compartilhado,
 * fotos e atualização em tempo real). Sem configuração, roda em modo
 * demonstração com os dados guardados apenas neste navegador.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ dados fixos
  var CATS = [
    { id: "infraestrutura", name: "Infraestrutura", color: "#ed754b", icon: "⌁" },
    { id: "acessibilidade", name: "Acessibilidade", color: "#5688bd", icon: "♿" },
    { id: "iluminacao", name: "Iluminação", color: "#d4a43b", icon: "☼" },
    { id: "residuos", name: "Resíduos", color: "#61a17a", icon: "♻" },
    { id: "outros", name: "Outros", color: "#8d76b6", icon: "＋" }
  ];
  var DISTRICTS = [
    { name: "Centro", lat: -23.9355, lng: -46.3281 }, { name: "Vila Nova", lat: -23.9364, lng: -46.3189 },
    { name: "Paquetá", lat: -23.9310, lng: -46.3215 }, { name: "Valongo", lat: -23.9312, lng: -46.3357 },
    { name: "Gonzaga", lat: -23.9672, lng: -46.3326 }, { name: "Boqueirão", lat: -23.9662, lng: -46.3225 },
    { name: "Embaré", lat: -23.9735, lng: -46.3128 }, { name: "Aparecida", lat: -23.9812, lng: -46.3039 },
    { name: "Ponta da Praia", lat: -23.9890, lng: -46.2954 }, { name: "Marapé", lat: -23.9638, lng: -46.3505 },
    { name: "Campo Grande", lat: -23.9524, lng: -46.3433 }, { name: "Macuco", lat: -23.9570, lng: -46.3178 }
  ];
  var STATUS = {
    aberto: { name: "Aberto", color: "#b7452a", bg: "#fff0e9" },
    em_andamento: { name: "Em andamento", color: "#7a5a12", bg: "#fdf3d8" },
    resolvido: { name: "Resolvido", color: "#2f6a40", bg: "#e6f2e9" }
  };
  var DEMO = [
    { id: "demo-1", title: "Calçada danificada perto da praça", cat: "acessibilidade", district: 4, lat: -23.9680, lng: -46.3341, days: 2, severity: 4, confirms: 3, description: "Trecho irregular dificulta a passagem de pedestres e cadeirantes.", demo: true },
    { id: "demo-2", title: "Bueiro obstruído na Rua Amador Bueno", cat: "infraestrutura", district: 0, lat: -23.9369, lng: -46.3291, days: 5, severity: 3, confirms: 2, description: "A grelha parece estar coberta por folhas e resíduos.", demo: true },
    { id: "demo-3", title: "Poste apagado na rua", cat: "iluminacao", district: 5, lat: -23.9654, lng: -46.3212, days: 8, severity: 3, confirms: 4, description: "Ponto de iluminação sem funcionar à noite.", demo: true },
    { id: "demo-4", title: "Descarte irregular de entulho", cat: "residuos", district: 6, lat: -23.9745, lng: -46.3150, days: 12, severity: 2, confirms: 1, description: "Material descartado na calçada próximo à esquina.", demo: true },
    { id: "demo-5", title: "Faixa de pedestres com pintura apagada", cat: "infraestrutura", district: 1, lat: -23.9370, lng: -46.3176, days: 19, severity: 2, confirms: 2, description: "A sinalização está pouco visível para quem atravessa.", demo: true }
  ];

  // ------------------------------------------------------------------ estado
  var cfg = window.URBANIX_CONFIG || {};
  var sb = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    try { sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); } catch (e) { console.error(e); }
  }
  var ONLINE = !!sb;

  var byCat = {}; CATS.forEach(function (c) { byCat[c.id] = c; });
  var DATA = [], maps = {}, selectedLocation = null, selectedPhoto = "", picking = false;
  var activeCategory = "all", toastTimer, reloadTimer, currentUser = null, authMode = "login";
  var confirmedIds = new Set();
  var googleKey = "";
  try { googleKey = localStorage.getItem("urbanix-google-maps-key") || ""; } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function districtIndex(name) { var i = DISTRICTS.findIndex(function (d) { return d.name.toLowerCase() === String(name || "").toLowerCase(); }); return i < 0 ? 0 : i; }
  function districtName(o) { return DISTRICTS[o.district] ? DISTRICTS[o.district].name : "Santos"; }
  function isAdmin() { return !!(currentUser && currentUser.papel === "admin"); }

  // Traduz as mensagens de erro mais comuns do Supabase.
  function friendlyError(err, fallback) {
    var m = String((err && (err.message || err.error_description)) || "");
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
    if (/already registered|already been registered/i.test(m)) return "Este e-mail já tem uma conta. Tente entrar.";
    if (/Password should be|weak password/i.test(m)) return "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.";
    if (/rate limit|security purposes|too many/i.test(m)) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
    if (/invalid.*email|email.*invalid/i.test(m)) return "Informe um e-mail válido.";
    if (/Limite de 10 relatos/i.test(m)) return m;
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique sua internet.";
    return fallback || "Algo deu errado. Tente novamente.";
  }

  // ------------------------------------------------------------------ carregar dados
  function fromDb(r) {
    var date = Date.parse(r.criado_em) || Date.now();
    return {
      id: "db-" + r.id, dbId: r.id, title: r.titulo, cat: byCat[r.categoria] ? r.categoria : "outros",
      district: districtIndex(r.bairro), lat: +r.latitude, lng: +r.longitude,
      days: Math.max(0, Math.floor((Date.now() - date) / 86400000)), date: date,
      severity: +r.gravidade, confirms: +r.confirmacoes || 0, description: r.descricao || "",
      photo: r.foto_path ? sb.storage.from("fotos").getPublicUrl(r.foto_path).data.publicUrl : "",
      photoPath: r.foto_path || "", status: STATUS[r.status] ? r.status : "aberto",
      author: r.profiles ? r.profiles.usuario : "", ownerId: r.usuario_id, demo: !!r.demo, remote: true
    };
  }

  function loadData() {
    if (!ONLINE) { DATA = DEMO.slice(); loadLocal(); renderRows(); return Promise.resolve(); }
    return sb.from("occurrences").select("*, profiles(usuario)").order("criado_em", { ascending: false }).limit(1000)
      .then(function (res) {
        if (res.error) throw res.error;
        DATA = res.data.map(fromDb);
        renderRows();
      })
      .catch(function (e) { console.error(e); showToast("Não foi possível carregar os relatos agora."); renderRows(); });
  }
  function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadData, 600); }

  function loadConfirmed() {
    confirmedIds = new Set();
    if (!ONLINE || !currentUser) return Promise.resolve();
    return sb.from("confirmations").select("occurrence_id").eq("user_id", currentUser.id).then(function (res) {
      if (!res.error) res.data.forEach(function (r) { confirmedIds.add(r.occurrence_id); });
    });
  }

  // Modo demonstração: relatos guardados no navegador.
  function localKey() { return "urbanix-reports-" + (currentUser ? currentUser.id : "anon"); }
  function loadLocal() {
    try {
      var a = JSON.parse(localStorage.getItem(localKey()) || "[]");
      if (Array.isArray(a)) a.forEach(function (o) { if (o && o.id && byCat[o.cat] && !DATA.some(function (x) { return x.id === o.id; })) DATA.push(o); });
    } catch (e) {}
  }
  function saveLocal() { try { localStorage.setItem(localKey(), JSON.stringify(DATA.filter(function (o) { return !o.demo && !o.remote; }))); } catch (e) {} }

  // ------------------------------------------------------------------ cálculo e listas
  function prio(o) {
    var g = Math.max(0, Math.min(100, o.severity * 20)), c = Math.min(o.confirms, 10) * 10, t = Math.round(Math.min(o.days, 60) / 60 * 100);
    return Math.round(g * .5 + c * .3 + t * .2);
  }
  function dateText(o) { var d = new Date(o.date || Date.now() - o.days * 86400000); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  function statusTag(o) {
    var s = STATUS[o.status || "aberto"];
    return '<span class="status-tag" style="color:' + s.color + ';background:' + s.bg + '">' + s.name.toUpperCase() + '</span>';
  }

  function categoryOptions() {
    $("homeCategory").innerHTML = '<option value="all">Todas</option>' + CATS.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join("");
    $("category").innerHTML = CATS.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join("");
    $("mapFilters").innerHTML = '<button class="filter-chip active" data-cat="all">Todas</button>' + CATS.map(function (c) { return '<button class="filter-chip" data-cat="' + c.id + '"><i class="dot" style="background:' + c.color + '"></i> ' + c.name + '</button>'; }).join("");
  }
  function daysLimit() { var v = $("homePeriod").value; return v === "all" ? Infinity : +v; }
  function current() {
    var limit = daysLimit(), cat = $("homeCategory").value;
    return DATA.filter(function (o) { return o.days < limit && (cat === "all" || o.cat === cat) && (activeCategory === "all" || o.cat === activeCategory); });
  }

  function rowHTML(o) {
    var c = byCat[o.cat] || byCat.outros;
    var thumb = o.photo ? '<img src="' + esc(o.photo) + '" alt="Foto do relato" loading="lazy" style="width:50px;height:48px;object-fit:cover;border-radius:9px">' : c.icon;
    var tags = (o.demo ? '<span class="tag">AMOSTRA FICTÍCIA</span>' : '') + (o.status && o.status !== "aberto" ? statusTag(o) : '');
    return '<article class="report-row" data-report="' + esc(o.id) + '" tabindex="0" role="button">' +
      '<span class="report-thumb" style="color:' + c.color + '">' + thumb + '</span>' +
      '<span class="report-info"><b>' + esc(o.title) + '</b><small>' + esc(districtName(o)) + ' · ' + esc(c.name) + ' · ' + esc(dateText(o)) + '</small>' + tags + '</span>' +
      '<span class="priority">Prioridade ' + prio(o) + '</span></article>';
  }

  function renderRows() {
    var items = current();
    var recent = items.slice().sort(function (a, b) { return (b.date || -b.days) - (a.date || -a.days) || a.days - b.days; });
    $("recentList").innerHTML = recent.length ? recent.slice(0, 6).map(rowHTML).join("") : '<div class="empty">Ainda não há relatos para estes filtros.' + (ONLINE ? ' Seja a primeira pessoa a registrar!' : '') + '</div>';
    var queue = items.filter(function (o) { return o.status !== "resolvido"; }).sort(function (a, b) { return prio(b) - prio(a); });
    $("priorityList").innerHTML = queue.length ? queue.slice(0, 12).map(rowHTML).join("") : '<div class="empty">Nenhum relato pendente encontrado.</div>';
    $("mapCount").textContent = items.length + " " + (items.length === 1 ? "relato encontrado" : "relatos encontrados");
    $("demoNote").style.display = DATA.some(function (o) { return o.demo; }) ? "block" : "none";
    renderSummary(items);
    renderMaps(items);
  }

  function renderSummary(items) {
    $("statTotal").textContent = items.length;
    $("statDistricts").textContent = new Set(items.map(function (o) { return o.district; })).size;
    $("statConfirms").textContent = items.reduce(function (n, o) { return n + o.confirms; }, 0);
    $("categorySummary").innerHTML = CATS.map(function (c) {
      var n = items.filter(function (o) { return o.cat === c.id; }).length, p = items.length ? Math.round(n / items.length * 100) : 0;
      return '<div class="category-row"><i class="dot" style="background:' + c.color + '"></i><span>' + c.name + '</span><span class="bar"><i style="width:' + p + '%;background:' + c.color + '"></i></span><span class="count">' + n + '</span></div>';
    }).join("");
    var legend = CATS.map(function (c) { return '<span class="legend-item"><i class="dot" style="background:' + c.color + '"></i>' + c.name + '</span>'; }).join("");
    $("legendHome").innerHTML = legend; $("legendMap").innerHTML = legend;
  }

  // ------------------------------------------------------------------ mapas
  function markerIcon(o) {
    var c = byCat[o.cat] || byCat.outros, done = o.status === "resolvido";
    return L.divIcon({ className: "", html: '<span style="display:grid;place-items:center;width:28px;height:28px;background:' + c.color + ';opacity:' + (done ? .45 : 1) + ';border:2px solid #fff;border-radius:50%;color:white;font-size:13px;box-shadow:0 3px 10px #17231c55">' + (done ? "✓" : c.icon) + '</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  function pickCoordinates(lat, lng) {
    if (!picking) return;
    selectedLocation = { lat: lat, lng: lng, district: nearestDistrict(lat, lng) };
    picking = false; $("pickInstruction").classList.remove("active"); showReport();
  }
  function setupGoogleMap(id, zoom) {
    var map = new google.maps.Map($(id), { center: { lat: -23.960, lng: -46.326 }, zoom: zoom, mapTypeId: "roadmap", streetViewControl: false, mapTypeControl: false, fullscreenControl: true, restriction: { latLngBounds: { north: -23.916, south: -24.005, east: -46.278, west: -46.385 }, strictBounds: false } });
    map.addListener("click", function (e) { pickCoordinates(e.latLng.lat(), e.latLng.lng()); });
    return { map: map, markers: [], provider: "google" };
  }
  function setupMap(id, zoom) {
    if (googleKey && window.google && google.maps) return setupGoogleMap(id, zoom);
    if (!window.L) { $(id).innerHTML = '<div class="empty">O mapa precisa de conexão com a internet.</div>'; return null; }
    var map = L.map(id, { scrollWheelZoom: false, maxBounds: [[-24.005, -46.385], [-23.916, -46.278]], maxBoundsViscosity: .65 }).setView([-23.960, -46.326], zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    var layer = L.layerGroup().addTo(map);
    map.on("click", function (e) { pickCoordinates(e.latlng.lat, e.latlng.lng); });
    return { map: map, layer: layer, provider: "osm" };
  }
  function resizeMap(m) { if (!m) return; if (m.provider === "google") google.maps.event.trigger(m.map, "resize"); else if (m.map.invalidateSize) m.map.invalidateSize(); }
  function loadGoogleMaps(key) {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.maps) { resolve(); return; }
      var script = document.createElement("script"), timer = setTimeout(function () { reject(new Error("O Google Maps não respondeu. Confira a chave e as APIs ativadas.")); }, 15000);
      window.__urbanixGoogleReady = function () { clearTimeout(timer); resolve(); };
      script.onerror = function () { clearTimeout(timer); reject(new Error("Não foi possível carregar o Google Maps.")); };
      script.async = true;
      script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&callback=__urbanixGoogleReady&v=weekly";
      document.head.appendChild(script);
    });
  }
  function setMapProviderLabels(label) { ["homeMapBadge", "bigMapBadge"].forEach(function (id) { var el = $(id); if (el) el.textContent = "SANTOS · SP · " + label; }); }
  function resetMap(k) {
    var old = maps[k], id = k === "home" ? "homeMap" : "bigMap";
    if (old && old.provider === "google") { old.markers.forEach(function (m) { m.setMap(null); }); google.maps.event.clearInstanceListeners(old.map); $(id).innerHTML = ""; }
    else if (old && old.map.remove) old.map.remove();
  }
  function useGoogleMaps(key) {
    $("mapSettingsStatus").textContent = "Carregando mapa do Google…";
    loadGoogleMaps(key).then(function () {
      googleKey = key; try { localStorage.setItem("urbanix-google-maps-key", key); } catch (e) {}
      ["home", "big"].forEach(function (k) { resetMap(k); maps[k] = setupGoogleMap(k === "home" ? "homeMap" : "bigMap", k === "home" ? 12 : 13); });
      renderMapMarkers(current()); setMapProviderLabels("GOOGLE MAPS");
      $("mapSettingsStatus").textContent = "Google Maps ativo neste navegador."; showToast("Mapa do Google ativado.");
    }).catch(function (error) { $("mapSettingsStatus").textContent = error.message; });
  }
  function useOpenStreetMap() {
    googleKey = ""; try { localStorage.removeItem("urbanix-google-maps-key"); } catch (e) {}
    Object.keys(maps).forEach(function (k) { resetMap(k); maps[k] = setupMap(k === "home" ? "homeMap" : "bigMap", k === "home" ? 12 : 13); });
    renderMapMarkers(current()); setMapProviderLabels("OPENSTREETMAP"); $("mapSettingsStatus").textContent = "OpenStreetMap ativo.";
  }
  function nearestDistrict(lat, lng) {
    var best = 0, dist = Infinity;
    DISTRICTS.forEach(function (d, i) { var dx = (d.lng - lng) * Math.cos(lat * Math.PI / 180), dy = d.lat - lat, v = dx * dx + dy * dy; if (v < dist) { dist = v; best = i; } });
    return best;
  }
  function renderMapMarkers(items) {
    Object.keys(maps).forEach(function (k) {
      var m = maps[k]; if (!m) return;
      if (m.provider === "google") {
        m.markers.forEach(function (marker) { marker.setMap(null); }); m.markers = [];
        items.forEach(function (o) {
          var c = byCat[o.cat] || byCat.outros;
          var marker = new google.maps.Marker({ position: { lat: o.lat, lng: o.lng }, map: m.map, title: o.title, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: c.color, fillOpacity: o.status === "resolvido" ? .45 : 1, strokeColor: "#fff", strokeWeight: 2 } });
          marker.addListener("click", function () { showDetail(o); }); m.markers.push(marker);
        });
      } else {
        m.layer.clearLayers();
        items.forEach(function (o) { L.marker([o.lat, o.lng], { icon: markerIcon(o), title: o.title }).addTo(m.layer).on("click", function () { showDetail(o); }); });
      }
      resizeMap(m);
    });
  }
  function renderMaps(items) {
    if (!window.L && !(googleKey && window.google && google.maps)) return;
    if (!maps.home) maps.home = setupMap("homeMap", 12);
    if (!maps.big) maps.big = setupMap("bigMap", 13);
    renderMapMarkers(items);
  }

  // ------------------------------------------------------------------ interface geral
  function showToast(text) { var el = $("toast"); el.textContent = text; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3800); }
  function showPage(name) {
    var home = name === "home";
    $("pageHome").classList.toggle("active", home); $("pageMap").classList.toggle("active", !home);
    $("crumbLabel").textContent = home ? "Visão da comunidade" : "Mapa de problemas";
    document.querySelectorAll(".nav [data-page]").forEach(function (b) { b.classList.toggle("active", b.dataset.page === name); });
    if (!home && maps.big) setTimeout(function () { resizeMap(maps.big); }, 80);
    window.scrollTo(0, 0);
  }
  function closeDetail() { $("detailDialog").classList.remove("open"); }

  // ------------------------------------------------------------------ novo relato
  function showReport() {
    if (!requireLogin("Entre ou crie uma conta para registrar um problema.")) return;
    $("formError").style.display = "none"; $("reportDialog").classList.add("open"); $("title").focus();
    if (selectedLocation) {
      $("locationLabel").textContent = DISTRICTS[selectedLocation.district].name + " · Santos";
      $("locationHelp").textContent = selectedLocation.lat.toFixed(4) + ", " + selectedLocation.lng.toFixed(4);
    } else {
      $("locationLabel").textContent = "Localização não selecionada";
      $("locationHelp").textContent = "Marque um ponto no mapa para posicionar o relato.";
    }
  }
  function hideReport() { $("reportDialog").classList.remove("open"); }
  function compressPhoto(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Não foi possível abrir a foto.")); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error("Formato de imagem não reconhecido.")); };
        image.onload = function () {
          var scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          var quality = .82, data = canvas.toDataURL("image/jpeg", quality);
          while (data.length > 1800000 && quality > .45) { quality -= .08; data = canvas.toDataURL("image/jpeg", quality); }
          if (data.length > 2000000) { reject(new Error("A foto ficou muito grande. Escolha outra imagem.")); return; }
          resolve(data);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function clearPhoto() { selectedPhoto = ""; $("photoInput").value = ""; $("photoPreview").removeAttribute("src"); $("photoPreviewWrap").hidden = true; }
  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(","), bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: "image/jpeg" });
  }
  function uploadPhoto(dataUrl) {
    var path = currentUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    return sb.storage.from("fotos").upload(path, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", upsert: false })
      .then(function (res) { if (res.error) throw res.error; return path; });
  }
  function startPick() {
    hideReport(); showPage("map"); picking = true; $("pickInstruction").classList.add("active");
    if (maps.big) setTimeout(function () { resizeMap(maps.big); }, 60);
  }

  function submitReport(e) {
    e.preventDefault();
    if (!requireLogin("Sua sessão expirou. Entre novamente para enviar.")) return;
    var title = $("title").value.trim(), cat = $("category").value, description = $("description").value.trim(), severity = +$("severity").value, err = $("formError");
    function fail(text) { err.textContent = text; err.style.display = "block"; }
    if (!selectedLocation) return fail("Marque a localização no mapa antes de enviar.");
    if (title.length < 4) return fail("Informe um título com pelo menos 4 caracteres.");
    var d = DISTRICTS[selectedLocation.district];
    var button = document.querySelector('#reportForm button[type="submit"]');
    button.disabled = true; button.textContent = "Enviando…"; err.style.display = "none";

    function finish(o, msg) {
      if (!DATA.some(function (x) { return x.id === o.id; })) DATA.unshift(o);
      if (!ONLINE) saveLocal();
      $("reportForm").reset(); selectedLocation = null; clearPhoto(); hideReport(); showPage("home"); renderRows();
      showToast(msg);
    }
    function restore() { button.disabled = false; button.textContent = "Enviar relato"; }

    if (!ONLINE) {
      finish({ id: "local-" + Date.now(), title: title, cat: cat, district: selectedLocation.district, lat: selectedLocation.lat, lng: selectedLocation.lng, days: 0, date: Date.now(), severity: severity, confirms: 0, description: description, photo: selectedPhoto, status: "aberto", demo: false, remote: false }, "Relato salvo neste navegador (modo demonstração).");
      restore(); return;
    }
    var row = { titulo: title, categoria: cat, bairro: d.name, descricao: description, gravidade: severity, latitude: selectedLocation.lat, longitude: selectedLocation.lng };
    var uploaded = null;
    (selectedPhoto ? uploadPhoto(selectedPhoto) : Promise.resolve(null))
      .then(function (path) {
        uploaded = path; row.foto_path = path;
        return sb.from("occurrences").insert(row).select("*, profiles(usuario)").single();
      })
      .then(function (res) {
        if (res.error) throw res.error;
        finish(fromDb(res.data), uploaded ? "Relato e foto publicados para a comunidade." : "Relato publicado para a comunidade.");
      })
      .catch(function (error) {
        console.error(error);
        if (uploaded) sb.storage.from("fotos").remove([uploaded]);
        fail(friendlyError(error, "Não foi possível enviar o relato agora. Tente novamente."));
      })
      .then(restore);
  }

  // ------------------------------------------------------------------ detalhes, confirmação e moderação
  function showDetail(o) {
    var c = byCat[o.cat] || byCat.outros, s = STATUS[o.status || "aberto"];
    var mine = currentUser && o.ownerId && o.ownerId === currentUser.id;
    var already = ONLINE ? confirmedIds.has(o.dbId) : false;
    var html = (o.photo ? '<img src="' + esc(o.photo) + '" alt="Foto enviada com o relato" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin-bottom:13px">' : '') +
      '<h3>' + esc(o.title) + '</h3>' +
      (o.author ? '<p class="detail-author">Relatado por <b>@' + esc(o.author) + '</b></p>' : '') +
      '<div class="detail-meta"><span>' + esc(districtName(o)) + '</span><span>' + esc(dateText(o)) + '</span><span>Gravidade informada: ' + o.severity + '/5</span><span style="color:' + s.color + ';background:' + s.bg + '">' + s.name + '</span>' + (o.demo ? '<span>Amostra fictícia</span>' : '') + '</div>' +
      '<p>' + esc(o.description || "Sem descrição informada.") + '</p>' +
      '<div class="detail-score"><strong>' + prio(o) + '</strong> <span style="font-size:11px;color:#738078">índice experimental de prioridade</span><p style="font-size:10px;margin:7px 0 0">Gravidade 50% · confirmações 30% · tempo 20%. Não representa avaliação oficial de risco.</p></div>';
    if (mine) html += '<p style="font-size:11px">Este relato é seu. ' + o.confirms + ' ' + (o.confirms === 1 ? 'pessoa confirmou' : 'pessoas confirmaram') + '.</p>';
    else if (already) html += '<button class="button sm ghost" disabled>✓ &nbsp; Você já confirmou este relato</button>';
    else html += '<button class="button sm" id="confirmReport">♡ &nbsp; Confirmar que também observei</button>';
    html += '<p style="font-size:9px;margin-top:9px">Uma confirmação por conta. Relatos não são validações oficiais.</p>';
    if (ONLINE && !o.demo && (isAdmin() || mine)) {
      html += '<div class="admin-box">' +
        (isAdmin() ? '<label>Status do relato (moderação)<select id="statusSelect">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + STATUS[k].name + '</option>'; }).join("") + '</select></label>' : '') +
        '<button class="button sm danger" id="deleteReport" type="button">' + (mine ? 'Excluir meu relato' : 'Remover relato (admin)') + '</button></div>';
    } else if (ONLINE && o.demo && isAdmin()) {
      html += '<div class="admin-box"><button class="button sm danger" id="deleteReport" type="button">Remover amostra fictícia</button></div>';
    }
    $("detailTitle").textContent = c.name;
    $("detailBody").innerHTML = html;
    $("detailDialog").classList.add("open");
    if ($("confirmReport")) $("confirmReport").onclick = function () { confirmReport(o, this); };
    if ($("statusSelect")) $("statusSelect").onchange = function () { setStatus(o, this.value, this); };
    if ($("deleteReport")) $("deleteReport").onclick = function () { removeReport(o, this); };
  }

  function confirmReport(o, button) {
    if (!requireLogin("Entre para confirmar relatos da comunidade.")) return;
    if (!ONLINE) {
      var key = "urbanix-confirmed-" + currentUser.id, done = [];
      try { done = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
      if (done.indexOf(o.id) >= 0) { showToast("Esta conta já confirmou este relato."); return; }
      done.push(o.id); try { localStorage.setItem(key, JSON.stringify(done)); } catch (e) {}
      o.confirms++; saveLocal(); renderRows(); closeDetail(); showToast("Confirmação adicionada."); return;
    }
    button.disabled = true;
    sb.from("confirmations").insert({ occurrence_id: o.dbId }).then(function (res) {
      if (res.error) {
        if (res.error.code === "23505") { confirmedIds.add(o.dbId); showDetail(o); showToast("Você já confirmou este relato."); return; }
        throw res.error;
      }
      confirmedIds.add(o.dbId); o.confirms++; renderRows(); closeDetail(); showToast("Confirmação registrada. Obrigado!");
    }).catch(function (e) { console.error(e); button.disabled = false; showToast(friendlyError(e, "Não foi possível confirmar agora.")); });
  }

  function setStatus(o, status, select) {
    select.disabled = true;
    sb.from("occurrences").update({ status: status }).eq("id", o.dbId).select("*, profiles(usuario)").single().then(function (res) {
      if (res.error) throw res.error;
      var fresh = fromDb(res.data); Object.keys(fresh).forEach(function (k) { o[k] = fresh[k]; });
      renderRows(); showDetail(o); showToast("Status alterado para “" + STATUS[status].name + "”.");
    }).catch(function (e) { console.error(e); select.disabled = false; showToast("Não foi possível alterar o status (só admins podem)."); });
  }

  function removeReport(o, button) {
    if (!window.confirm("Excluir este relato? Essa ação não pode ser desfeita.")) return;
    button.disabled = true;
    sb.from("occurrences").delete().eq("id", o.dbId).select("id").then(function (res) {
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw new Error("sem permissão");
      if (o.photoPath) sb.storage.from("fotos").remove([o.photoPath]);
      DATA = DATA.filter(function (x) { return x !== o; }); closeDetail(); renderRows(); showToast("Relato excluído.");
    }).catch(function (e) { console.error(e); button.disabled = false; showToast("Não foi possível excluir este relato."); });
  }

  // ------------------------------------------------------------------ contas
  function authMessage(text, kind) { var el = $("authError"); el.textContent = text || ""; el.className = "auth-error" + (kind === "info" ? " info" : ""); el.style.display = text ? "block" : "none"; }
  function openAuth(reason, mode) {
    setAuthMode(mode || "login");
    if (reason) authMessage(reason, "info");
    $("authGate").style.display = "grid";
    setTimeout(function () { (ONLINE ? $("authEmail") : $("authUsername")).focus(); }, 30);
  }
  function closeAuth() { $("authGate").style.display = "none"; }
  function requireLogin(reason) { if (currentUser) return true; hideReport(); closeDetail(); openAuth(reason); return false; }

  function setAuthMode(mode) {
    authMode = mode; var reg = mode === "register";
    $("authTitle").textContent = reg ? "Crie sua conta." : "Bom ter você por aqui.";
    $("authDescription").textContent = reg ? "Escolha um nome de usuário público e use seu e-mail para entrar." : "Entre para registrar e confirmar problemas na sua cidade.";
    $("authSubmit").textContent = reg ? "Criar conta" : "Entrar";
    $("authSwitch").textContent = reg ? "Já tenho uma conta" : "Criar uma conta";
    $("authSwitch").style.display = ONLINE ? "" : "none";
    var showUser = !ONLINE || reg, showEmail = ONLINE;
    $("authUserField").style.display = showUser ? "" : "none"; $("authUsername").required = showUser;
    $("authEmailField").style.display = showEmail ? "" : "none"; $("authEmail").required = showEmail;
    $("authUsername").placeholder = reg ? "ex.: maria_santos" : "Seu usuário";
    $("authPassword").minLength = reg ? 8 : 1;
    $("authPassword").autocomplete = reg ? "new-password" : "current-password";
    $("authPassword").placeholder = reg ? "Mínimo de 8 caracteres" : "Sua senha";
    $("authDemo").style.display = !ONLINE ? "block" : "none";
    authMessage("");
  }

  function updateProfileUI() {
    if (currentUser) {
      $("signedInUser").textContent = currentUser.usuario + (isAdmin() ? " · admin" : "");
      $("signedAvatar").textContent = currentUser.usuario.charAt(0).toUpperCase();
      $("logoutBtn").textContent = "Sair";
    } else {
      $("signedInUser").textContent = "Visitante";
      $("signedAvatar").textContent = "?";
      $("logoutBtn").textContent = "Entrar";
    }
  }

  function handleSession(session) {
    if (!session) {
      currentUser = null; confirmedIds = new Set(); updateProfileUI(); return;
    }
    if (currentUser && currentUser.id === session.user.id) return;
    var meta = session.user.user_metadata || {};
    currentUser = { id: session.user.id, usuario: meta.usuario || String(session.user.email || "conta").split("@")[0], papel: "usuario" };
    updateProfileUI();
    sb.from("profiles").select("usuario, papel").eq("id", session.user.id).maybeSingle().then(function (res) {
      if (res.data && currentUser && currentUser.id === session.user.id) { currentUser.usuario = res.data.usuario; currentUser.papel = res.data.papel; updateProfileUI(); }
    });
    loadConfirmed();
  }

  function submitAuth(e) {
    e.preventDefault();
    var user = $("authUsername").value.trim(), email = $("authEmail").value.trim(), password = $("authPassword").value, button = $("authSubmit");
    authMessage("");

    if (!ONLINE) {
      if (user === "adm" && password === "adm") {
        currentUser = { id: "local-admin", usuario: "adm", papel: "admin" };
        updateProfileUI(); closeAuth(); DATA = DEMO.slice(); loadLocal(); renderRows();
        showToast("Modo demonstração: os dados ficam só neste navegador.");
      } else authMessage("No modo demonstração, use usuário adm e senha adm.");
      return;
    }

    button.disabled = true;
    var done = function () { button.disabled = false; };
    if (authMode === "login") {
      sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) throw res.error;
        closeAuth(); $("authForm").reset(); showToast("Bem-vindo de volta!");
      }).catch(function (err) { authMessage(friendlyError(err, "Não foi possível entrar.")); }).then(done);
      return;
    }
    if (!/^[A-Za-z0-9_.]{3,32}$/.test(user)) { done(); return authMessage("Usuário: de 3 a 32 caracteres, só letras sem acento, números, ponto ou _."); }
    if (password.length < 8) { done(); return authMessage("A senha precisa ter pelo menos 8 caracteres."); }
    sb.rpc("usuario_disponivel", { nome: user }).then(function (res) {
      if (res.error) throw res.error;
      if (res.data === false) throw new Error("__usuario_em_uso");
      return sb.auth.signUp({ email: email, password: password, options: { data: { usuario: user }, emailRedirectTo: location.origin + location.pathname } });
    }).then(function (res) {
      if (res.error) throw res.error;
      if (res.data && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
        throw new Error("already registered");
      }
      if (!res.data.session) {
        setAuthMode("login"); $("authEmail").value = email;
        authMessage("Conta criada! Enviamos um link de confirmação para " + email + ". Confirme e depois entre aqui.", "info");
      } else {
        closeAuth(); $("authForm").reset(); showToast("Conta criada. Boas-vindas ao Urbanix!");
      }
    }).catch(function (err) {
      authMessage(err && err.message === "__usuario_em_uso" ? "Este nome de usuário já está em uso. Escolha outro." : friendlyError(err, "Não foi possível criar a conta."));
    }).then(done);
  }

  function logout() {
    if (!currentUser) { openAuth(); return; }
    if (!ONLINE) { currentUser = null; updateProfileUI(); DATA = DEMO.slice(); renderRows(); showToast("Você saiu."); return; }
    sb.auth.signOut().then(function () { showToast("Você saiu da sua conta."); });
  }

  // ------------------------------------------------------------------ eventos
  categoryOptions();
  if (googleKey) useGoogleMaps(googleKey);
  $("homePeriod").addEventListener("change", renderRows);
  $("homeCategory").addEventListener("change", renderRows);
  $("mapFilters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b) return;
    activeCategory = b.dataset.cat;
    this.querySelectorAll(".filter-chip").forEach(function (x) { x.classList.toggle("active", x === b); });
    renderRows();
  });
  document.querySelectorAll("[data-page]").forEach(function (b) { b.addEventListener("click", function () { showPage(b.dataset.page); }); });
  document.querySelectorAll("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { showPage("map"); }); });
  $("newReport").onclick = showReport; $("navReport").onclick = showReport; $("mapNewReport").onclick = showReport;
  $("closeReport").onclick = hideReport; $("closeDetail").onclick = closeDetail;
  $("chooseLocation").onclick = startPick;
  $("cancelPick").onclick = function () { picking = false; $("pickInstruction").classList.remove("active"); };
  $("reportForm").addEventListener("submit", submitReport);
  $("photoInput").addEventListener("change", function () {
    var file = this.files && this.files[0]; if (!file) return;
    if (!file.type.match(/^image\//)) { showToast("Escolha um arquivo de imagem."); this.value = ""; return; }
    compressPhoto(file).then(function (data) { selectedPhoto = data; $("photoPreview").src = data; $("photoPreviewWrap").hidden = false; })
      .catch(function (error) { clearPhoto(); showToast(error.message); });
  });
  $("removePhoto").onclick = clearPhoto;
  $("mapSettings").onclick = function () { $("googleMapsKey").value = googleKey; $("mapSettingsDialog").classList.add("open"); };
  $("closeMapSettings").onclick = function () { $("mapSettingsDialog").classList.remove("open"); };
  $("useGoogleMaps").onclick = function () { var key = $("googleMapsKey").value.trim(); if (!key) { $("mapSettingsStatus").textContent = "Cole uma chave de API válida para continuar."; return; } useGoogleMaps(key); };
  $("useOSM").onclick = useOpenStreetMap;
  document.body.addEventListener("click", function (e) {
    var row = e.target.closest("[data-report]");
    if (row) { var o = DATA.find(function (x) { return x.id === row.dataset.report; }); if (o) showDetail(o); }
  });
  document.body.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return; var row = e.target.closest && e.target.closest("[data-report]");
    if (row) { var o = DATA.find(function (x) { return x.id === row.dataset.report; }); if (o) showDetail(o); }
  });
  ["reportDialog", "detailDialog", "mapSettingsDialog"].forEach(function (id) { $(id).addEventListener("click", function (e) { if (e.target === this) this.classList.remove("open"); }); });
  $("authGate").addEventListener("click", function (e) { if (e.target === this) closeAuth(); });
  $("authClose").onclick = closeAuth;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { hideReport(); closeDetail(); closeAuth(); $("mapSettingsDialog").classList.remove("open"); } });
  $("authSwitch").onclick = function () { setAuthMode(authMode === "login" ? "register" : "login"); };
  $("authForm").addEventListener("submit", submitAuth);
  $("logoutBtn").onclick = logout;

  // ------------------------------------------------------------------ início
  updateProfileUI();
  setAuthMode("login");
  if (ONLINE) {
    sb.auth.onAuthStateChange(function (event, session) { setTimeout(function () { handleSession(session); }, 0); });
    sb.channel("urbanix-occurrences").on("postgres_changes", { event: "*", schema: "public", table: "occurrences" }, scheduleReload).subscribe();
    loadData();
  } else {
    var banner = $("modeBanner");
    banner.innerHTML = "<b>Modo demonstração.</b> O banco de dados ainda não foi configurado: os relatos ficam só neste navegador. Para entrar, use <b>adm</b> / <b>adm</b>.";
    banner.hidden = false;
    loadData();
  }
})();
