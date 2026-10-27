// 个人工作台 · 前端逻辑
// 所有数据通过 /api/state 读写，保存在本机 data/workbench.json

const $ = (id) => document.getElementById(id);

const state = {
  data: null,
  filter: 'active',
  noteFilter: '',
  focusMinutes: 25,
  focusLeft: 25 * 60,
  focusRunning: false,
  focusTimer: null,
  dirty: false,
  saving: false,
  saveTimer: null,
  clockTimer: null,
  eventTimer: null,
};

const PRIORITY_LABEL = { high: '高', normal: '中', low: '低' };
const NOTE_TAGS = { idea: '灵感', note: '笔记', todo: '备忘' };

/* ---------------- 基础工具 ---------------- */

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setSync(text, kind) {
  const el = $('sync-state');
  el.textContent = text;
  el.className = 'chip' + (kind ? ' ' + kind : '');
}

/* ---------------- 读写 ---------------- */

async function loadState() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('读取数据失败');
  state.data = await res.json();
  normalize();
}

function normalize() {
  const d = state.data;
  d.todos = Array.isArray(d.todos) ? d.todos : [];
  d.events = Array.isArray(d.events) ? d.events : [];
  d.notes = Array.isArray(d.notes) ? d.notes : [];
  d.links = Array.isArray(d.links) ? d.links : [];
  d.habits = Array.isArray(d.habits) ? d.habits : [];
  d.tools = Array.isArray(d.tools) ? d.tools : [];
  d.focus = d.focus && typeof d.focus === 'object' ? d.focus : { sessions: [], totalMinutes: 0 };
  d.focus.sessions = Array.isArray(d.focus.sessions) ? d.focus.sessions : [];
  d.settings = d.settings && typeof d.settings === 'object' ? d.settings : { name: '', greeting: '' };
}

function scheduleSave() {
  state.dirty = true;
  setSync('保存中…', 'saving');
  clearTimeout(state.saveTimer);
  // 编辑时合并写入，避免每敲一个键就存一次
  state.saveTimer = setTimeout(saveNow, 600);
}

async function saveNow() {
  if (!state.dirty || state.saving) return;
  state.saving = true;
  state.dirty = false;
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state.data),
    });
    if (!res.ok) throw new Error('保存失败');
    setSync('已保存');
  } catch (error) {
    state.dirty = true;
    setSync('保存失败', 'error');
    toast('保存失败：' + (error.message || error));
  } finally {
    state.saving = false;
  }
}

/* ---------------- 今日概览 ---------------- */

function renderToday() {
  const now = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  $('today-label').textContent = `${todayKey()} ${week}`;

  const hour = now.getHours();
  let greet = '晚上好';
  if (hour < 6) greet = '夜深了';
  else if (hour < 11) greet = '早上好';
  else if (hour < 14) greet = '中午好';
  else if (hour < 18) greet = '下午好';
  const name = state.data.settings.name ? '，' + state.data.settings.name : '';
  $('greeting').textContent = `${greet}${name}，${now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} ${week}`;

  const todos = state.data.todos;
  const active = todos.filter((t) => !t.done).length;
  const doneToday = todos.filter((t) => t.done && t.doneAt && todayKey(new Date(t.doneAt)) === todayKey()).length;

  const upcoming = state.data.events
    .map((e) => ({ ...e, at: new Date(e.at) }))
    .filter((e) => e.at.getTime() >= Date.now())
    .sort((a, b) => a.at - b.at);

  const focusToday = state.data.focus.sessions.filter((s) => todayKey(new Date(s.at)) === todayKey());
  const focusMinutes = focusToday.reduce((sum, s) => sum + (s.minutes || 0), 0);

  const total = todos.length;
  const done = todos.filter((t) => t.done).length;
  const ratio = total ? Math.round((done / total) * 100) : 0;

  const stats = [
    ['今天要做的', active, '件'],
    ['今日完成', doneToday, '件'],
    ['最近日程', upcoming.length ? upcoming[0].title : '—', ''],
    ['今日专注', focusMinutes, '分钟'],
    ['未完成待办', active, '件'],
    ['习惯打卡', state.data.habits.filter((h) => (h.days || []).includes(todayKey())).length, '个'],
  ];
  $('stats').innerHTML = stats
    .slice(0, 3)
    .concat(stats.slice(3, 6))
    .map(
      ([label, value, unit]) =>
        `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}<small>${esc(unit)}</small></div></div>`,
    )
    .join('');

  $('todo-ratio').textContent = ratio + '%';
  $('todo-bar').style.width = ratio + '%';

  const quotes = [
    '把大的事情切成小的，今天只做下一步。',
    '专注 25 分钟，比焦虑 1 小时有用。',
    '先做最重要的一件，其余的会变轻。',
    '记录下来的想法，才真正属于你。',
    '今天的完成度不重要，开始重要。',
  ];
  const seed = now.getFullYear() * 1000 + now.getMonth() * 40 + now.getDate();
  $('quote').textContent = quotes[seed % quotes.length];
}

