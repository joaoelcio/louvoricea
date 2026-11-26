import {API_URL} from './config.js';
import {voices,instruments,isVocal,candidates,generate,talkback} from './engine.js';
import {workbook} from './excel.js';
import {pdfDocument} from './pdf.js';

const $ = selector => document.querySelector(selector);
const main = $('#main');
const dateText = (date, options = {dateStyle:'long'}) => new Date(date + 'T12:00:00').toLocaleDateString('pt-BR',options);
function shift(date, days) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0,10);
}
const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Belem'}).format(new Date());
const nextSunday = shift(today,(7 - new Date(today + 'T12:00:00Z').getUTCDay()) % 7);
const empty = () => ({formation:{},exceptions:{},drafts:{},published:{},availability:{},people:[],version:0});
const demoPeople = [
  ['a','Ana Ribeiro','Soprano',['Teclado'],true],
  ['b','Bruno Costa','Tenor',['Violão'],true],
  ['c','Carla Lima','Contralto',[],false],
  ['d','Daniel Souza','Barítono',['Baixo elétrico'],false],
  ['e','Elisa Silva','Soprano',[],false],
  ['f','Felipe Santos','Tenor',['Bateria'],true],
  ['g','Gabriel Almeida','',['Violão'],false],
  ['h','Helena Rocha','',['Teclado'],true],
  ['i','Igor Mendes','',['Bateria','Baixo elétrico'],false]
].map(([id,name,voice,instruments,talk]) => ({id,name,voice,instruments,talk,email:id+'@exemplo.test',active:true,role:'integrante'}));
function demoData() {
  const data = empty();
  data.people = demoPeople;
  data.formation = {'Violão':1,'Teclado':1,'Bateria':1,'Vocal • Soprano':1,'Vocal • Tenor':1,'Vocal • Contralto':1,'Vocal • Barítono':1};
  for (const person of data.people) data.availability[person.id] = Array.from({length:8},(_,i) => shift(nextSunday,i*7)).filter((_,i) => person.id !== 'i' || i % 2 === 0);
  const counts = {};
  for (let i=0;i<4;i++) {
    const date = shift(nextSunday,i*7);
    data.drafts[date] = generate(date,data.formation,data.people,data.availability,counts);
  }
  return data;
}
const loginLabels = {lider:'Login líder',integrante:'Login integrante'};
let loginRole = '';
let token = sessionStorage.getItem('louvor-token') || '';
let me, state = empty(), page = '', selected = '', edit = '', filter = '', month = nextSunday.slice(0,7);
let formationMode = 'default', formationDate = '';
let exportStart = nextSunday, exportEnd = shift(nextSunday,56), noticeTimer;
const privileged = () => ['lider','admin'].includes(me?.role);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const option = (value,label,current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const button = (action,label,primary=false) => `<button type="button" data-action="${action}"${primary ? ' class="primary"' : ''}>${label}</button>`;
const heading = (title,subtitle) => `<h1>${title}</h1><p>${subtitle}</p>`;
function notify(message) {
  $('#notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('#notice').textContent = '',4800);
}
async function api(path,body) {
  const response = await fetch(API_URL + '/api/' + path,{
    method:body === undefined ? 'GET' : 'POST',
    headers:{...body === undefined ? {} : {'Content-Type':'application/json'},...token ? {'Authorization':'Bearer ' + token} : {}},
    body:body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha na solicitação.');
  return result;
}
async function load() {
  if (API_URL) {
    const result = await api('state');
    me = result.me;
    state = result.state;
    paletteCache.clear();
  } else {
    state = JSON.parse(localStorage.getItem('louvor-demo-v1')) || demoData();
  }
}
async function save(next) {
  if (API_URL) {
    await api('schedule',{...next,people:undefined,availability:undefined});
    await load();
  } else {
    state = next;
    localStorage.setItem('louvor-demo-v1',JSON.stringify(state));
  }
}
function nav() {
  const labels = privileged() ? {review:'Revisar escala',formation:'Formação',people:'Integrantes',published:'Escalas publicadas',availability:'Disponibilidade',manage:'Gerenciar escalas',repertoire:'Repertório'} : {availability:'Disponibilidade',published:'Escalas publicadas'};
  const icons = {review:'▤',formation:'◫',people:'♙',published:'▦',availability:'✓',manage:'⋯',repertoire:'♫'};
  $('#nav').innerHTML = me && !me.force ? Object.entries(labels).map(([id,label]) => `<button data-action="nav/${id}" aria-current="${page === id}"><span class="nav-icon" aria-hidden="true">${icons[id]}</span>${label}</button>`).join('') : '';
  $('#layout').classList.toggle('full',!me || me.force);
  $('#account').innerHTML = me ? `<span>${esc(me.name)}</span> ${me.force || !API_URL ? '' : button('password','Senha')} ${button('logout','Sair')}` : '';
}
function loginScreen() {
  if (!API_URL || !loginRole) {
    const choices = Object.entries(loginLabels).map(([role,label]) => button((API_URL ? 'choose-login/' : 'demo/')+role,label,true));
    return `<section class="card login"><div class="login-banner" aria-hidden="true"><span>♫</span></div>${heading('Escala do Louvor',API_URL ? 'Escolha seu perfil para entrar.' : 'Escolha um perfil para testar a prévia com dados fictícios.')}<div class="login-options">${choices.join('')}</div></section>`;
  }
  const identifier = loginRole === 'lider'
    ? '<label>E-mail ou nome de usuário<input name="login" required autocomplete="username"></label>'
    : '<label>E-mail<input name="login" type="email" required autocomplete="username"></label>';
  return `<section class="card login">${heading(loginLabels[loginRole],'Entre com os dados da sua conta.')}<form id="login">${identifier}<label>Senha<input name="password" type="password" required autocomplete="current-password"></label><div class="row"><button class="primary">Entrar</button>${button('choose-login','Trocar perfil')}</div></form></section>`;
}
const personName = id => state.people.find(person => person.id === id)?.name || '';
const roleLabel = role => role === 'Baixo elétrico' ? 'Baixo' : role;
function line(role,name) {
  return `<div class="slot"><strong>${esc(roleLabel(role))}</strong><span class="${name ? '' : 'open'}">${esc(name || 'Vaga em aberto')}</span></div>`;
}
function eventHeader(date,status) {
  const day = dateText(date,{day:'2-digit'});
  const month = dateText(date,{month:'short'}).replace('.','');
  return `<div class="event-header"><div class="event-date" aria-hidden="true"><strong>${day}</strong><span>${month}</span></div><div><h2>Culto de domingo</h2><time datetime="${date}">${dateText(date)}</time></div><span class="badge ${status === 'Rascunho' ? 'draft' : ''}">${status}</span></div>`;
}
function spotifyUrl(value) {
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Cole o link de uma playlist do Spotify.'); }
  const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/);
  if (url.origin !== 'https://open.spotify.com' || url.username || url.password || !match) {
    throw new Error('Cole um link de playlist de open.spotify.com.');
  }
  return 'https://open.spotify.com/playlist/'+match[1];
}
function playlistPreview(date) {
  const url = state.playlists?.[date];
  if (!url) return '';
  return `<section class="playlist"><h3>Playlist do culto</h3><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir no Spotify</a>
    <iframe title="Prévia da playlist de ${dateText(date)}" src="${esc(url.replace('/playlist/','/embed/playlist/'))}" loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></section>`;
}
function chordsLink(date) {
  const url = state.chords?.[date];
  return url ? `<section class="playlist"><h3>Cifras do culto</h3><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir cifras</a></section>` : '';
}
function paletteSection(date) {
  if (!Object.hasOwn(state.palettes || {},date)) return '';
  const image = API_URL ? `data-palette="${date}"` : `src="${esc(state.palettes[date])}"`;
  return `<section class="palette"><h3>Paleta de roupas</h3><img ${image} alt="Paleta de cores das roupas para o culto de ${dateText(date)}"><p class="palette-error" hidden>Não foi possível carregar a imagem da paleta.</p></section>`;
}
const paletteCache = new Map();
async function showPalette(image) {
  const date = image.dataset.palette;
  try {
    if (!paletteCache.has(date)) {
      paletteCache.set(date,api('palette/'+date).catch(error => {
        paletteCache.delete(date);
        throw error;
      }));
    }
    image.src = (await paletteCache.get(date)).image;
  } catch {
    image.hidden = true;
    image.nextElementSibling.hidden = false;
  }
}
async function preparePalette(file) {
  if (!file?.size || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
    throw new Error('Escolha uma imagem PNG, JPG ou WebP.');
  }
  if (file.size > 12_000_000) throw new Error('Escolha uma imagem de até 12 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Não foi possível abrir a imagem selecionada.'); }
  const scale = Math.min(1,1000 / Math.max(bitmap.width,bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1,Math.round(bitmap.width*scale));
  canvas.height = Math.max(1,Math.round(bitmap.height*scale));
  const ctx = canvas.getContext('2d',{alpha:false});
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg',.82);
}
async function savePalette(date,image) {
  if (API_URL) {
    await api('palette',{date,image});
    paletteCache.delete(date);
    await load();
  } else {
    const next = structuredClone(state);
    next.palettes ??= {};
    if (image) next.palettes[date] = image;
    else delete next.palettes[date];
    await save(next);
  }
}
function repertoireView() {
  if (!privileged()) return '';
  selected ||= nextSunday;
  const dates = [...new Set([...Object.keys(state.playlists || {}),...Object.keys(state.chords || {}),...Object.keys(state.palettes || {})])].sort();
  return heading('Repertório','Organize a playlist, as cifras e a paleta de roupas de cada domingo.') +
    `<form id="playlist" class="card"><label>Domingo<input id="playlist-date" type="date" name="date" value="${selected}" required></label>
    ${dates.length ? `<label>Domingos com repertório<select id="playlist-saved">${option('','Escolha uma data',selected)}${dates.map(date => option(date,dateText(date),selected)).join('')}</select></label>` : ''}
    <label>Link da playlist<input type="url" name="url" value="${esc(state.playlists?.[selected])}" placeholder="https://open.spotify.com/playlist/…"></label>
    <div class="row"><button class="primary">Salvar playlist</button>${state.playlists?.[selected] ? button('remove-playlist','Remover playlist') : ''}</div>
    <small>Os integrantes verão a playlist junto da escala publicada desse domingo.</small></form>
    <form id="chords" class="card"><h2>Cifras do culto</h2>
    <label>Link da pasta ou arquivo<input type="url" name="url" maxlength="2048" value="${esc(state.chords?.[selected])}" required></label>
    <small>Cole um link HTTPS de uma pasta do Drive, PDF ou documento. Confira se os integrantes têm acesso ao material.</small>
    <div class="row"><button class="primary">Salvar cifras</button>${state.chords?.[selected] ? button('remove-chords','Remover cifras') : ''}</div></form>
    <form id="palette" class="card"><h2>Paleta de roupas</h2>
    <label>Imagem da paleta<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required></label>
    <small>A imagem será exibida no cartão do culto depois que a escala for publicada.</small>
    <div class="row"><button class="primary">Salvar imagem</button>${state.palettes?.[selected] ? button('remove-palette','Remover imagem') : ''}</div>
    ${paletteSection(selected)}</form>
    ${state.chords?.[selected] ? `<div class="card">${chordsLink(selected)}</div>` : ''}
    ${state.playlists?.[selected] ? `<div class="card">${playlistPreview(selected)}</div>` : ''}`;
}
function directorPlaylistForm(day) {
  if (!me?.directorEligible || day.director !== me.id) return '';
  return `<form class="director-playlist" data-director-playlist><h3>Editar playlist do culto</h3>
    <input type="hidden" name="date" value="${day.date}">
    <label>Link da playlist<input type="url" name="url" value="${esc(state.playlists?.[day.date])}" required></label>
    <div><button class="primary">Salvar playlist</button></div></form>`;
}
function readable(day) {
  return `<section class="card event-card">${eventHeader(day.date,'Publicada')}${day.slots.map(slot => line(slot.role,slot.name)).join('')}${day.directorName ? line('Dirigente',day.directorName) : ''}${line('Talkback',day.talkName)}${directorPlaylistForm(day)}${playlistPreview(day.date)}${chordsLink(day.date)}${paletteSection(day.date)}</section>`;
}
function publishedView() {
  const days = Object.values(state.published).sort((a,b) => a.date.localeCompare(b.date));
  const controls = privileged() ? `<form id="export" class="card"><h2>Exportar escala</h2><div class="row"><label>De<input type="date" name="start" value="${exportStart}" required></label><label>Até<input type="date" name="end" value="${exportEnd}" required></label><button name="format" value="pdf">PDF</button><button name="format" value="xlsx">Excel</button></div></form>` : '';
  const cards = days.map(day => '<div class="published-item">'+readable(day)+(privileged() ? `<div class="toolbar">${button('pdf/'+day.date,'PDF deste domingo')}</div>` : '')+'</div>');
  return heading('Escalas publicadas','Consulte a formação de cada domingo.') + controls + '<div class="grid event-grid">' + (cards.join('') || '<p>Nenhuma escala publicada.</p>') + '</div>';
}
async function removeSchedules(kind,dates) {
  if (API_URL) {
    await api('delete-schedules',{kind,dates,version:state.version});
    await load();
  } else {
    const next = structuredClone(state);
    for (const date of dates) delete next[kind][date];
    await save(next);
  }
}
function manageView() {
  if (!privileged()) return '';
  const list = (kind,title,emptyText,actionLabel) => {
    const dates = Object.keys(state[kind]).sort();
    const published = kind === 'published';
    const rows = dates.map(date => {
      const time = `<time datetime="${date}">${dateText(date)}</time>`;
      const dateControl = published ? `<label class="inline"><input type="checkbox" name="publishedDate" value="${date}">${time}</label>` : time;
      return `<div class="slot manage-row">${dateControl}<button type="button" class="danger" data-action="delete-${kind}/${date}" aria-label="${actionLabel} de ${dateText(date)}">${actionLabel}</button></div>`;
    }).join('');
    if (published && dates.length) {
      return `<form id="delete-published-batch" class="card"><h2>${title}</h2><div class="row">
        <label class="inline"><input type="checkbox" id="mark-all-published">Marcar todas</label>
        <button type="submit" class="danger" id="delete-selected-published" disabled>Excluir selecionadas</button>
      </div><div>${rows}</div></form>`;
    }
    return `<section class="card"><h2>${title}</h2>${rows || `<p>${emptyText}</p>`}</section>`;
  };
  return heading('Gerenciar escalas','Escolha as escalas que deseja excluir.') +
    list('drafts','Rascunhos','Nenhum rascunho salvo.','Excluir rascunho') +
    list('published','Escalas publicadas','Nenhuma escala publicada.','Excluir escala');
}
function updatePublishedSelection(target) {
  const form = target.form;
  if (!form || form.id !== 'delete-published-batch') return;
  const all = form.querySelector('#mark-all-published');
  const dates = [...form.querySelectorAll('[name="publishedDate"]')];
  if (target === all) for (const date of dates) date.checked = all.checked;
  const count = dates.filter(date => date.checked).length;
  all.checked = count === dates.length;
  all.indeterminate = count > 0 && count < dates.length;
  const remove = form.querySelector('#delete-selected-published');
  remove.disabled = count === 0;
  remove.textContent = count ? `Excluir selecionadas (${count})` : 'Excluir selecionadas';
}
function availabilityView() {
  const first = month + '-01';
  const sunday = shift(first,(7-new Date(first+'T12:00:00Z').getUTCDay())%7);
  const dates = [];
  for (let date=sunday;date.startsWith(month);date=shift(date,7)) dates.push(date);
  const chosen = state.availability[me.id] || [];
  const responded = new Set(state.responded?.[me.id] || []);
  return heading('Disponibilidade','Marque os domingos em que você pode participar.') + `<div class="card"><label>Mês<input id="month" type="month" value="${month}"></label></div><form id="availability"><div class="grid">${dates.map(date => `<label class="card inline"><input type="checkbox" name="date" value="${date}"${chosen.includes(date) ? ' checked' : ''}>${dateText(date)}</label>`).join('')}</div><div><button class="primary">Salvar disponibilidade</button></div>${dates.every(date => responded.has(date)) ? '<small>Disponibilidade já informada para este mês.</small>' : ''}</form>`;
}
const instrumentCatalog = () => [...instruments,...(state.customInstruments || [])];
const normalizeInstrument = name => name.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
function formationFields(formation) {
  const group = (title,roles) => `<section><h3>${title}</h3><div class="grid">${roles.map(role => `<label>${esc(isVocal(role) ? role.slice('Vocal • '.length) : roleLabel(role))}<input name="${esc(role)}" type="number" min="0" max="12" value="${Object.hasOwn(formation,role) ? formation[role] : 0}" required></label>`).join('')}</div></section>`;
  return group('Instrumentos',instrumentCatalog()) + group('Vocal',voices.map(voice => 'Vocal • '+voice));
}
function formationView() {
  const specific = formationMode === 'specific';
  const dates = Object.keys(state.exceptions).sort();
  const exception = state.exceptions[formationDate];
  const controls = `<div class="row toolbar" aria-label="Tipo de formação">
    <button type="button" data-action="formation-default" aria-pressed="${!specific}" class="${specific ? '' : 'primary'}">Formação padrão</button>
    <button type="button" data-action="formation-specific" aria-pressed="${specific}" class="${specific ? 'primary' : ''}">Formação específica</button>
    </div>`;
  const day = specific ? `<div class="row"><label>Domingo da formação específica<input id="formation-date" type="date" value="${esc(formationDate)}" required></label>
    ${dates.length ? `<label>Formações salvas<select id="formation-saved">${option('','Selecione uma data',formationDate)}${dates.map(date => option(date,dateText(date),formationDate)).join('')}</select></label>` : ''}
    </div><p>${exception ? 'Esta formação vale apenas para o domingo selecionado.' : 'Escolha um domingo para ajustar as vagas a partir da formação padrão.'}</p>` : '<p>Esta formação será usada nos domingos que não tiverem uma formação específica.</p>';
  const editable = !specific || formationDate;
  return heading('Formação da banda','Defina as vagas por instrumento e classificação vocal.') + controls +
    `<form id="formation" class="card"><h2>${specific ? 'Formação específica' : 'Formação padrão'}</h2>${day}${editable ? formationFields(exception && specific ? exception : state.formation) : ''}
    ${editable ? `<div class="row"><button class="primary">${specific ? 'Salvar formação deste domingo' : 'Salvar formação padrão'}</button>${specific && exception ? button('formation-reset','Voltar ao padrão neste domingo') : ''}</div>` : ''}</form>
    <form id="instrument" class="card"><h2>Cadastrar instrumento</h2><div class="row"><label>Nome do instrumento<input name="instrumentName" maxlength="60" placeholder="Ex.: Saxofone" required></label><button>Adicionar instrumento</button></div></form>`;
}
function peopleView() {
  const current = state.people.find(person => person.id === edit);
  const list = state.people.filter(person => (person.name+' '+person.email).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const options = me.role === 'admin' ? [['integrante','Integrante'],['lider','Líder']] : [['integrante','Integrante']];
  const row = person => `<div class="slot"><div><strong>${esc(person.name)}</strong><br><small>${esc([person.email,...person.instruments.map(roleLabel),person.voice && 'Vocal • '+person.voice,person.talk && 'Talkback',!person.active && 'Inativo'].filter(Boolean).join(' · '))}</small></div><div class="row">${person.role === 'admin' || (person.role === 'lider' && me.role !== 'admin') ? '' : button('edit/'+person.id,'Editar')}${API_URL && me.role === 'admin' && person.role !== 'admin' ? button('reset/'+person.id,'Redefinir senha') : ''}</div></div>`;
  return heading('Integrantes','Gerencie os cadastros e as funções da banda.') +
    `<div class="card"><form id="filter" class="row"><label>Buscar integrante<input name="query" type="search" value="${esc(filter)}"></label><button>Buscar</button></form>${list.map(row).join('') || '<p>Nenhum integrante encontrado.</p>'}</div>
    <form id="person" class="card"><h2>${current ? 'Editar integrante' : 'Cadastrar integrante'}</h2><div class="grid"><label>Nome<input name="name" maxlength="120" value="${esc(current?.name)}" required></label><label>E-mail<input name="email" type="email" value="${esc(current?.email)}" required></label><label>Perfil<select name="role">${options.map(([id,name]) => option(id,name,current?.role)).join('')}</select></label><label>Classificação vocal<select name="voice">${option('','Sem função vocal',current?.voice)}${voices.map(voice => option(voice,voice,current?.voice)).join('')}</select></label></div>
    <fieldset><legend>Instrumentos</legend>${instrumentCatalog().map(role => `<label class="inline"><input type="checkbox" name="instrument" value="${esc(role)}"${current?.instruments.includes(role) ? ' checked' : ''}>${esc(roleLabel(role))}</label>`).join('')}</fieldset><label class="inline"><input type="checkbox" name="talk"${current?.talk ? ' checked' : ''}>Pode fazer talkback</label>${API_URL && !current ? '<label>Senha temporária<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>' : ''}<label class="inline"><input type="checkbox" name="directorEligible"${current?.directorEligible ? ' checked' : ''}>Pode ser dirigente</label><label class="inline"><input type="checkbox" name="active"${current?.active === false ? '' : ' checked'}>Conta ativa</label><div class="row"><button class="primary">Salvar cadastro</button>${current ? button('new','Cancelar edição') : ''}</div></form>`;
}
function reviewView() {
  const dates = Object.keys(state.drafts).sort();
  if (!dates.includes(selected)) selected = dates[0] || '';
  const day = state.drafts[selected];
  const pending = day ? state.people.filter(person => person.active && person.role !== 'admin' && !(state.responded?.[person.id]?.includes(day.date) || state.availability[person.id]?.includes(day.date))) : [];
  const slots = day?.slots.map((slot,index) => {
    const choices = candidates(day,index,state.people,state.availability);
    return `<div class="slot"><strong>${esc(roleLabel(slot.role))}</strong><select data-slot="${index}" aria-label="${esc(roleLabel(slot.role))}" class="${slot.person ? '' : 'open'}">${option('',choices.length ? 'Vaga em aberto' : 'Nenhum integrante disponível para esta vaga',slot.person)}${choices.map(person => option(person.id,person.name + (day.slots.some((other,i) => i !== index && other.person === person.id && isVocal(other.role)) ? ' · Já no vocal' : ''),slot.person)).join('')}</select></div>`;
  }).join('');
  return heading('Revisar escala','Gere a programação de domingos e confira a formação antes de publicar.') +
    `<form id="generate" class="card"><h2>Gerar escala</h2><div class="row"><label>Primeiro domingo<input type="date" name="start" value="${nextSunday}" required></label><label>Quantidade de domingos<input type="number" name="count" value="8" min="1" max="52" required></label><button class="primary">Gerar rascunho</button></div></form>` +
    (day ? `<section class="card event-card">${eventHeader(day.date,'Rascunho')}<div class="row toolbar event-controls"><label>Selecionar domingo<select id="review-date">${dates.map(date => option(date,dateText(date),selected)).join('')}</select></label></div>${slots}<div class="slot"><strong>Dirigente</strong><select data-slot="director" aria-label="Dirigente">${option('','Vaga em aberto',day.director || '')}${state.people.filter(p => p.id === day.director || (p.active && p.directorEligible && state.availability[p.id]?.includes(day.date))).map(p => option(p.id,p.name,day.director)).join('')}</select></div><div class="slot"><strong>Talkback</strong><select data-slot="talk" aria-label="Talkback">${option('','Vaga em aberto',day.talk)}${talkback(day,state.people).map(person => option(person.id,person.name,day.talk)).join('')}</select></div>${pending.length ? `<p><small>Ainda sem disponibilidade informada para este dia: ${esc(pending.map(person => person.name).join(', '))}</small></p>` : ''}<div class="row">${button('publish-day','Publicar domingo',true)}${button('publish-all','Publicar todos os rascunhos')}</div></section>` : '<p>Os rascunhos aparecem aqui depois da geração.</p>');
}
function passwordView() {
  return `<section class="card login">${heading('Alterar senha','Use no mínimo 8 caracteres.') }<form id="password"><label>Senha atual<input name="current" type="password" autocomplete="current-password" required></label><label>Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="primary">Salvar nova senha</button></form></section>`;
}
function render() {
  nav();
  const views = {repertoire:repertoireView,manage:manageView,availability:availabilityView,published:publishedView,formation:formationView,people:peopleView,review:reviewView,password:passwordView};
  main.innerHTML = !me ? loginScreen() : me.force ? passwordView() : (views[page] || availabilityView)();
  main.querySelectorAll('[data-palette]').forEach(showPalette);
}
function defaultPage() { page = privileged() ? 'review' : 'availability'; }
function validateSunday(date) {
  if (new Date(date+'T12:00:00Z').getUTCDay() !== 0) throw new Error('Selecione uma data que caia no domingo.');
}
function publication(day) {
  return {date:day.date,slots:day.slots.map(slot => ({role:slot.role,name:personName(slot.person),isTalkback:Boolean(day.talk && slot.person === day.talk && !isVocal(slot.role))})),talkName:personName(day.talk),director:day.director || '',directorName:personName(day.director)};
}
function download(blob,filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function exportSlots(day,talkLabel = 'Talkback') {
  // As versões anteriores guardavam apenas o nome do responsável.
  let talkIndex = day.slots.findIndex(slot => slot.isTalkback);
  if (talkIndex === -1 && day.talkName) {
    talkIndex = day.slots.findIndex(slot => !isVocal(slot.role) && slot.name === day.talkName);
  }
  const slots = day.slots.map((slot,index) => ({
    role:slot.role,
    name:(slot.name || 'Vaga em aberto') + (index === talkIndex ? ' ('+talkLabel+')' : '')
  }));
  if (day.directorName) slots.unshift({role:'Dirigente',name:day.directorName});
  return slots;
}
function pdf(days) {
  const sections = days.map(day => ({
    title:dateText(day.date),
    rows:exportSlots(day).map(slot => ({role:roleLabel(slot.role),name:slot.name}))
  }));
  const period = days.length === 1 ? days[0].date : days[0].date+'-a-'+days.at(-1).date;
  download(pdfDocument(sections),'escala-'+period+'.pdf');
}
function excel(days) {
  const totals = new Map();
  const assignments = days.map(day => {
    const groups = new Map();
    for (const slot of exportSlots(day,'TB')) {
      if (!groups.has(slot.role)) groups.set(slot.role,[]);
      const names = groups.get(slot.role);
      names.push(slot.name);
      totals.set(slot.role,Math.max(totals.get(slot.role) || 0,names.length));
    }
    return groups;
  });
  const roles = [...totals.keys()].sort((a,b) => Number(b === 'Dirigente')-Number(a === 'Dirigente') || Number(isVocal(b))-Number(isVocal(a)));
  const rows = [];
  let vocalNumber = 0;
  for (const role of roles) {
    const count = totals.get(role);
    for (let index=0;index<count;index++) {
      const label = isVocal(role)
        ? 'Vocal '+String(++vocalNumber).padStart(2,'0')+' | '+role.slice('Vocal • '.length).toLocaleUpperCase('pt-BR')
        : roleLabel(role)+(count > 1 ? ' '+(index+1) : '');
      rows.push([label,...assignments.map(groups => groups.get(role)?.[index] || '—')]);
    }
  }
  const first = days[0].date, last = days.at(-1).date;
  const short = date => dateText(date,{dateStyle:'short'});
  const period = first === last ? short(first) : short(first)+' a '+short(last);
  const dates = days.map(day => dateText(day.date,{day:'2-digit',month:'2-digit'}));
  download(workbook({period,dates,rows}),`escala-${first}-a-${last}.xlsx`);
}
async function handleAction(action) {
  const [name,value] = action.split('/');
  switch (name) {
    case 'choose-login':
      loginRole = value || '';
      break;
    case 'demo':
      await load();
      me = value === 'integrante'
        ? {...state.people.find(person => person.id === 'a'),role:'integrante'}
        : {id:'demo-'+value,name:'Liderança do louvor',role:'lider'};
      defaultPage();
      break;
    case 'logout':
      paletteCache.clear();
      if (API_URL) await api('logout',{});
      sessionStorage.removeItem('louvor-token');
      token = ''; me = null; state = empty(); loginRole = '';
      break;
    case 'nav':
      if (API_URL) await load();
      page = value; selected = ''; edit = '';
      break;
    case 'password': page = 'password'; break;
    case 'edit': edit = value; break;
    case 'new': edit = ''; break;
    case 'remove-palette':
      if (!privileged() || !state.palettes?.[selected]) return;
      await savePalette(selected,null);
      notify('Imagem removida.');
      break;
    case 'remove-chords': {
      if (!privileged() || !state.chords?.[selected]) return;
      const next = structuredClone(state);
      delete next.chords[selected];
      await save(next);
      notify('Link das cifras removido.');
      break;
    }
    case 'remove-playlist': {
      if (!privileged() || !state.playlists?.[selected]) return;
      const next = structuredClone(state);
      delete next.playlists[selected];
      await save(next);
      notify('Playlist removida.');
      break;
    }
    case 'formation-default': formationMode = 'default'; break;
    case 'formation-specific': formationMode = 'specific'; break;
    case 'formation-reset': {
      const next = structuredClone(state);
      delete next.exceptions[formationDate];
      await save(next); notify('Formação padrão restaurada para a data.');
      break;
    }
    case 'delete-drafts':
    case 'delete-published': {
      if (!privileged()) return;
      const kind = name === 'delete-drafts' ? 'drafts' : 'published';
      if (!Object.hasOwn(state[kind],value)) return;
      const draft = kind === 'drafts';
      const label = draft ? 'o rascunho' : 'a escala publicada';
      const note = draft ? '' : ' Os integrantes deixarão de ver essa escala.';
      if (!confirm('Excluir '+label+' de '+dateText(value)+'?'+note)) return;
      await removeSchedules(kind,[value]);
      notify(draft ? 'Rascunho excluído.' : 'Escala publicada excluída.');
      break;
    }
    case 'pdf': pdf([state.published[value]]); return;
    case 'publish-day':
    case 'publish-all': {
      const next = structuredClone(state);
      const dates = name === 'publish-day' ? [selected] : Object.keys(next.drafts);
      for (const date of dates) {
        next.published[date] = publication(next.drafts[date]);
        delete next.drafts[date];
      }
      await save(next);
      page = 'published';
      notify('Escala publicada.');
      break;
    }
    case 'reset': {
      const password = prompt('Digite uma nova senha temporária com pelo menos 8 caracteres.');
      if (password === null) return;
      await api('reset',{id:value,password});
      notify('Senha temporária definida.');
      break;
    }
  }
  render();
}
async function handleSubmit(form,submitter) {
  const data = new FormData(form);
  const next = structuredClone(state);
  if (form.hasAttribute('data-director-playlist')) {
    const date = data.get('date');
    if (!me?.directorEligible || state.published[date]?.director !== me.id) return;
    const url = spotifyUrl(data.get('url'));
    if (!url) throw new Error('Informe o link da playlist.');
    if (API_URL) {
      await api('director-playlist',{date,url});
      await load();
    } else {
      next.playlists ??= {};
      next.playlists[date] = url;
      await save(next);
    }
    notify('Playlist salva.');
    render();
    return;
  }
  switch (form.id) {
    case 'login': {
      const result = await api('login',Object.fromEntries(data));
      token = result.token;
      await load();
      if (me.role !== loginRole && !(loginRole === 'lider' && me.role === 'admin')) {
        try { await api('logout',{}); }
        finally { token = ''; me = null; state = empty(); }
        throw new Error('A conta pertence a outro perfil. Selecione o perfil correspondente.');
      }
      sessionStorage.setItem('louvor-token',token);
      defaultPage();
      break;
    }
    case 'password':
      await api('password',Object.fromEntries(data));
      await load(); defaultPage(); notify('Senha atualizada.');
      break;
    case 'filter': filter = data.get('query'); break;
    case 'availability': {
      const dates = data.getAll('date');
      if (API_URL) {
        await api('availability',{month,dates});
        await load();
      } else {
        next.availability[me.id] = [...(next.availability[me.id] || []).filter(date => !date.startsWith(month)),...dates];
        next.responded ||= {};
        next.responded[me.id] = [...(next.responded[me.id] || []),...Array.from({length:31},(_,i) => shift(month+'-01',i)).filter(date => date.startsWith(month))];
        await save(next);
      }
      notify('Disponibilidade salva.');
      break;
    }
    case 'palette':
      if (!privileged()) return;
      validateSunday(selected);
      await savePalette(selected,await preparePalette(data.get('image')));
      notify('Imagem da paleta salva.');
      break;
    case 'chords': {
      if (!privileged()) return;
      validateSunday(selected);
      let url;
      try { url = new URL(data.get('url').trim()); }
      catch { throw new Error('Informe um link HTTPS válido para as cifras.'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
        throw new Error('Informe um link HTTPS válido para as cifras.');
      }
      next.chords ??= {};
      next.chords[selected] = url.href;
      await save(next);
      notify('Link das cifras salvo.');
      break;
    }
    case 'playlist': {
      if (!privileged()) return;
      const date = data.get('date');
      validateSunday(date);
      const url = spotifyUrl(data.get('url'));
      if (!url) throw new Error('Informe o link da playlist.');
      next.playlists ??= {};
      next.playlists[date] = url;
      await save(next);
      selected = date;
      notify('Playlist salva.');
      break;
    }
    case 'formation': {
      const formation = Object.fromEntries([...data].map(([role,count]) => [role,Number(count)]));
      if (formationMode === 'specific') { validateSunday(formationDate); next.exceptions[formationDate] = formation; }
      else next.formation = formation;
      await save(next); notify('Formação salva. Aplique-a em uma nova geração para atualizar o rascunho.');
      break;
    }
    case 'instrument': {
      const name = data.get('instrumentName').trim().replace(/\s+/g,' ');
      if (!name || name.length > 60 || !/[\p{L}\p{N}]/u.test(name) || isVocal(name) || ['talkback','constructor','prototype','__proto__'].includes(normalizeInstrument(name))) {
        throw new Error('Informe um nome válido para o instrumento.');
      }
      if (instrumentCatalog().some(role => [role,roleLabel(role)].some(label => normalizeInstrument(label) === normalizeInstrument(name)))) {
        throw new Error('Este instrumento já está cadastrado.');
      }
      next.customInstruments = [...(next.customInstruments || []),name];
      await save(next); notify('Instrumento adicionado à formação e ao cadastro de integrantes.');
      break;
    }
    case 'person': {
      const person = {id:edit || crypto.randomUUID(),name:data.get('name').trim(),email:data.get('email').trim(),role:data.get('role'),voice:data.get('voice'),instruments:data.getAll('instrument'),talk:data.has('talk'),directorEligible:data.has('directorEligible'),active:data.has('active')};
      if (person.talk && !person.instruments.length) throw new Error('Selecione pelo menos um instrumento para habilitar o talkback.');
      if (API_URL) {
        await api('person',{...person,password:data.get('password')});
        await load();
      } else {
        next.people = [...next.people.filter(item => item.id !== person.id),person];
        await save(next);
      }
      edit = ''; notify('Cadastro salvo.');
      break;
    }
    case 'generate': {
      const start = data.get('start');
      validateSunday(start);
      const dates = Array.from({length:Number(data.get('count'))},(_,i) => shift(start,i*7));
      if (dates.some(date => next.drafts[date] || next.published[date]) && !confirm('Este período inclui escalas existentes. Substituir os rascunhos? O conteúdo publicado permanecerá visível até a próxima publicação.')) return;
      const counts = {};
      for (const date of dates) {
        const formation = next.exceptions[date] || next.formation;
        if (!Object.values(formation).some(Boolean)) throw new Error('Configure pelo menos uma vaga para '+dateText(date)+'.');
        next.drafts[date] = generate(date,formation,next.people,next.availability,counts);
      }
      await save(next); selected = start; notify('Rascunho gerado.');
      break;
    }
    case 'delete-published-batch': {
      if (!privileged()) return;
      const dates = [...new Set(data.getAll('publishedDate'))].filter(date => Object.hasOwn(state.published,date));
      const count = dates.length;
      if (!count) return;
      const label = count === 1 ? '1 escala publicada' : count+' escalas publicadas';
      if (!confirm(`Excluir ${label}? As escalas selecionadas deixarão de aparecer para os integrantes.`)) return;
      await removeSchedules('published',dates);
      notify(count === 1 ? 'Escala publicada excluída.' : `${count} escalas publicadas excluídas.`);
      break;
    }
    case 'export': {
      exportStart = data.get('start'); exportEnd = data.get('end');
      if (exportStart > exportEnd) throw new Error('A data inicial deve ser anterior ou igual à final.');
      const days = Object.values(state.published).filter(day => day.date >= exportStart && day.date <= exportEnd).sort((a,b) => a.date.localeCompare(b.date));
      if (!days.length) throw new Error('Nenhuma escala publicada no período escolhido.');
      if (submitter.value === 'xlsx') excel(days); else pdf(days);
      return;
    }
  }
  render();
}
async function handleChange(target) {
  if (target.id === 'playlist-date' || target.id === 'playlist-saved') {
    if (!target.value) return;
    try { validateSunday(target.value); }
    catch (error) { target.value = selected; throw error; }
    selected = target.value;
    render();
    return;
  }

  if (target.id === 'month') { if (target.value) month = target.value; render(); return; }
  if (target.id === 'formation-date' || target.id === 'formation-saved') {
    try { if (target.value) validateSunday(target.value); }
    catch (error) { target.value = formationDate; throw error; }
    formationDate = target.value; render(); return;
  }
  if (target.id === 'review-date') { selected = target.value; render(); return; }
  if (!target.matches('[data-slot]')) return;
  const next = structuredClone(state);
  const day = next.drafts[selected];
  if (target.dataset.slot === 'director') day.director = target.value;
  else if (target.dataset.slot === 'talk') day.talk = target.value;
  else {
    const index = Number(target.dataset.slot);
    const previous = day.slots[index].person;
    const vocal = isVocal(day.slots[index].role);
    day.slots[index].person = target.value;
    if (vocal && previous && previous !== target.value) {
      const doubled = day.slots.find(slot => slot.role === 'Violão' && slot.person === previous);
      if (doubled) doubled.person = '';
    }
    if (!talkback(day,next.people).some(person => person.id === day.talk)) day.talk = '';
  }
  await save(next); render();
}
let busy = false;
async function run(operation) {
  if (busy) return;
  busy = true;
  const mainControls = [...document.querySelectorAll('button,select')].filter(control => !control.disabled);
  mainControls.forEach(control => control.disabled = true);
  try { await operation(); }
  catch (error) {
    if (error.message.includes('Atualize a tela')) { await load().catch(() => {}); render(); }
    notify(error.message);
  }
  finally { mainControls.forEach(control => control.disabled = false); busy = false; }
}
document.addEventListener('click',event => {
  const control = event.target.closest('[data-action]');
  if (control) run(() => handleAction(control.dataset.action));
});
document.addEventListener('submit',event => {
  event.preventDefault();
  run(() => handleSubmit(event.target,event.submitter));
});
document.addEventListener('change',event => {
  if (event.target.matches('#mark-all-published,[name="publishedDate"]')) updatePublishedSelection(event.target);
  if (event.target.matches('#playlist-date,#playlist-saved,#month,#formation-date,#formation-saved,#review-date,[data-slot]')) run(() => handleChange(event.target));
});
if (API_URL && token) {
  try { await load(); defaultPage(); }
  catch { token = ''; sessionStorage.removeItem('louvor-token'); }
}
render();