/* ---------------- 日程 ---------------- */

function renderEvents() {
  const list = $('event-list');
  const now = Date.now();
  const items = state.data.events
    .map((e) => ({ ...e, at: new Date(e.at) }))
    .sort((a, b) => a.at - b.at);

  const upcoming = items.filter((e) => e.at.getTime() >= now);
  const shown = [...upcoming, ...items.filter((e) => e.at.getTime() < now).slice(-2)];
  if (!shown.length) {
    list.innerHTML = '<div class="empty">还没有日程。加一个重要的节点，让倒计时替你记住它。</div>';
    $('event-hint').textContent = '点击「添加」创建';
    return;
  }
  $('event-hint').textContent = upcoming.length ? `接下来 ${upcoming.length} 项` : '没有未到期的日程';

  list.innerHTML = shown
    .map((e) => {
      const diff = e.at.getTime() - now;
      const past = diff < 0;
      const days = Math.floor(Math.abs(diff) / 86400000);
      const hours = Math.floor((Math.abs(diff) % 86400000) / 3600000);
      const mins = Math.floor((Math.abs(diff) % 3600000) / 60000);
      let big = '';
      let sub = '';
      if (past) {
        big = `${days}${days > 0 ? '<small>天前</small>' : ''}`;
        sub = `${hours} 小时前`;
      } else if (days > 0) {
        big = `${days}<small>天</small>`;
        sub = `${hours} 小时后`;
      } else if (hours > 0) {
        big = `${hours}<small>小时</small>`;
        sub = `${mins} 分钟后`;
      } else if (mins > 0) {
        big = `${mins}<small>分钟</small>`;
        sub = '即将开始';
      } else {
        big = '刚刚';
        sub = '进行中';
      }
      const soon = !past && diff < 86400000 * 2;
      const dateText = e.at.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="event ${past ? 'past' : ''}" data-id="${esc(e.id)}">
        <div class="event-time">
          <div class="event-days ${soon ? 'soon' : ''}">${big}</div>
          <div class="event-date">${esc(dateText)}</div>
        </div>
        <div class="event-body"><div class="event-title" title="${esc(e.title)}">${esc(e.title)}</div>
          <div class="muted">${esc(sub)}</div></div>
        <div class="event-actions">
          <button class="icon-btn" data-act="edit" title="编辑">✎</button>
          <button class="icon-btn" data-act="del" title="删除">✕</button>
        </div>
      </div>`;
    })
    .join('');
}

function addEvent() {
  const title = $('event-title').value.trim();
  const at = $('event-datetime').value;
  if (!title) {
    toast('先写事件名称');
    return;
  }
  if (!at) {
    toast('选择事件时间');
    return;
  }
  state.data.events.push({ id: uid('e'), title, at: new Date(at).toISOString() });
  $('event-title').value = '';
  $('event-datetime').value = '';
  scheduleSave();
  renderEvents();
  renderToday();
}

/* ---------------- 待办 ---------------- */

function renderTodos() {
  const list = $('todo-list');
  const filter = state.filter;
  let todos = [...state.data.todos];
  if (filter === 'active') todos = todos.filter((t) => !t.done);
  if (filter === 'done') todos = todos.filter((t) => t.done);
  const order = { high: 0, normal: 1, low: 2 };
  todos.sort((a, b) => (order[a.priority] - order[b.priority]) || (a.createdAt || 0) - (b.createdAt || 0));

  if (!todos.length) {
    list.innerHTML = '<li class="empty">这里空着。写下第一件要完成的小事。</li>';
    return;
  }
  list.innerHTML = todos
    .map(
      (t) => `<li class="todo ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
        <button class="check" data-act="toggle" title="${t.done ? '标记未完成' : '标记完成'}">${t.done ? '✓' : ''}</button>
        <span class="todo-text" data-act="edit" title="双击编辑">${esc(t.text)}</span>
        <span class="prio prio-${esc(t.priority || 'normal')}">${PRIORITY_LABEL[t.priority || 'normal']}</span>
        <button class="icon-btn" data-act="del" title="删除">✕</button>
      </li>`,
    )
    .join('');
}

function addTodo() {
  const input = $('todo-input');
  const text = input.value.trim();
  if (!text) return;
  state.data.todos.push({
    id: uid('t'),
    text,
    done: false,
    priority: $('todo-priority').value,
    createdAt: Date.now(),
    doneAt: null,
  });
  input.value = '';
  scheduleSave();
  renderTodos();
  renderToday();
}

function startEditTodo(li) {
  const todo = state.data.todos.find((t) => t.id === li.dataset.id);
  if (!todo) return;
  const span = li.querySelector('.todo-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = todo.text;
  span.replaceWith(input);
  input.focus();
  input.select();
  const finish = (save) => {
    if (save) {
      const value = input.value.trim();
      if (value) todo.text = value;
    }
    scheduleSave();
    renderTodos();
    renderToday();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---------------- 习惯 ---------------- */

function lastDays(count) {
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(todayKey(d));
  }
  return days;
}

function renderHabits() {
  const list = $('habit-list');
  if (!state.data.habits.length) {
    list.innerHTML = '<li class="empty">还没有习惯。加一个你想坚持的小动作，比如喝水、背单词。</li>';
    return;
  }
  const days = lastDays(7);
  const today = todayKey();
  list.innerHTML = state.data.habits
    .map((h) => {
      const marked = Array.isArray(h.days) ? h.days : [];
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (marked.includes(todayKey(d))) streak++;
        else if (i > 0) break;
      }
      const cells = days
        .map(
          (d) =>
            `<button class="habit-day ${marked.includes(d) ? 'on' : ''} ${d === today ? 'today' : ''}" data-act="toggle" data-day="${d}" title="${d}"></button>`,
        )
        .join('');
      return `<li class="habit" data-id="${esc(h.id)}">
        <span class="habit-name" title="${esc(h.name)}">${esc(h.name)}</span>
        <div class="habit-days">${cells}</div>
        <span class="habit-streak">${streak ? '🔥' + streak + '天' : ''}</span>
        <button class="icon-btn" data-act="del" title="删除">✕</button>
      </li>`;
    })
    .join('');
}

/* ---------------- 工具 ---------------- */

function defaultTools() {
  return [
    { id: uid('tool'), name: 'DeepSeek', url: 'https://chat.deepseek.com' },
    { id: uid('tool'), name: 'GitHub', url: 'https://github.com' },
    { id: uid('tool'), name: '翻译', url: 'https://fanyi.baidu.com' },
    { id: uid('tool'), name: '日历', url: 'https://calendar.google.com' },
  ];
}

function renderTools() {
  const box = $('tools');
  const tools = state.data.tools;
  if (!tools.length) {
    box.innerHTML = '<div class="empty">加几个常用网站，点一下就打开。</div>';
    return;
  }
  box.innerHTML = tools
    .map(
      (t) => `<a class="tool" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" title="${esc(t.url)}">
        <span>${esc(t.name)}</span><span class="del" data-act="del" data-id="${esc(t.id)}" title="移除">✕</span>
      </a>`,
    )
    .join('');
}

/* ---------------- 便笺 ---------------- */

function renderNotes() {
  const box = $('note-list');
  let notes = [...state.data.notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (state.noteFilter) notes = notes.filter((n) => n.type === state.noteFilter);
  if (!notes.length) {
    box.innerHTML = '<div class="empty">没有便笺。随手记下想法，回头再看。</div>';
    return;
  }
  box.innerHTML = notes
    .map((n) => {
      const time = n.updatedAt
        ? new Date(n.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      return `<div class="note type-${esc(n.type || 'note')}" data-id="${esc(n.id)}">
        <div class="note-head"><span class="note-title">${esc(n.title || '未命名')}</span><span class="note-time">${esc(time)}</span></div>
        ${n.body ? `<div class="note-body">${esc(n.body)}</div>` : ''}
        <span class="note-tag">${esc(NOTE_TAGS[n.type || 'note'])}</span>
      </div>`;
    })
    .join('');
}

/* ---------------- 收藏 ---------------- */

function renderLinks() {
  const box = $('link-list');
  if (!state.data.links.length) {
    box.innerHTML = '<div class="empty">收藏常用页面，省去每次翻历史记录。</div>';
    return;
  }
  box.innerHTML = state.data.links
    .map((l) => {
      let host = l.url;
      try {
        host = new URL(l.url).hostname.replace(/^www\./, '');
      } catch {
        /* 原样显示 */
      }
      return `<a class="link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-id="${esc(l.id)}">
        <span class="link-favicon">${esc((l.title || host || '?').slice(0, 1).toUpperCase())}</span>
        <span class="link-body"><span class="link-title">${esc(l.title || host)}</span><span class="link-host">${esc(host)}</span></span>
        <button class="icon-btn" data-act="del" title="删除">✕</button>
      </a>`;
    })
    .join('');
}

/* ---------------- 专注计时 ---------------- */

const RING_LEN = 2 * Math.PI * 68;

function renderFocus() {
  const total = state.focusMinutes * 60;
  const left = Math.max(0, state.focusLeft);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  $('focus-time').textContent = `${mm}:${ss}`;
  const ratio = total ? 1 - left / total : 1;
  const ring = $('ring-fg');
  ring.style.strokeDasharray = String(RING_LEN);
  ring.style.strokeDashoffset = String(RING_LEN * (1 - ratio));
  ring.style.stroke = state.focusRunning ? 'var(--accent)' : state.focusLeft === 0 ? 'var(--ok)' : 'var(--accent-2)';

  const today = todayKey();
  const sessionsToday = state.data.focus.sessions.filter((s) => todayKey(new Date(s.at)) === today);
  const minutesToday = sessionsToday.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const allMinutes = state.data.focus.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  $('focus-today').textContent = minutesToday;
  $('focus-count').textContent = sessionsToday.length;

  // 最近 7 天的专注柱状图
  const days = lastDays(7);
  const values = days.map((d) =>
    state.data.focus.sessions
      .filter((s) => todayKey(new Date(s.at)) === d)
      .reduce((sum, s) => sum + (s.minutes || 0), 0),
  );
  const max = Math.max(25, ...values);
  $('focus-bars').innerHTML = days
    .map((d, i) => {
      const h = Math.max(3, Math.round((values[i] / max) * 46));
      const isToday = d === today;
      const label = isToday ? '今' : d.slice(8);
      return `<div class="focus-bar ${isToday ? 'today' : ''}" style="height:${h}px" title="${d} · ${values[i]} 分钟"><span>${label}</span></div>`;
    })
    .join('');
  $('focus-state').textContent = state.focusRunning ? '专注中…' : state.focusLeft === 0 ? '本轮完成' : '准备开始';
  $('focus-toggle').textContent = state.focusRunning ? '暂停' : state.focusLeft === 0 ? '再来一轮' : '开始专注';
  if (!state.focusRunning && state.focusLeft === 0) $('focus-state').textContent = '完成一轮，休息一下';
}

function tickFocus() {
  if (!state.focusRunning) return;
  state.focusLeft -= 1;
  if (state.focusLeft <= 0) {
    state.focusLeft = 0;
    state.focusRunning = false;
    clearInterval(state.focusTimer);
    state.focusTimer = null;
    state.data.focus.sessions.push({ id: uid('s'), minutes: state.focusMinutes, at: new Date().toISOString() });
    scheduleSave();
    renderToday();
    toast(`完成一轮 ${state.focusMinutes} 分钟专注 🎉`);
  }
  renderFocus();
}

function toggleFocus() {
  if (state.focusRunning) {
    state.focusRunning = false;
    clearInterval(state.focusTimer);
    state.focusTimer = null;
    renderFocus();
    return;
  }
  if (state.focusLeft === 0) state.focusLeft = state.focusMinutes * 60;
  state.focusRunning = true;
  state.focusTimer = setInterval(tickFocus, 1000);
  renderFocus();
}

function setFocusMinutes(min) {
  state.focusMinutes = min;
  state.focusRunning = false;
  clearInterval(state.focusTimer);
  state.focusTimer = null;
  state.focusLeft = min * 60;
  renderFocus();
}

/* ---------------- 弹窗 ---------------- */

let modalAction = null;

function openModal(title, fields, onSave) {
  $('modal-title').textContent = title;
  const body = $('modal-body');
  body.innerHTML = fields
    .map((f) => {
      const value = f.value == null ? '' : f.value;
      if (f.type === 'textarea') {
        return `<div class="field"><label>${esc(f.label)}</label><textarea id="m-${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(value)}</textarea></div>`;
      }
      if (f.type === 'select') {
        return `<div class="field"><label>${esc(f.label)}</label><select id="m-${f.name}">${f.options
          .map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`)
          .join('')}</select></div>`;
      }
      return `<div class="field"><label>${esc(f.label)}</label><input id="m-${f.name}" type="${f.type || 'text'}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" /></div>`;
    })
    .join('');
  modalAction = () => {
    const values = {};
    for (const f of fields) {
      const el = $('m-' + f.name);
      values[f.name] = el ? el.value : '';
    }
    onSave(values);
  };
  $('modal').hidden = false;
  const first = body.querySelector('input,textarea,select');
  if (first) first.focus();
}

function closeModal() {
  $('modal').hidden = true;
  modalAction = null;
}

/* ---------------- 事件绑定 ---------------- */

function bind() {
  // 顶栏
  $('btn-export').addEventListener('click', () => {
    window.location.href = '/api/export';
    toast('正在导出数据文件');
  });
  $('btn-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') throw new Error('文件格式不对');
        state.data = { ...state.data, ...parsed };
        normalize();
        state.dirty = true;
        await saveNow();
        renderAll();
        toast('数据已导入');
      } catch (error) {
        toast('导入失败：' + (error.message || error));
      }
    });
    input.click();
  });
  $('btn-settings').addEventListener('click', () => {
    openModal(
      '设置',
      [
        { name: 'name', label: '怎么称呼你', value: state.data.settings.name || '', placeholder: '例如：小鲸' },
      ],
      (values) => {
        state.data.settings.name = values.name.trim();
        scheduleSave();
        renderToday();
        closeModal();
        toast('已保存');
      },
    );
  });

  // 日程
  $('event-add').addEventListener('click', addEvent);
  $('event-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addEvent();
  });
  $('event-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const box = e.target.closest('.event');
    if (!box) return;
    const item = state.data.events.find((x) => x.id === box.dataset.id);
    if (!item) return;
    if (btn && btn.dataset.act === 'del') {
      state.data.events = state.data.events.filter((x) => x.id !== item.id);
      scheduleSave();
      renderEvents();
      renderToday();
      return;
    }
    if (btn && btn.dataset.act === 'edit') {
      const local = new Date(item.at);
      const pad = (n) => String(n).padStart(2, '0');
      const value = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
      openModal(
        '编辑日程',
        [
          { name: 'title', label: '事件名称', value: item.title },
          { name: 'at', label: '时间', type: 'datetime-local', value },
        ],
        (values) => {
          if (!values.title.trim() || !values.at) {
            toast('名称和时间都要填');
            return;
          }
          item.title = values.title.trim();
          item.at = new Date(values.at).toISOString();
          scheduleSave();
          renderEvents();
          renderToday();
          closeModal();
        },
      );
    }
  });

  // 待办
  $('todo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTodo();
  });
  $('todo-filter').addEventListener('change', (e) => {
    state.filter = e.target.value;
    renderTodos();
  });
  $('todo-clear-done').addEventListener('click', () => {
    const before = state.data.todos.length;
    state.data.todos = state.data.todos.filter((t) => !t.done);
    if (before === state.data.todos.length) {
      toast('没有已完成的事项');
      return;
    }
    scheduleSave();
    renderTodos();
    renderToday();
    toast('已清除完成项');
  });
  $('todo-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const li = e.target.closest('.todo');
    if (!li) return;
    const todo = state.data.todos.find((t) => t.id === li.dataset.id);
    if (!todo) return;
    if (btn && btn.dataset.act === 'toggle') {
      todo.done = !todo.done;
      todo.doneAt = todo.done ? Date.now() : null;
      scheduleSave();
      renderTodos();
      renderToday();
    }
    if (btn && btn.dataset.act === 'del') {
      state.data.todos = state.data.todos.filter((t) => t.id !== todo.id);
      scheduleSave();
      renderTodos();
      renderToday();
    }
  });
  $('todo-list').addEventListener('dblclick', (e) => {
    const text = e.target.closest('.todo-text');
    if (!text) return;
    startEditTodo(text.closest('.todo'));
  });

  // 习惯
  $('habit-add').addEventListener('click', () => {
    openModal('新习惯', [{ name: 'name', label: '习惯名称', placeholder: '例如：早睡、读书 20 分钟' }], (values) => {
      const name = values.name.trim();
      if (!name) {
        toast('写个名字吧');
        return;
      }
      state.data.habits.push({ id: uid('h'), name, days: [] });
      scheduleSave();
      renderHabits();
      renderToday();
      closeModal();
    });
  });
  $('habit-list').addEventListener('click', (e) => {
    const li = e.target.closest('.habit');
    if (!li) return;
    const habit = state.data.habits.find((h) => h.id === li.dataset.id);
    if (!habit) return;
    const btn = e.target.closest('button[data-act]');
    if (btn && btn.dataset.act === 'toggle') {
      const day = btn.dataset.day;
      habit.days = Array.isArray(habit.days) ? habit.days : [];
      if (habit.days.includes(day)) habit.days = habit.days.filter((d) => d !== day);
      else habit.days.push(day);
      scheduleSave();
      renderHabits();
      renderToday();
    }
    if (btn && btn.dataset.act === 'del') {
      state.data.habits = state.data.habits.filter((h) => h.id !== habit.id);
      scheduleSave();
      renderHabits();
      renderToday();
    }
  });

  // 工具
  $('tool-add').addEventListener('click', () => {
    openModal(
      '添加常用工具',
      [
        { name: 'name', label: '名称', placeholder: '例如：翻译' },
        { name: 'url', label: '网址', type: 'url', placeholder: 'https://' },
      ],
      (values) => {
        if (!values.name.trim() || !values.url.trim()) {
          toast('名称和网址都要填');
          return;
        }
        let url = values.url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        state.data.tools.push({ id: uid('tool'), name: values.name.trim(), url });
        scheduleSave();
        renderTools();
        closeModal();
      },
    );
  });
  $('tools').addEventListener('click', (e) => {
    const del = e.target.closest('.del');
    if (!del) return;
    e.preventDefault();
    e.stopPropagation();
    state.data.tools = state.data.tools.filter((t) => t.id !== del.dataset.id);
    scheduleSave();
    renderTools();
  });

  // 便笺
  $('note-add').addEventListener('click', () => {
    openModal(
      '新建便笺',
      [
        { name: 'title', label: '标题', placeholder: '一句话概括' },
        { name: 'type', label: '类型', type: 'select', value: 'idea', options: [
          { value: 'idea', label: '灵感' },
          { value: 'note', label: '笔记' },
          { value: 'todo', label: '备忘' },
        ] },
        { name: 'body', label: '内容', type: 'textarea', rows: 6, placeholder: '随手写点什么…' },
      ],
      (values) => {
        const title = values.title.trim();
        const body = values.body.trim();
        if (!title && !body) {
          toast('写点内容再保存');
          return;
        }
        state.data.notes.push({
          id: uid('n'),
          title: title || body.slice(0, 20),
          body,
          type: values.type,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        scheduleSave();
        renderNotes();
        closeModal();
        toast('已保存便笺');
      },
    );
  });
  $('note-filter').addEventListener('change', (e) => {
    state.noteFilter = e.target.value;
    renderNotes();
  });
  $('note-list').addEventListener('click', (e) => {
    const box = e.target.closest('.note');
    if (!box) return;
    const note = state.data.notes.find((n) => n.id === box.dataset.id);
    if (!note) return;
    openModal(
      '编辑便笺',
      [
        { name: 'title', label: '标题', value: note.title },
        { name: 'type', label: '类型', type: 'select', value: note.type || 'note', options: [
          { value: 'idea', label: '灵感' },
          { value: 'note', label: '笔记' },
          { value: 'todo', label: '备忘' },
        ] },
        { name: 'body', label: '内容', type: 'textarea', rows: 8, value: note.body },
      ],
      (values) => {
        note.title = values.title.trim() || (values.body.trim().slice(0, 20) || '未命名');
        note.body = values.body;
        note.type = values.type;
        note.updatedAt = Date.now();
        scheduleSave();
        renderNotes();
        closeModal();
      },
    );
  });

  // 收藏
  $('link-add').addEventListener('click', () => {
    openModal(
      '添加链接',
      [
        { name: 'title', label: '名称', placeholder: '例如：文档首页' },
        { name: 'url', label: '网址', type: 'url', placeholder: 'https://' },
      ],
      (values) => {
        if (!values.url.trim()) {
          toast('网址不能为空');
          return;
        }
        let url = values.url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        state.data.links.push({ id: uid('l'), title: values.title.trim() || url, url });
        scheduleSave();
        renderLinks();
        closeModal();
      },
    );
  });
  $('link-list').addEventListener('click', (e) => {
    const del = e.target.closest('.icon-btn');
    if (!del) return;
    e.preventDefault();
    e.stopPropagation();
    const link = e.target.closest('.link');
    state.data.links = state.data.links.filter((l) => l.id !== link.dataset.id);
    scheduleSave();
    renderLinks();
  });

  // 专注
  $('focus-toggle').addEventListener('click', toggleFocus);
  $('focus-reset').addEventListener('click', () => setFocusMinutes(state.focusMinutes));
  $('focus-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    for (const b of $('focus-seg').querySelectorAll('.seg-btn')) b.classList.toggle('active', b === btn);
    setFocusMinutes(Number(btn.dataset.min));
  });

  // 弹窗
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-ok').addEventListener('click', () => {
    if (modalAction) modalAction();
  });
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modal').hidden) closeModal();
    // Ctrl/Cmd + Enter 在弹窗里直接保存
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('modal').hidden && modalAction) modalAction();
  });

  // 离开页面前把没存完的数据写掉
  window.addEventListener('beforeunload', () => {
    if (state.dirty) {
      navigator.sendBeacon && navigator.sendBeacon('/api/state');
    }
  });
}

/* ---------------- 渲染入口 ---------------- */

function renderAll() {
  renderToday();
  renderEvents();
  renderTodos();
  renderHabits();
  renderTools();
  renderNotes();
  renderLinks();
  renderFocus();
}

function startClock() {
  const tick = () => {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(tick, 1000);
  // 日程倒计时每分钟刷新一次
  clearInterval(state.eventTimer);
  state.eventTimer = setInterval(() => {
    renderEvents();
    renderToday();
  }, 60000);
}

async function boot() {
  try {
    await loadState();
    if (!state.data.tools.length) {
      state.data.tools = defaultTools();
      state.dirty = true;
      saveNow();
    }
    const info = await fetch('/api/info')
      .then((r) => r.json())
      .catch(() => null);
    if (info && info.dataFile) $('data-path').textContent = info.dataFile;
    bind();
    renderAll();
    startClock();
  } catch (error) {
    setSync('加载失败', 'error');
    toast('加载失败：' + (error.message || error));
  }
}

boot();
